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

export function useReview(reviewId: string) {
  return useQuery({
    queryKey: reviewKey(reviewId),
    queryFn: () => theoremJson<Review>(reviewPath(reviewId)),
  })
}

function usePutReview() {
  const client = useQueryClient()
  return useCallback(
    (review: Review) => {
      client.setQueryData(reviewKey(review.reviewId), review)
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
  next: ReviewResponse,
  revision: number | undefined,
) {
  const write = (expected: number | undefined) =>
    putDraft(reviewId, next, { 'If-Match': String(expected) })
  try {
    return await write(revision)
  } catch (error) {
    if (!hasStatus(error, 409)) throw error
    return write((await theoremJson<Review>(reviewPath(reviewId))).revision)
  }
}

/** The response being written: kept locally, saved as a draft shortly after each change. */
export function useReviewDraft(review: Review | undefined) {
  const client = useQueryClient()
  const put = usePutReview()
  const [response, setResponse] = useState<ReviewResponse>(
    review?.draft ?? EMPTY_RESPONSE,
  )
  const [saveError, setSaveError] = useState<unknown>()
  const [seeded, setSeeded] = useState(review !== undefined)
  // A late-loading review seeds the form once, and never overwrites typing.
  if (!seeded && review) {
    setSeeded(true)
    if (review.draft) setResponse(review.draft)
  }

  const revision = useRef(review?.revision)
  useEffect(() => {
    if (review) revision.current = review.revision
  }, [review])
  const reviewId = review?.reviewId
  const latest = useRef(response)
  const writes = useRef(Promise.resolve())
  const leaving = useRef(false)
  const saver = useDebouncer(
    (next: ReviewResponse) => {
      if (!reviewId) return
      // The page cannot wait for a write still out, or read a newer revision.
      if (leaving.current) {
        void putDraft(reviewId, next).catch(() => undefined)
        return
      }
      // One at a time: each needs the revision the last one answered with.
      writes.current = writes.current
        .then(() => writeDraft(reviewId, next, revision.current))
        .then((saved) => {
          revision.current = saved.revision
          setSaveError(undefined)
          put({ ...saved, draft: latest.current })
        })
        .catch(setSaveError)
    },
    // Closing or detaching the pane unmounts it; neither loses what was typed.
    { wait: 400, onUnmount: (debouncer) => debouncer.flush() },
  )
  useEffect(() => {
    const flush = () => {
      leaving.current = true
      saver.flush()
      leaving.current = false
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [saver])

  const change = (next: ReviewResponse) => {
    setResponse(next)
    latest.current = next
    // Detaching mounts the pane again, and it starts from here.
    if (reviewId)
      client.setQueryData<Review>(
        reviewKey(reviewId),
        (old) => old && { ...old, draft: next },
      )
    saver.maybeExecute(next)
  }
  return { response, change, saveError }
}

/** An answer's text without its first line, which tells the agent the review's id. */
export function answerBody(text: string) {
  return text.replace(/^Review: .*\n+/, '')
}

/** Sends the answer: Theorem writes it and the queued reply together, once, however often this retries. */
export function useSubmitReview(reviewId: string) {
  const put = usePutReview()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (response: ReviewResponse) =>
      mutate((headers) =>
        theoremJson<Review>(`${reviewPath(reviewId)}/submit`, {
          method: 'POST',
          body: response,
          headers,
        }),
      ),
    onSuccess: (review) => {
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
  /** The review shown full screen when there is no dock. */
  phoneReviewId?: string
}>(() => ({}))

export function openReview(reviewId: string) {
  const { open } = useReviewDock.getState()
  if (open) open(reviewId)
  else useReviewDock.setState({ phoneReviewId: reviewId })
}
