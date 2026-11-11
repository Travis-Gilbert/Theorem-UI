import { describe, expect, it } from 'bun:test'
import { answerBody, newerReview, selectionSummary } from './reviews'
import type { Review } from './reviews'

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
