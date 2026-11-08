// SOURCING: assistant-ui for the open thread's id, coss ui badge, lib/theorem/reviews, lib/motion's riseIn. Arriving without taking focus, and reopening read-only once answered, are translated from mikecann/threadbear@78b77e1 docs/options-review-design (MIT, Mike Cann).
import { useAuiState } from '@assistant-ui/react'
import { useEffect, useEffectEvent, useRef } from 'react'
import { Badge } from '@/components/coss/badge'
import { Icon } from '@/components/icons'
import { riseIn } from '@/lib/motion'
import {
  openReview,
  useReview,
  useReviewDock,
  useThreadReviews,
} from '@/lib/theorem/reviews'
import type { Review } from '@/lib/theorem/reviews'
import { useFollowThread } from '@/lib/theorem/runtime'
import { cn } from '@/lib/utils'

export const attentionBadge = 'bg-attention/18 text-attention-ink'

const STATUS_LABEL: Record<Review['status'], string> = {
  open: 'Needs your choice',
  answered: 'Answered',
  cancelled: 'Dismissed',
}

/** The transcript's row for a review. It opens the pane, and read-only once answered. */
export function ReviewCard({ review }: { review: Review }) {
  const count = review.options.length
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (ref.current) riseIn(ref.current)
  }, [])
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => openReview(review.reviewId)}
      className="flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-control bg-raised/60 px-3 py-2 text-start text-base outline-none transition-colors duration-(--duration-snap) ease-snap hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
    >
      <Icon.Compare aria-hidden className="size-5 shrink-0 text-ink-muted" />
      <span className="min-w-40 flex-1 truncate">
        {review.title}
        <span className="text-ink-muted">
          {' · '}
          {count} {count === 1 ? 'option' : 'options'}
        </span>
      </span>
      <Badge
        variant="secondary"
        className={cn('text-sm', review.status === 'open' && attentionBadge)}
      >
        {STATUS_LABEL[review.status]}
      </Badge>
    </button>
  )
}

/** Reviews the pane has opened by itself, so closing one is not undone by the next poll. */
const arrived = new Set<string>()

/**
 * Below the conversation: open reviews, and answers the transcript doesn't hold
 * yet, which keep their card until they land there. An answer waits behind a
 * live run or for its own to start, and any tab that learns of one follows it
 * in. A new review opens its pane without taking the keyboard.
 */
export function ThreadReviewCards() {
  const threadId = useAuiState((s) => s.threadListItem.remoteId)
  const messages = useAuiState((s) => (s.thread.isLoading ? undefined : s.thread.messages))
  const { data: reviews = [] } = useThreadReviews(threadId)
  const open = reviews.filter((review) => review.status === 'open')
  const arriving = reviews.filter(
    ({ answer }) => answer && messages && !messages.some((message) => message.id === answer.messageId),
  )
  const dockOpen = useReviewDock((s) => s.open)
  const newest = open[0]
  const follow = useFollowThread()
  const followIn = useEffectEvent(() => {
    if (threadId) void follow(threadId)
  })
  const answerOnItsWay = arriving.length > 0

  useEffect(() => {
    if (answerOnItsWay) followIn()
  }, [answerOnItsWay])

  useEffect(() => {
    if (!dockOpen || !newest) return
    if (arrived.has(newest.reviewId) || newest.closedAtMs) return
    arrived.add(newest.reviewId)
    dockOpen(newest.reviewId, { quiet: true })
  }, [dockOpen, newest])

  if (open.length === 0 && !answerOnItsWay) return null
  return (
    <div className="-mt-8 mb-14 ms-13 flex flex-col gap-2">
      {[...open, ...arriving].map((review) => (
        <ReviewCard key={review.reviewId} review={review} />
      ))}
    </div>
  )
}

/** A reply that answered a review, in the message it landed in. */
export function ReviewAnswerCard({ reviewId }: { reviewId: string }) {
  const { data: review } = useReview(reviewId)
  return review ? (
    <div className="mt-2 whitespace-normal">
      <ReviewCard review={review} />
    </div>
  ) : null
}
