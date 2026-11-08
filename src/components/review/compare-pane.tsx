// SOURCING: coss ui (Base UI checkbox, menu, textarea, input, badge) and ui/button, lib/theorem/reviews for the durable review, lib/motion's springs. Hand-rolled layout because nothing upstream models a review of options; its behaviour (several picks, None as an answer, one reply box, arrow keys through options and shots, a reference that cannot be picked, no silent cropping) is translated from mikecann/threadbear@78b77e1 docs/options-review-design and app ReviewWindow (MIT, Mike Cann).
import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { CheckboxPrimitive } from '@/components/coss/checkbox'
import { Badge } from '@/components/coss/badge'
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
import { Textarea } from '@/components/coss/textarea'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { popIn } from '@/lib/motion'
import { describeError } from '@/lib/theorem/client'
import {
  EMPTY_RESPONSE,
  canSubmit,
  optionLetter,
  useCancelReview,
  useReview,
  useReviewDraft,
  useReviewPresence,
  useShotUrl,
  useSubmitReview,
} from '@/lib/theorem/reviews'
import type {
  ObservationKind,
  Review,
  ReviewObservation,
  ReviewOption,
  ReviewResponse,
} from '@/lib/theorem/reviews'
import { cn } from '@/lib/utils'

const KIND_LABEL: Record<ObservationKind, string> = {
  preference: 'Preference',
  test_result: 'Test result',
  bug_report: 'Bug',
}

const paneButton =
  'flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-hover'

/** One option's images. The stage takes the image's shape, so nothing is cropped to fit. */
function ShotStage({
  reviewId,
  option,
  shot,
  onShot,
}: {
  reviewId: string
  option: ReviewOption
  shot: number
  onShot: (index: number) => void
}) {
  const current = option.shots[shot]
  const { url, error } = useShotUrl(reviewId, current?.shotId)
  const [actual, setActual] = useState(false)
  if (!current) return null
  const name = current.title ?? option.title
  const shape =
    current.width && current.height
      ? `${current.width} / ${current.height}`
      : '16 / 10'
  return (
    <figure
      className="group/stage relative overflow-hidden rounded-lg border border-separator bg-rail"
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className={cn(
          'max-h-[420px]',
          actual ? 'overflow-auto' : 'flex justify-center overflow-hidden',
        )}
        style={actual ? undefined : { aspectRatio: shape }}
      >
        {url && (
          <img
            src={url}
            alt={name}
            draggable={false}
            className={cn(
              actual ? 'max-w-none' : 'h-full max-w-full object-contain',
            )}
          />
        )}
        {error && (
          <p className="self-center p-3 text-xs text-error-ink">
            {describeError(error)}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label={actual ? 'Fit the image' : 'Show at actual size'}
        title={actual ? 'Fit' : '100%'}
        onClick={() => setActual((value) => !value)}
        className={cn(
          paneButton,
          'absolute end-1.5 top-1.5 bg-sheet/80 opacity-0 group-hover/stage:opacity-100 focus-visible:opacity-100',
        )}
      >
        <Icon.Expand className="size-3.5" />
      </button>
      {option.shots.length > 1 && (
        <figcaption className="flex h-7 items-center gap-1 border-t border-separator px-1 text-xs text-ink-muted">
          <button
            type="button"
            aria-label="Previous image"
            disabled={shot === 0}
            onClick={() => onShot(shot - 1)}
            className={cn(paneButton, 'size-5 disabled:opacity-40')}
          >
            <Icon.ChevronLeft className="size-3.5" />
          </button>
          <span className="tabular-nums">
            {shot + 1} / {option.shots.length}
          </span>
          <button
            type="button"
            aria-label="Next image"
            disabled={shot === option.shots.length - 1}
            onClick={() => onShot(shot + 1)}
            className={cn(paneButton, 'size-5 disabled:opacity-40')}
          >
            <Icon.ChevronRight className="size-3.5" />
          </button>
          <span className="min-w-0 truncate ps-1">{current.title}</span>
        </figcaption>
      )}
    </figure>
  )
}

function OptionCard({
  reviewId,
  option,
  index,
  picked,
  readOnly,
  shot,
  onShot,
  onToggle,
  onFocus,
}: {
  reviewId: string
  option: ReviewOption
  index: number
  picked: boolean
  readOnly: boolean
  shot: number
  onShot: (index: number) => void
  onToggle: () => void
  onFocus: () => void
}) {
  const pickable = !option.reference && !readOnly
  const label = `${optionLetter(index)} · ${option.title}`
  return (
    <article
      data-option={option.id}
      tabIndex={-1}
      aria-label={label}
      onFocus={onFocus}
      onClick={pickable ? onToggle : undefined}
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-raised/40 p-3.5 outline-none transition-[border-color,background-color,box-shadow] duration-(--duration-snap) ease-snap',
        picked ? 'border-focus ring-1 ring-focus' : 'border-separator',
        pickable && !picked && 'hover:border-control',
        pickable && 'cursor-pointer',
      )}
    >
      <header className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-md font-semibold">
          {label}
        </h3>
        {option.baseline && <Badge size="sm" variant="outline">Baseline</Badge>}
        {option.reference ? (
          <Badge size="sm" variant="outline">Reference</Badge>
        ) : (
          <CheckboxPrimitive.Root
            aria-label={`Pick ${label}`}
            checked={picked}
            disabled={readOnly}
            onCheckedChange={onToggle}
            onClick={(event) => event.stopPropagation()}
            className="flex size-5.5 shrink-0 items-center justify-center rounded-full border border-ink-muted outline-none transition-colors duration-(--duration-snap) ease-snap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-checked:border-focus data-checked:bg-focus data-disabled:opacity-60"
          >
            <CheckboxPrimitive.Indicator className="text-white">
              <Check aria-hidden className="size-3.5" strokeWidth={3} />
            </CheckboxPrimitive.Indicator>
          </CheckboxPrimitive.Root>
        )}
      </header>
      <ShotStage
        reviewId={reviewId}
        option={option}
        shot={shot}
        onShot={onShot}
      />
      {option.note && <p className="text-sm text-ink-muted">{option.note}</p>}
      {option.url && (
        <a
          href={option.url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="flex items-center gap-1 self-start rounded-sm text-sm text-link underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus"
        >
          Open live
          <Icon.Open className="size-3.5" />
        </a>
      )}
    </article>
  )
}

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
  const add = (kind: ObservationKind, optionId?: string) =>
    onChange([...observations, { kind, optionId, text: '' }])
  return (
    <>
      {observations.map((observation, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs text-ink-muted">
            {KIND_LABEL[observation.kind]}
            {letter(observation.optionId) &&
              ` on ${letter(observation.optionId)}`}
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
            className={paneButton}
            onClick={() =>
              onChange(observations.filter((_, at) => at !== index))
            }
          >
            <Icon.X className="size-3.5" />
          </button>
        </div>
      ))}
      <Menu>
        <MenuTrigger className="flex items-center gap-1 self-start rounded-sm text-xs text-ink-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
          <Icon.Add className="size-3" />
          Add a test result or a bug
        </MenuTrigger>
        <MenuPopup align="start" side="top" className="min-w-44">
          {(['test_result', 'bug_report', 'preference'] as const).map((kind) => (
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
          ))}
        </MenuPopup>
      </Menu>
    </>
  )
}

