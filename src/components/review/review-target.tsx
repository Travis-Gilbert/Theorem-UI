// SOURCING: assistant-ui (the open thread's composer text), lib/theorem/reviews (the durable review, its shared draft and its submit route), coss ui menu and input. Hand-rolled glue because nothing upstream models a composer that answers a review: the send has to go to the review's route in place of the chat's, with what was chosen.
import { useAui, useAuiState } from '@assistant-ui/react'
import { useEffect } from 'react'
import { Input } from '@/components/coss/input'
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from '@/components/coss/menu'
import { Icon } from '@/components/icons'
import { describeError } from '@/lib/theorem/client'
import {
  canSubmit,
  closeReview,
  optionLetter,
  selectionSummary,
  useReview,
  useReviewDraft,
  useReviewTarget,
  useSubmitReview,
} from '@/lib/theorem/reviews'
import type {
  ObservationKind,
  Review,
  ReviewObservation,
  ReviewResponse,
} from '@/lib/theorem/reviews'
import { cn } from '@/lib/utils'

export const KIND_LABEL: Record<ObservationKind, string> = {
  preference: 'Preference',
  test_result: 'Test result',
  bug_report: 'Bug',
}

const removeButton =
  'flex shrink-0 items-center justify-center rounded-sm text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus'

/**
 * Sends a review's answer: what is chosen, the test results and bugs, and the
 * composer's text as the reply when the composer is answering this review.
 * The text goes with the answer, so the composer is left empty.
 */
export function useSendReview(review: Review | undefined) {
  const aui = useAui()
  const reviewId = review?.reviewId
  const { response, change, saveError } = useReviewDraft(review)
  const submit = useSubmitReview(reviewId)
  const targeted = useReviewTarget((s) => s.reviewId === reviewId)
  const text = useAuiState((s) => (targeted ? s.composer.text.trim() : ''))
  const answer: ReviewResponse = targeted
    ? { ...response, reply: text || undefined }
    : response
  return {
    response,
    change,
    error: submit.error ?? saveError,
    canSend: canSubmit(answer) && !submit.isPending,
    send: () =>
      submit.mutate(answer, {
        onSuccess: () => {
          if (!reviewId) return
          if (targeted) {
            aui.composer().setText('')
            useReviewTarget.setState({ reviewId: undefined })
          }
          closeReview(reviewId)
        },
      }),
  }
}

/**
 * The review the composer is answering, when it belongs to the open thread
 * and is still open. While there is one, sending submits it.
 */
export function useComposerReview() {
  const threadId = useAuiState((s) => s.threadListItem.remoteId)
  const reviewId = useReviewTarget((s) => s.reviewId)
  const { data } = useReview(reviewId)
  const review =
    data?.status === 'open' && data.threadId === threadId ? data : undefined
  // An answer or a dismissal anywhere leaves nothing to address.
  const closed = data !== undefined && data.status !== 'open'
  useEffect(() => {
    if (closed) useReviewTarget.setState({ reviewId: undefined })
  }, [closed])
  const sending = useSendReview(review)
  return review ? { review, ...sending } : undefined
}

export type ComposerReview = NonNullable<ReturnType<typeof useComposerReview>>

/** Separate lines for what is preference, what was tested and what is broken. */
function Observations({
  review,
  observations,
  onChange,
}: {
  review: Review
  observations: readonly ReviewObservation[]
  onChange: (next: ReviewObservation[]) => void
}) {
  const letter = (optionId: string | undefined) => {
    const at = review.options.findIndex((option) => option.id === optionId)
    return at < 0 ? undefined : optionLetter(at)
  }
  return observations.map((observation, index) => (
    <div key={index} className="flex items-center gap-2 ps-1">
      <span className="w-24 shrink-0 truncate text-xs text-ink-muted">
        {KIND_LABEL[observation.kind]}
        {letter(observation.optionId) && ` on ${letter(observation.optionId)}`}
      </span>
      <Input
        size="sm"
        autoFocus={observation.text === ''}
        aria-label={KIND_LABEL[observation.kind]}
        value={observation.text}
        onChange={(event) =>
          onChange(
            observations.map((other, at) =>
              at === index ? { ...other, text: event.target.value } : other,
            ),
          )
        }
      />
      <button
        type="button"
        aria-label={`Remove ${KIND_LABEL[observation.kind]}`}
        className={cn(removeButton, 'size-5')}
        onClick={() => onChange(observations.filter((_, at) => at !== index))}
      >
        <Icon.X className="size-3" />
      </button>
    </div>
  ))
}

/**
 * What the next send answers, above the composer's input: the review and
 * what is chosen, removable, with test results and bugs added on demand.
 */
export function ComposerReviewTarget({ target }: { target: ComposerReview }) {
  const { review, response, change, error } = target
  const label = `${review.title} · Review · ${selectionSummary(review, response)}`
  const add = (kind: ObservationKind, optionId?: string) =>
    change({
      ...response,
      observations: [...response.observations, { kind, optionId, text: '' }],
    })
  return (
    <div className="flex flex-col gap-1.5 px-1 pt-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-separator bg-raised py-1 ps-2 pe-1 text-xs text-ink-muted">
          <Icon.Compare aria-hidden className="size-3 shrink-0" />
          <span className="truncate" title={label}>
            {label}
          </span>
          <button
            type="button"
            aria-label={`Stop answering ${review.title}`}
            title="Send an ordinary message instead"
            onClick={() => useReviewTarget.setState({ reviewId: undefined })}
            className={cn(removeButton, 'size-4')}
          >
            <Icon.X className="size-3" />
          </button>
        </span>
        <Menu>
          <MenuTrigger className="flex items-center gap-1 rounded-sm text-xs text-ink-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
            <Icon.Add className="size-3" />
            Test result or bug
          </MenuTrigger>
          <MenuPopup align="start" side="top" className="min-w-44">
            {(['test_result', 'bug_report', 'preference'] as const).map(
              (kind) => (
                <MenuSub key={kind}>
                  <MenuSubTrigger>{KIND_LABEL[kind]}</MenuSubTrigger>
                  <MenuSubPopup className="min-w-32">
                    <MenuItem onClick={() => add(kind)}>Overall</MenuItem>
                    {review.options.map((option, at) => (
                      <MenuItem
                        key={option.id}
                        onClick={() => add(kind, option.id)}
                      >
                        On {optionLetter(at)}
                      </MenuItem>
                    ))}
                  </MenuSubPopup>
                </MenuSub>
              ),
            )}
          </MenuPopup>
        </Menu>
      </div>
      <Observations
        review={review}
        observations={response.observations}
        onChange={(observations) => change({ ...response, observations })}
      />
      {Boolean(error) && (
        <p role="alert" className="ps-1 text-xs text-error-ink">
          {describeError(error)}
        </p>
      )}
    </div>
  )
}
