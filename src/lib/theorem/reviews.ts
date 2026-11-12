// SOURCING: @tanstack/react-query and @tanstack/react-pacer (the debounced draft save) over lib/theorem/passthrough (the Reviews routes in docs/plans/thread-organization-and-review.md, which the vendored SDK has no client for yet), zustand for the dock's open function, as lib/theorem/delegations. The review's rules are translated from mikecann/threadbear@78b77e1 runner/src/reviews.ts (MIT, Mike Cann); Theorem enforces them.
import { useDebouncer } from '@tanstack/react-pacer/debouncer'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFileSrc } from '@/hooks/use-attachment-src'
import { create } from 'zustand'
import { hasStatus, mutate, theorem } from './client'
import { organizationKey } from './organization'
import { isNotServed, theoremJson } from './passthrough'

export type ReviewShot = {
  shotId: string
  title?: string
  mime: string
  width?: number
  height?: number
  sha256: string
  source:
    | { uploadId: string }
    | { artifactId: string; artifactRevision: string; documentId?: string }
}

export type ReviewOption = {
  id: string
  title: string
  note?: string
  /** Shown to compare against. It cannot be picked. */
  reference?: boolean
  /** What exists today, against which the others are new. */
  baseline?: boolean
  /** A live preview. The shots stay the record of what was shown. */
  url?: string
  shots: ReviewShot[]
}

export type ObservationKind = 'preference' | 'test_result' | 'bug_report'

export type ReviewObservation = {
  kind: ObservationKind
  optionId?: string
  text: string
}

export type ReviewResponse = {
  pickedIds: string[]
  none: boolean
  reply?: string
  observations: ReviewObservation[]
}

export type Review = {
  schema: 'theorem-review/1'
  reviewId: string
  threadId: string
  runId?: string
  messageId?: string
  title: string
  note?: string
  status: 'open' | 'answered' | 'cancelled'
  revision: number
  createdAtMs: number
  openedAtMs?: number
  closedAtMs?: number
  options: ReviewOption[]
  draft?: ReviewResponse
  answer?: ReviewResponse & { submittedAtMs: number; messageId: string }
}

const BASE = '/api/chat/v1'
const reviewPath = (reviewId: string) =>
  `${BASE}/reviews/${encodeURIComponent(reviewId)}`

const threadReviewsKey = (threadId: string) =>
  ['theorem', 'reviews', 'thread', threadId] as const
const reviewKey = (reviewId: string) =>
  ['theorem', 'reviews', 'one', reviewId] as const

export const EMPTY_RESPONSE: ReviewResponse = {
  pickedIds: [],
  none: false,
  observations: [],
}

/** Whether a response says anything yet: an empty one cannot be sent. */
export const canSubmit = (response: ReviewResponse) =>
  response.none ||
  response.pickedIds.length > 0 ||
  Boolean(response.reply?.trim()) ||
  response.observations.some((observation) => observation.text.trim())

/** Option labels: A, B, C, as the reply and the agent read them. */
export const optionLetter = (index: number) =>
  String.fromCharCode('A'.charCodeAt(0) + index)

/** A thread's reviews, newest first. A Theorem without the routes simply has none. */
export function useThreadReviews(threadId: string | undefined) {
  return useQuery({
    queryKey: threadReviewsKey(threadId ?? ''),
    enabled: Boolean(threadId),
    queryFn: async () => {
      try {
        const { items } = await theoremJson<{ items: Review[] }>(
          `${BASE}/threads/${encodeURIComponent(threadId!)}/reviews`,
        )
        return items
      } catch (error) {
        if (isNotServed(error)) return []
        throw error
      }
    },
    // A review arrives from the run, and nothing else tells this tab.
    refetchInterval: (query) =>
      query.state.data?.some((review) => review.status === 'open')
        ? 15_000
        : 8_000,
  })
}

export function useReview(reviewId: string | undefined) {
  return useQuery({
    queryKey: reviewKey(reviewId ?? ''),
    enabled: Boolean(reviewId),
    queryFn: () => theoremJson<Review>(reviewPath(reviewId!)),
  })
}

/** What is chosen so far, as the pane and the composer's target say it. */
export function selectionSummary(review: Review, response: ReviewResponse) {
  if (response.none) return 'None of these'
  const letters = review.options.flatMap((option, index) =>
    response.pickedIds.includes(option.id) ? [optionLetter(index)] : [],
  )
  return letters.length ? `${letters.join(' + ')} selected` : 'Nothing selected'
}

/**
 * The review to cache when Theorem answers with `incoming`. Answers can land out
 * of order, so one older than the cached revision is passed over. While the
 * review is open, the draft typed here stays, since a saved draft lags it.
 */