/** What was answered, read back on a review that is finished. */
function Answered({ review }: { review: Review }) {
  const { answer } = review
  if (!answer)
    return <p className="text-sm text-ink-muted">Closed without an answer.</p>
  const picks = answer.pickedIds
    .map((id) => {
      const at = review.options.findIndex((option) => option.id === id)
      return at < 0 ? undefined : `${optionLetter(at)} · ${review.options[at]!.title}`
    })
    .filter(Boolean)
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">
        {answer.none ? 'None of these' : picks.join(' + ') || 'Replied'}
      </p>
      {answer.reply && (
        <p className="whitespace-pre-wrap text-ink-muted">{answer.reply}</p>
      )}
      {answer.observations.map((observation, index) => (
        <p key={index} className="text-ink-muted">
          {KIND_LABEL[observation.kind]}: {observation.text}
        </p>
      ))}
    </div>
  )
}

function ReplyForm({
  review,
  response,
  onChange,
  submit,
  saveError,
}: {
  review: Review
  response: ReviewResponse
  onChange: (next: ReviewResponse) => void
  submit: {
    send: (response: ReviewResponse) => void
    pending: boolean
    error: unknown
  }
  saveError: unknown
}) {
  return (
    <>
      <Textarea
        aria-label="Feedback"
        placeholder="What should change, or what should they combine?"
        value={response.reply ?? ''}
        onChange={(event) =>
          onChange({ ...response, reply: event.target.value })
        }
        className="min-h-20 text-md sm:text-md"
      />
      <Observations
        review={review}
        observations={response.observations}
        onChange={(observations) => onChange({ ...response, observations })}
      />
      {(submit.error || saveError) && (
        <p role="alert" className="text-xs text-error-ink">
          {describeError(submit.error ?? saveError)}
        </p>
      )}
      <Button
        className="h-10 w-full border border-control bg-action text-md text-ink hover:bg-action/80"
        disabled={submit.pending || !canSubmit(response)}
        onClick={() => submit.send(response)}
      >
        Send feedback
      </Button>
      <button
        type="button"
        disabled={submit.pending}
        onClick={() =>
          submit.send({ ...response, pickedIds: [], none: true })
        }
        className="self-center rounded-sm px-2 py-1 text-md text-ink-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60"
      >
        None of these
      </button>
    </>
  )
}

