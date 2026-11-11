import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test'
import { answerBody, newerReview, saveDraft, selectionSummary } from './reviews'
import type { Review, ReviewResponse } from './reviews'

describe('answerBody', () => {
  it('leaves out the line naming the review', () => {
    const text =
      'Review: Layout (chatreview_sha256:c2)\n\nPicked Close up.\n\nKeep the minimap.'
    expect(answerBody(text)).toBe('Picked Close up.\n\nKeep the minimap.')
  })

  it('leaves other text alone', () => {
    expect(answerBody('A Review: of the header')).toBe(
      'A Review: of the header',
    )
  })
})

describe('newerReview', () => {
  const review = (
    revision: number,
    status: Review['status'],
    draftReply?: string,
  ) =>
    ({
      schema: 'theorem-review/1',
      reviewId: 'r',
      threadId: 't',
      title: 'Layout',
      status,
      revision,
      createdAtMs: 0,
      options: [],
      draft:
        draftReply === undefined
          ? undefined
          : { pickedIds: [], none: false, observations: [], reply: draftReply },
    }) as Review

  it('keeps an answered review when an older draft save lands after it', () => {
    const answered = review(5, 'answered')
    expect(newerReview(answered, review(4, 'open', 'old'))).toBe(answered)
  })

  it('keeps the draft typed here over the one a save answered with', () => {
    const next = newerReview(
      review(3, 'open', 'typed since'),
      review(4, 'open', 'saved'),
    )
    expect(next.revision).toBe(4)
    expect(next.draft?.reply).toBe('typed since')
  })

  it('takes a newer closed review as it is', () => {
    const answered = review(6, 'answered')
    expect(newerReview(review(5, 'open', 'typed'), answered)).toBe(answered)
  })
})

describe('selectionSummary', () => {
  const review = {
    options: [
      { id: 'groups', title: 'Project groups', shots: [] },
      { id: 'compact', title: 'Compact list', shots: [] },
    ],
  } as unknown as Review
  const picked = (pickedIds: string[], none = false) => ({
    pickedIds,
    none,
    observations: [],
  })

  it("names the picks by letter, in the options' order", () => {
    expect(selectionSummary(review, picked(['compact', 'groups']))).toBe(
      'A + B selected',
    )
    expect(selectionSummary(review, picked(['compact']))).toBe('B selected')
  })

  it('says so when none of them is the answer, or nothing is chosen yet', () => {
    expect(selectionSummary(review, picked([], true))).toBe('None of these')
    expect(selectionSummary(review, picked([]))).toBe('Nothing selected')
  })
})

describe('saveDraft', () => {
  const picked: ReviewResponse = {
    pickedIds: ['a'],
    none: false,
    observations: [],
  }
  const withFeedback: ReviewResponse = { ...picked, reply: 'Keep the minimap.' }

  // The review's routes, served in-process. Each PUT waits for `answer`.
  type Put = {
    reviewId: string
    ifMatch: string | null
    body: ReviewResponse
    answer: (status: number, revision?: number) => void
  }
  const puts: Put[] = []
  let onRead: (reviewId: string) => number = () => 0
  const page = (
    window as unknown as { happyDOM: { setURL: (url: string) => void } }
  ).happyDOM
  let fetchSpy: ReturnType<typeof spyOn>
  beforeAll(() => {
    page.setURL('http://localhost:3000/')
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(((input, init) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL
          ? String(input)
          : input.url,
      )
      if (url.pathname.endsWith('/bootstrap'))
        return Promise.resolve(
          Response.json({ csrfToken: 'csrf', tenantId: 't' }),
        )
      const [reviewId = '', draft] = (
        url.pathname.split('/reviews/')[1] ?? ''
      ).split('/')
      if (!draft)
        return Promise.resolve(Response.json({ revision: onRead(reviewId) }))
      return new Promise<Response>((resolve) =>
        puts.push({
          reviewId,
          ifMatch: new Headers(init?.headers).get('If-Match'),
          body: JSON.parse(String(init?.body)) as ReviewResponse,
          answer: (status, revision) =>
            resolve(Response.json({ reviewId, revision }, { status })),
        }),
      )
    }) as typeof fetch)
  })
  afterAll(() => {
    fetchSpy.mockRestore()
    page.setURL('about:blank')
  })
  const sent = async (count: number) => {
    for (;;) {
      const put = puts[count - 1]
      if (put) return put
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  it('holds a second write until the first is answered, then sends what is written by then', async () => {
    puts.length = 0
    let written = picked
    // The pane saves a pick; the composer saves feedback before it is answered.
    const first = saveDraft('review-line', () => written, 1)
    const pick = await sent(1)
    written = withFeedback
    const second = saveDraft('review-line', () => written, 1)
    await new Promise((r) => setTimeout(r, 5))
    expect(puts).toHaveLength(1)

    pick.answer(200, 2)
    const feedback = await sent(2)
    feedback.answer(200, 3)
    await Promise.all([first, second])
    expect(puts.map(({ ifMatch, body }) => ({ ifMatch, body }))).toEqual([
      { ifMatch: '1', body: picked },
      { ifMatch: '2', body: withFeedback },
    ])
  })

  it('sends what is written now when a stale revision makes a write go again', async () => {
    puts.length = 0
    let written = picked
    // Feedback is written while the stale write is being turned away.
    onRead = () => {
      written = withFeedback
      return 6
    }
    const saving = saveDraft('review-stale', () => written, 4)
    ;(await sent(1)).answer(409)
    const again = await sent(2)
    again.answer(200, 7)
    expect((await saving).revision).toBe(7)
    expect({ ifMatch: again.ifMatch, body: again.body }).toEqual({
      ifMatch: '6',
      body: withFeedback,
    })
  })

  it('goes on to the next write after one fails', async () => {
    puts.length = 0
    const failed = saveDraft('review-fails', () => picked, 1)
    const next = saveDraft('review-fails', () => withFeedback, 1)
    ;(await sent(1)).answer(500)
    expect(failed).rejects.toThrow()
    ;(await sent(2)).answer(200, 2)
    expect((await next).revision).toBe(2)
  })
})