export function newerReview(
  cached: Review | undefined,
  incoming: Review,
): Review {
  if (!cached) return incoming
  if (cached.revision > incoming.revision) return cached
  return incoming.status === 'open' && cached.draft
    ? { ...incoming, draft: cached.draft }
    : incoming
}

function usePutReview() {
  const client = useQueryClient()
  return useCallback(
    (review: Review) => {
      client.setQueryData<Review>(reviewKey(review.reviewId), (cached) =>
        newerReview(cached, review),
      )
      void client.invalidateQueries({
        queryKey: threadReviewsKey(review.threadId),
      })
    },
    [client],
  )
}

/** Stamps opening and closing. Neither submits, and the draft stays. */
export function useReviewPresence(reviewId: string, enabled: boolean) {
  const put = usePutReview()
  useEffect(() => {
    if (!enabled) return
    const stamp = (edge: 'open' | 'close') =>
      mutate((headers) =>
        theoremJson<Review>(`${reviewPath(reviewId)}/${edge}`, {
          method: 'POST',
          headers,
        }),
      ).then(put)
    void stamp('open').catch(() => undefined)
    return () => void stamp('close').catch(() => undefined)
  }, [reviewId, enabled, put])
}

const putDraft = (
  reviewId: string,
  next: ReviewResponse,
  ifMatch?: { 'If-Match': string },
) =>
  mutate((headers) =>
    theoremJson<Review>(`${reviewPath(reviewId)}/draft`, {
      method: 'PUT',
      body: next,
      // Sent while the page goes away, it has to outlive the page.
      keepalive: true,
      headers: { ...headers, ...ifMatch },
    }),
  )

/** A draft is the person's own text, so a stale revision means read it again and save. */
async function writeDraft(
  reviewId: string,
  draft: () => ReviewResponse,
  revision: number,
) {
  const write = (expected: number) =>
    putDraft(reviewId, draft(), { 'If-Match': String(expected) })
  try {
    return await write(revision)
  } catch (error) {
    if (!hasStatus(error, 409)) throw error
    return write((await theoremJson<Review>(reviewPath(reviewId))).revision)
  }
}

/** Draft writes going out, by review, and the revision the last one answered with. */
const draftLines = new Map<
  string,
  { last: Promise<unknown>; revision: number }
>()

/**
 * Saves a review's draft after the writes already out for it. The pane and
 * every composer write the same review, so they wait in one line, as a
 * document's views do in apps.ts. `draft` is read as the write goes, and again
 * if a stale revision sends it twice: a write that waited never puts an older
 * response over a newer one.
 */
export function saveDraft(
  reviewId: string,
  draft: () => ReviewResponse,
  revision = 0,
): Promise<Review> {
  const line = draftLines.get(reviewId) ?? {
    last: Promise.resolve(),
    revision: 0,
  }
  draftLines.set(reviewId, line)
  const saved = line.last.then(async () => {
    const review = await writeDraft(
      reviewId,
      draft,
      Math.max(line.revision, revision),
    )
    line.revision = review.revision
    return review
  })
  line.last = saved.catch(() => undefined)
  return saved
}

/**
 * Responses being written here, by review. The pane (the choice) and the
 * composer (test results and bugs) write the same one, and what was chosen
 * here is never overwritten by a saved draft that lags it.
 */
const useDrafts = create<Readonly<Record<string, ReviewResponse | undefined>>>(
  () => ({}),
)