function Loaded({
  review,
  onClose,
}: {
  review: Review
  onClose?: () => void
}) {
  const open = review.status === 'open'
  useReviewPresence(review.reviewId, open)
  const { response, change, saveError } = useReviewDraft(review)
  const shown = open ? response : (review.answer ?? EMPTY_RESPONSE)
  const submit = useSubmitReview(review.reviewId)
  const send = (next: ReviewResponse) =>
    submit.mutate(next, { onSuccess: () => onClose?.() })

  const [shots, setShots] = useState<Readonly<Record<string, number>>>({})
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)

  const toggle = (option: ReviewOption) =>
    change({
      ...response,
      none: false,
      pickedIds: response.pickedIds.includes(option.id)
        ? response.pickedIds.filter((id) => id !== option.id)
        : [...response.pickedIds, option.id],
    })

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      if (open && canSubmit(response) && !submit.isPending) send(response)
      return
    }
    const typing = (event.target as HTMLElement).closest(
      'input, textarea, [role="menu"]',
    )
    if (typing) return
    const option = review.options[active]
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = active + (event.key === 'ArrowDown' ? 1 : -1)
      const target = review.options[next]
      if (!target) return
      setActive(next)
      const card = root.current?.querySelector<HTMLElement>(
        `[data-option="${CSS.escape(target.id)}"]`,
      )
      card?.focus({ preventScroll: true })
      card?.scrollIntoView({ block: 'nearest' })
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && option) {
      event.preventDefault()
      const at = shots[option.id] ?? 0
      const next = at + (event.key === 'ArrowRight' ? 1 : -1)
      if (next >= 0 && next < option.shots.length)
        setShots({ ...shots, [option.id]: next })
    }
  }

  return (
    <div
      ref={root}
      onKeyDown={onKeyDown}
      className="@container flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xl font-semibold">{review.title}</h2>
          {review.note && (
            <p className="text-md text-ink-muted">{review.note}</p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
          {review.options.map((option, index) => (
            <OptionCard
              key={option.id}
              reviewId={review.reviewId}
              option={option}
              index={index}
              readOnly={!open}
              picked={shown.pickedIds.includes(option.id)}
              shot={shots[option.id] ?? 0}
              onShot={(shot) => setShots({ ...shots, [option.id]: shot })}
              onToggle={() => toggle(option)}
              onFocus={() => setActive(index)}
            />
          ))}
        </div>
        <footer className="sticky bottom-0 -mx-4 flex flex-col gap-2.5 bg-artifact px-4 pt-3 pb-4">
          {open ? (
            <ReplyForm
              review={review}
              response={response}
              onChange={change}
              saveError={saveError}
              submit={{ send, pending: submit.isPending, error: submit.error }}
            />
          ) : (
            <Answered review={review} />
          )}
        </footer>
      </div>
    </div>
  )
}

/** The Compare pane: options side by side, then one reply that goes into the conversation. */
export function ComparePane({
  reviewId,
  onClose,
  onDetach,
  detached = false,
  className,
}: {
  reviewId: string
  onClose?: () => void
  /** Offered where the pane can leave the window. */
  onDetach?: () => void
  detached?: boolean
  className?: string
}) {
  const { data: review, error } = useReview(reviewId)
  const cancel = useCancelReview(reviewId)
  const shell = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (shell.current) popIn(shell.current, { from: 0.97, ease: 'settle' })
  }, [])

  return (
    <div
      ref={shell}
      className={cn('flex h-full flex-col bg-artifact text-ink', className)}
    >
      <header className="flex h-13 shrink-0 items-center gap-2 border-b border-separator ps-4 pe-2">
        <span className="text-md font-semibold">Compare</span>
        {review && (
          <span className="rounded-full bg-raised px-2 text-base text-ink tabular-nums">
            {review.options.length}
          </span>
        )}
        <span className="flex-1" />
        {review?.status === 'open' && (
          <Menu>
            <MenuTrigger aria-label="More" className={paneButton}>
              <Icon.More className="size-4" />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-44">
              <MenuItem
                onClick={() =>
                  cancel.mutate(undefined, { onSuccess: () => onClose?.() })
                }
              >
                Dismiss without answering
              </MenuItem>
            </MenuPopup>
          </Menu>
        )}
        {onDetach && (
          <button
            type="button"
            aria-label={detached ? 'Dock beside the conversation' : 'Detach'}
            title={detached ? 'Dock' : 'Detach'}
            className={paneButton}
            onClick={onDetach}
          >
            <Icon.Detach className="size-4" />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            title="Close. Your draft stays."
            className={paneButton}
            onClick={onClose}
          >
            <Icon.X className="size-4" />
          </button>
        )}
      </header>
      {review ? (
        <Loaded review={review} onClose={onClose} />
      ) : (
        error && (
          <p role="alert" className="p-4 text-sm text-error-ink">
            {describeError(error)}
          </p>
        )
      )}
    </div>
  )
}
