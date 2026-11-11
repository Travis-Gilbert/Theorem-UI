// SOURCING: coss ui (Base UI checkbox, menu, badge) and ui/button, lib/theorem/reviews for the durable review, review-target for sending it, the thread's own Composer where the conversation is not beside the pane, lib/motion's springs. Hand-rolled layout because nothing upstream models a review of options; its behaviour (several picks, None as an answer, arrow keys through options and shots, a reference that cannot be picked, no silent cropping) is translated from mikecann/threadbear@78b77e1 docs/options-review-design and app ReviewWindow (MIT, Mike Cann). Looking at an option and choosing it are separate here, and the reply is written in the conversation's composer.
import { useAui } from '@assistant-ui/react'
import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Composer } from '@/components/assistant-ui/elements/thread.aui'
import { focusComposer } from '@/components/chat/composer-references'
import { Badge } from '@/components/coss/badge'
import { CheckboxPrimitive } from '@/components/coss/checkbox'
import { Menu, MenuItem, MenuPopup, MenuTrigger } from '@/components/coss/menu'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { popIn } from '@/lib/motion'
import { describeError } from '@/lib/theorem/client'
import {
  EMPTY_RESPONSE,
  optionLetter,
  selectionSummary,
  useCancelReview,
  useReview,
  useReviewPresence,
  useReviewTarget,
  useShotUrl,
} from '@/lib/theorem/reviews'
import type { Review, ReviewOption } from '@/lib/theorem/reviews'
import { cn } from '@/lib/utils'
import { KIND_LABEL, useSendReview } from './review-target'

const paneButton =
  'flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-hover'