/** The response being written: kept here, saved as a draft shortly after each change. */
export function useReviewDraft(review: Review | undefined) {
  const client = useQueryClient()
  const put = usePutReview()
  const reviewId = review?.reviewId
  const written = useDrafts((drafts) =>
    reviewId ? drafts[reviewId] : undefined,
  )
  const response = written ?? review?.draft ?? EMPTY_RESPONSE
  const [saveError, setSaveError] = useState<unknown>()

  const revision = useRef(review?.revision)
  useEffect(() => {
    if (review) revision.current = review.revision
  }, [review])
  const leaving = useRef(false)
  const later = useRef<(id: string, next: ReviewResponse) => void>(undefined)
  const saver = useDebouncer(
    // The review is named with the write: the composer can stop answering it
    // before the write goes out.
    (id: string, next: ReviewResponse) => {
      // What is written here by the time a write goes, which can be later.
      const draft = () => useDrafts.getState()[id] ?? next
      // An answer carries what was chosen: a draft saved after it says nothing.
      const cached = client.getQueryData<Review>(reviewKey(id))
      if (cached && cached.status !== 'open') return
      // The page cannot wait for a write still out, or read a newer revision.
      if (leaving.current) {
        void putDraft(id, draft()).catch(() => undefined)
        return
      }
      // An answer on its way carries this too. Should it fail, save then.
      if (submitting.has(id)) {
        later.current?.(id, next)
        return
      }
      void saveDraft(id, draft, revision.current)
        .then((saved) => {
          setSaveError(undefined)
          put({ ...saved, draft: draft() })
        })
        .catch(setSaveError)
    },
    // Closing or detaching the pane unmounts it; neither loses what was typed.
    { wait: 400, onUnmount: (debouncer) => debouncer.flush() },
  )
  useEffect(() => {
    later.current = (id, next) => saver.maybeExecute(id, next)
    const flush = () => {
      leaving.current = true
      saver.flush()
      leaving.current = false
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [saver])

  const change = (next: ReviewResponse) => {
    if (!reviewId) return
    useDrafts.setState({ [reviewId]: next })
    client.setQueryData<Review>(
      reviewKey(reviewId),
      (old) => old && { ...old, draft: next },
    )
    saver.maybeExecute(reviewId, next)
  }
  /** The reply as the composer has it. Every composer on the page says the same, so only a new one is written. */
  const writeReply = (reply: string | undefined) => {
    if (!reviewId) return
    const current = useDrafts.getState()[reviewId] ?? response
    if (current.reply !== reply) change({ ...current, reply })
  }
  return { response, change, writeReply, saveError }
}

/** An answer's text without its first line, which tells the agent the review's id. */
export function answerBody(text: string) {
  return text.replace(/^Review: .*\n+/, '')
}

/** Reviews whose answer is on its way. */
const submitting = new Set<string>()

/** Sends the answer: Theorem writes it and the queued reply together, once, however often this retries. */
export function useSubmitReview(reviewId: string | undefined) {
  const put = usePutReview()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (response: ReviewResponse) => {
      const id = reviewId!
      submitting.add(id)
      return mutate((headers) =>
        theoremJson<Review>(`${reviewPath(id)}/submit`, {
          method: 'POST',
          body: response,
          headers,
        }),
      ).finally(() => submitting.delete(id))
    },
    onSuccess: (review) => {
      useDrafts.setState({ [review.reviewId]: undefined })
      put(review)
      void client.invalidateQueries({ queryKey: organizationKey })
    },
  })
}

/** Closes the review without messaging the agent. */
export function useCancelReview(reviewId: string) {
  const put = usePutReview()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () =>
      mutate((headers) =>
        theoremJson<Review>(`${reviewPath(reviewId)}/cancel`, {
          method: 'POST',
          headers,
        }),
      ),
    onSuccess: (review) => {
      put(review)
      void client.invalidateQueries({ queryKey: organizationKey })
    },
  })
}

/** A snapshot's bytes as an object URL, freed with the component. */
export function useShotUrl(reviewId: string, shotId: string | undefined) {
  const { data: blob, error } = useQuery({
    queryKey: ['theorem', 'reviews', 'shot', reviewId, shotId],
    enabled: Boolean(shotId),
    // Shots are snapshots, so their bytes never change.
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const response = await theorem().fetch(
        `${reviewPath(reviewId)}/shots/${encodeURIComponent(shotId!)}/content`,
      )
      if (!response.ok) throw new Error(`The image answered ${response.status}`)
      return response.blob()
    },
  })
  return { url: useFileSrc(blob), error }
}

/**
 * Where a review opens: the dock while it is mounted, the full-screen pane on
 * a phone. One surface per review, so opening again focuses it.
 */
export const useReviewDock = create<{
  /** Set while the desktop dock is mounted. */
  open?: (reviewId: string, options?: { quiet?: boolean }) => void
  close?: (reviewId: string) => void
  /** The review shown full screen when there is no dock. */
  phoneReviewId?: string
}>(() => ({}))

export function openReview(reviewId: string) {
  const { open } = useReviewDock.getState()
  if (open) open(reviewId)
  else useReviewDock.setState({ phoneReviewId: reviewId })
}

/** Puts the review's pane away, wherever it is open. */
export function closeReview(reviewId: string) {
  const { close, phoneReviewId } = useReviewDock.getState()
  close?.(reviewId)
  if (phoneReviewId === reviewId)
    useReviewDock.setState({ phoneReviewId: undefined })
}

/**
 * The review the composer's next send answers. It is set by "Write feedback"
 * and stays until it is sent, removed or the review closes: opening another
 * panel does not move it.
 */
export const useReviewTarget = create<{ reviewId?: string }>(() => ({}))