/** One option's images. The stage takes the image's shape, so nothing is cropped to fit. */
function ShotStage({
  reviewId,
  option,
  shot,
  onShot,
  className,
}: {
  reviewId: string
  option: ReviewOption
  shot: number
  onShot: (index: number) => void
  /** How tall the stage may stand. */
  className: string
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
    <figure className="group/stage relative overflow-hidden rounded-lg border border-separator bg-rail">
      <div
        className={cn(
          className,
          actual
            ? 'overflow-auto'
            : 'mx-auto flex justify-center overflow-hidden',
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

function PickBox({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <CheckboxPrimitive.Root
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onToggle}
      className="flex size-4.5 shrink-0 items-center justify-center rounded-[5px] border border-ink-muted outline-none transition-colors duration-(--duration-snap) ease-snap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-checked:border-focus data-checked:bg-focus data-disabled:opacity-60"
    >
      <CheckboxPrimitive.Indicator className="text-white">
        <Check aria-hidden className="size-3" strokeWidth={3.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

const optionLabel = (option: ReviewOption, index: number) =>
  `${optionLetter(index)} · ${option.title}`

function OptionBadges({ option }: { option: ReviewOption }) {
  return (
    <>
      {option.baseline && (
        <Badge size="sm" variant="outline">
          Baseline
        </Badge>
      )}
      {option.reference && (
        <Badge size="sm" variant="outline">
          Reference
        </Badge>
      )}
    </>
  )
}

function OptionNotes({ option }: { option: ReviewOption }) {
  return (
    <>
      {option.note && <p className="text-sm text-ink-muted">{option.note}</p>}
      {option.url && (
        <a
          href={option.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 self-start rounded-sm text-sm text-link underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus"
        >
          Open live
          <Icon.Open className="size-3.5" />
        </a>
      )}
    </>
  )
}

/** One option in the docked pane: a line to choose it by, and a way to look at it. */
function OptionRow({
  option,
  index,
  picked,
  viewing,
  readOnly,
  onToggle,
  onView,
}: {
  option: ReviewOption
  index: number
  picked: boolean
  viewing: boolean
  readOnly: boolean
  onToggle: () => void
  onView: () => void
}) {
  const label = optionLabel(option, index)
  return (
    <li
      data-option={option.id}
      className="flex h-10 items-center gap-2 border-b border-separator"
    >
      <label
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 self-stretch',
          !option.reference && !readOnly && 'cursor-pointer',
        )}
      >
        {option.reference ? (
          <span aria-hidden className="size-4.5 shrink-0" />
        ) : (
          <PickBox
            label={`Pick ${label}`}
            checked={picked}
            disabled={readOnly}
            onToggle={onToggle}
          />
        )}
        <span className="min-w-0 truncate text-md">{label}</span>
      </label>
      <OptionBadges option={option} />
      <button
        type="button"
        aria-pressed={viewing}
        aria-label={`Preview ${label}`}
        onClick={onView}
        className={cn(
          'h-7 shrink-0 rounded-md border px-2.5 text-sm outline-none focus-visible:outline-2 focus-visible:outline-focus',
          viewing
            ? 'border-control text-ink'
            : 'border-transparent text-ink-muted hover:bg-hover hover:text-ink',
        )}
      >
        {viewing ? 'Viewing' : 'Preview'}
      </button>
    </li>
  )
}

/** One option in the expanded pane, where every option's image stands side by side. */
function OptionCard({
  reviewId,
  option,
  index,
  picked,
  viewing,
  readOnly,
  shot,
  onShot,
  onToggle,
  onView,
}: {
  reviewId: string
  option: ReviewOption
  index: number
  picked: boolean
  viewing: boolean
  readOnly: boolean
  shot: number
  onShot: (index: number) => void
  onToggle: () => void
  onView: () => void
}) {
  const label = optionLabel(option, index)
  return (
    <article
      data-option={option.id}
      aria-label={label}
      onFocus={onView}
      onPointerDown={onView}
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-raised/40 p-3.5 transition-[border-color,box-shadow] duration-(--duration-snap) ease-snap',
        picked ? 'border-focus ring-1 ring-focus' : 'border-separator',
        viewing && !picked && 'border-control',
      )}
    >
      <header className="flex items-center gap-2">
        <label
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5',
            !option.reference && !readOnly && 'cursor-pointer',
          )}
        >
          {!option.reference && (
            <PickBox
              label={`Pick ${label}`}
              checked={picked}
              disabled={readOnly}
              onToggle={onToggle}
            />
          )}
          <h3 className="min-w-0 truncate text-md font-semibold">{label}</h3>
        </label>
        <OptionBadges option={option} />
      </header>
      <ShotStage
        reviewId={reviewId}
        option={option}
        shot={shot}
        onShot={onShot}
        className="max-h-[70dvh]"
      />
      <OptionNotes option={option} />
    </article>
  )
}

/** What was answered, read back on a review that is finished. */
function Answered({ review }: { review: Review }) {
  const { answer } = review
  if (!answer)
    return <p className="text-sm text-ink-muted">Closed without an answer.</p>
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">
        {answer.none || answer.pickedIds.length
          ? selectionSummary(review, answer)
          : 'Replied'}
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

const instruction = (review: Review) => {
  const pickable = review.options.filter((option) => !option.reference).length
  if (pickable === 1) return 'Select it, or none'
  return pickable === 2 ? 'Select one or both' : 'Select one or more'
}

function Loaded({
  review,
  standalone,
  expanded,
}: {
  review: Review
  standalone: boolean
  expanded: boolean
}) {
  const { reviewId } = review
  const open = review.status === 'open'
  useReviewPresence(reviewId, open)
  const aui = useAui()
  const { response, change, canSend, send, error } = useSendReview(review)
  const shown = open ? response : (review.answer ?? EMPTY_RESPONSE)

  const [shots, setShots] = useState<Readonly<Record<string, number>>>({})
  const [viewed, setViewed] = useState(0)
  const viewing = review.options[viewed] ?? review.options[0]
  const root = useRef<HTMLDivElement>(null)

  const toggle = (option: ReviewOption) =>
    change({
      ...response,
      none: false,
      pickedIds: response.pickedIds.includes(option.id)
        ? response.pickedIds.filter((id) => id !== option.id)
        : [...response.pickedIds, option.id],
    })

  /** The composer answers this review, starting from a reply drafted earlier. */
  const address = () => {
    useReviewTarget.setState({ reviewId })
    const composer = aui.composer()
    if (!composer.getState().text && response.reply)
      composer.setText(response.reply)
  }
  // Away from the conversation the pane carries the composer, already answering.
  const carriesComposer = open && standalone
  useEffect(() => {
    if (carriesComposer) address()
    // Once per surface: taking the target off there is the person's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carriesComposer, reviewId])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      if (open && canSend) send()
      return
    }
    const typing = (event.target as HTMLElement).closest(
      'input, textarea, [contenteditable], [role="menu"]',
    )
    if (typing) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const next = viewed + (event.key === 'ArrowDown' ? 1 : -1)
      const target = review.options[next]
      if (!target) return
      event.preventDefault()
      setViewed(next)
      root.current
        ?.querySelector(`[data-option="${CSS.escape(target.id)}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && viewing) {
      event.preventDefault()
      const at = shots[viewing.id] ?? 0
      const next = at + (event.key === 'ArrowRight' ? 1 : -1)
      if (next >= 0 && next < viewing.shots.length)
        setShots({ ...shots, [viewing.id]: next })
    }
  }

  const none = (
    <label
      className={cn(
        'flex h-10 items-center gap-2.5 text-md text-ink-muted',
        open && 'cursor-pointer',
      )}
    >
      <PickBox
        label="None of these"
        checked={shown.none}
        disabled={!open}
        onToggle={() =>
          change({ ...response, none: !response.none, pickedIds: [] })
        }
      />
      None of these
    </label>
  )

  return (
    <div
      ref={root}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        <p className="text-sm text-ink-muted">
          {review.note}
          {review.note && open && ' · '}
          {open && instruction(review)}
        </p>
        {expanded ? (
          <>
            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @6xl:grid-cols-3">
              {review.options.map((option, index) => (
                <OptionCard
                  key={option.id}
                  reviewId={reviewId}
                  option={option}
                  index={index}
                  readOnly={!open}
                  picked={shown.pickedIds.includes(option.id)}
                  viewing={index === viewed}
                  shot={shots[option.id] ?? 0}
                  onShot={(shot) => setShots({ ...shots, [option.id]: shot })}
                  onToggle={() => toggle(option)}
                  onView={() => setViewed(index)}
                />
              ))}
            </div>
            {none}
          </>
        ) : (
          <>
            <ul className="-mt-1 flex flex-col">
              {review.options.map((option, index) => (
                <OptionRow
                  key={option.id}
                  option={option}
                  index={index}
                  readOnly={!open}
                  picked={shown.pickedIds.includes(option.id)}
                  viewing={index === viewed}
                  onToggle={() => toggle(option)}
                  onView={() => setViewed(index)}
                />
              ))}
              <li>{none}</li>
            </ul>
            {viewing && (
              <section aria-label="Preview" className="flex flex-col gap-2">
                <div>
                  <p className="text-xs text-ink-muted">
                    Previewing {optionLetter(review.options.indexOf(viewing))}
                  </p>
                  <h3 className="text-md font-semibold">{viewing.title}</h3>
                </div>
                <ShotStage
                  key={viewing.id}
                  reviewId={reviewId}
                  option={viewing}
                  shot={shots[viewing.id] ?? 0}
                  onShot={(shot) => setShots({ ...shots, [viewing.id]: shot })}
                  className="max-h-55"
                />
                <OptionNotes option={viewing} />
              </section>
            )}
          </>
        )}
        {!open && <Answered review={review} />}
        {open && !standalone && (
          <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
            <Button
              variant="outline"
              className="h-8 border-control px-3 text-md"
              onClick={() => {
                address()
                focusComposer()
              }}
            >
              Write feedback
            </Button>
            <span className="text-sm text-ink-muted">
              {selectionSummary(review, response)}
            </span>
            {Boolean(error) && (
              <p role="alert" className="basis-full text-xs text-error-ink">
                {describeError(error)}
              </p>
            )}
          </footer>
        )}
      </div>
      {carriesComposer && (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-3 [--composer-padding:12px] [--composer-radius:16px]">
          <Composer autoFocus={false} />
        </div>
      )}
    </div>
  )
}

/** The Compare pane: options to look at and choose among. The reply is written in the conversation's composer. */
export function ComparePane({
  reviewId,
  onClose,
  onDetach,
  detached = false,
  onExpandedChange,
  expanded = false,
  standalone = false,
  className,
}: {
  reviewId: string
  onClose?: () => void
  /** Offered where the pane can leave the window. */
  onDetach?: () => void
  detached?: boolean
  /** Offered where the pane can take the whole workspace, every option side by side. */
  onExpandedChange?: (expanded: boolean) => void
  expanded?: boolean
  /** The conversation is not beside the pane, so the pane carries its composer. */
  standalone?: boolean
  className?: string
}) {
  const { data: review, error } = useReview(reviewId)
  const cancel = useCancelReview(reviewId)
  const shell = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (shell.current) popIn(shell.current, { from: 0.97, ease: 'settle' })
  }, [])
  const count = review?.options.length

  return (
    <div
      ref={shell}
      className={cn(
        '@container flex h-full flex-col bg-artifact text-ink',
        className,
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-0.5 ps-4 pe-2">
        <h2 className="text-md font-semibold">Compare</h2>
        <span className="min-w-0 flex-1 truncate ps-2 text-md text-ink-muted">
          {review?.title}
        </span>
        {count !== undefined && (
          <span className="shrink-0 px-1.5 text-sm text-ink-muted tabular-nums">
            {count} {count === 1 ? 'option' : 'options'}
          </span>
        )}
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
        {onExpandedChange && (
          <button
            type="button"
            aria-label={expanded ? 'Restore layout' : 'Compare side by side'}
            title={expanded ? 'Restore layout' : 'Compare side by side'}
            aria-pressed={expanded}
            className={cn(paneButton, expanded && 'bg-selected')}
            onClick={() => onExpandedChange(!expanded)}
          >
            <Icon.Expand className="size-4" />
          </button>
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
        <Loaded review={review} standalone={standalone} expanded={expanded} />
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
