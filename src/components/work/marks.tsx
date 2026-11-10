// SOURCING: hand-roll — the tracker's status, priority and review glyphs (domain marks no library carries); coss ui Badge and the app's Avatar for pills and people; date-fns for relative time
import { enUS } from 'date-fns/locale'
import { formatDistanceToNowStrict } from 'date-fns'
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/coss/badge'
import { cn } from '@/lib/utils'
import { KIND_LABEL, PRIORITY_LABEL } from './grouping'
import type {
  WorkActor,
  WorkItemKind,
  WorkLabel,
  WorkPriority,
  WorkPullRequest,
  WorkStatus,
  WorkStatusCategory,
} from './contract'

const STATUS_TONE: Record<WorkStatusCategory, string> = {
  triage: 'text-redwood',
  backlog: 'text-ink-faint',
  unstarted: 'text-ink-muted',
  started: 'text-ochre',
  completed: 'text-teal',
  canceled: 'text-ink-faint',
}

/** A status as a small circle whose fill says how far along its category is. */
export function StatusMark({
  status,
  className,
}: {
  status: Pick<WorkStatus, 'name' | 'category'>
  className?: string
}) {
  const { category } = status
  const ring = (
    <circle
      cx="7"
      cy="7"
      r="5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray={category === 'backlog' ? '2 2' : undefined}
    />
  )
  return (
    <svg
      viewBox="0 0 14 14"
      role="img"
      aria-label={status.name}
      className={cn('size-3.5 shrink-0', STATUS_TONE[category], className)}
    >
      {category === 'completed' || category === 'canceled' ? (
        <>
          <circle cx="7" cy="7" r="6.25" fill="currentColor" />
          <path
            d={
              category === 'completed'
                ? 'M4.4 7.2 6.3 9 9.7 5.3'
                : 'M5 5 9 9M9 5 5 9'
            }
            fill="none"
            className="stroke-raised"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          {ring}
          {category === 'started' && (
            <path d="M7 3.6a3.4 3.4 0 0 1 0 6.8Z" fill="currentColor" />
          )}
          {category === 'triage' && (
            <circle cx="7" cy="7" r="1.6" fill="currentColor" />
          )}
        </>
      )}
    </svg>
  )
}

/** Urgent is a filled square; the rest are bars that fill as the priority rises. */
export function PriorityMark({
  priority,
  className,
}: {
  priority: WorkPriority
  className?: string
}) {
  const label = PRIORITY_LABEL[priority]
  if (priority === 1)
    return (
      <svg
        viewBox="0 0 14 14"
        role="img"
        aria-label={label}
        className={cn('size-3.5 shrink-0 text-redwood', className)}
      >
        <rect x="1.5" y="1.5" width="11" height="11" rx="3" fill="currentColor" />
        <path
          d="M7 4v3.6M7 9.6v.1"
          className="stroke-on-redwood"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  const lit = priority === 0 ? 0 : 5 - priority
  return (
    <svg
      viewBox="0 0 14 14"
      role="img"
      aria-label={label}
      className={cn('size-3.5 shrink-0', className)}
    >
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={2 + bar * 4}
          y={9 - bar * 3}
          width="2.4"
          height={3 + bar * 3}
          rx="0.8"
          className={bar < lit ? 'fill-ink-muted' : 'fill-separator'}
        />
      ))}
    </svg>
  )
}

export function KindLabel({ kind }: { kind: WorkItemKind }) {
  return <span className="text-xs text-ink-faint">{KIND_LABEL[kind]}</span>
}

const HEX = /^#?[0-9a-f]{3,8}$/i
const labelColor = (color?: string) =>
  color && HEX.test(color) ? (color.startsWith('#') ? color : `#${color}`) : undefined

export function LabelChip({ label }: { label: Pick<WorkLabel, 'name' | 'color'> }) {
  const color = labelColor(label.color)
  return (
    <span className="inline-flex max-w-32 items-center gap-1 rounded-full border border-separator px-1.5 py-px text-[11px] leading-4 text-ink-muted">
      <span
        className={cn('size-1.5 shrink-0 rounded-full', !color && 'bg-ink-faint')}
        style={color ? { backgroundColor: color } : undefined}
      />
      <span className="truncate">{label.name}</span>
    </span>
  )
}

const initials = (actor: WorkActor) =>
  (actor.name ?? actor.login ?? actor.id).slice(0, 2).toUpperCase()

export const actorName = (actor: WorkActor) =>
  actor.name ?? actor.login ?? actor.id

export function ActorAvatar({
  actor,
  size = 'sm',
}: {
  actor: WorkActor
  size?: 'default' | 'sm' | 'lg'
}) {
  return (
    <Avatar size={size} title={actorName(actor)}>
      {actor.avatarUrl && <AvatarImage src={actor.avatarUrl} alt="" />}
      <AvatarFallback className="text-[10px]">{initials(actor)}</AvatarFallback>
    </Avatar>
  )
}

/** Up to `max` avatars, then a count. */
export function ActorStack({
  actors,
  max = 3,
}: {
  actors: WorkActor[]
  max?: number
}) {
  if (!actors.length) return null
  const shown = actors.slice(0, max)
  return (
    <AvatarGroup className="-space-x-1.5">
      {shown.map((actor) => (
        <ActorAvatar key={actor.id} actor={actor} />
      ))}
      {actors.length > max && (
        <span className="ps-2 text-[11px] text-ink-faint">
          +{actors.length - max}
        </span>
      )}
    </AvatarGroup>
  )
}

const REVIEW = {
  approved: { label: 'Approved', variant: 'success' },
  changes_requested: { label: 'Changes requested', variant: 'error' },
  review_required: { label: 'Review required', variant: 'warning' },
} as const

const CHECKS = {
  passing: { label: 'Checks passing', variant: 'success' },
  failing: { label: 'Checks failing', variant: 'error' },
  pending: { label: 'Checks running', variant: 'warning' },
} as const

/** A pull request's state as pills: draft or merged, the review decision, the checks. */
export function PullRequestBadges({ pr }: { pr: WorkPullRequest }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {pr.merged ? (
        <Badge variant="info">Merged</Badge>
      ) : pr.draft ? (
        <Badge variant="outline">Draft</Badge>
      ) : null}
      {!pr.merged && pr.reviewDecision && (
        <Badge variant={REVIEW[pr.reviewDecision].variant}>
          {REVIEW[pr.reviewDecision].label}
        </Badge>
      )}
      {!pr.merged && pr.checks && (
        <Badge variant={CHECKS[pr.checks].variant}>
          {CHECKS[pr.checks].label}
        </Badge>
      )}
    </span>
  )
}

const SHORT: Record<string, string> = {
  xSeconds: 's',
  xMinutes: 'm',
  xHours: 'h',
  xDays: 'd',
  xMonths: 'mo',
  xYears: 'y',
}
const compact = {
  ...enUS,
  formatDistance: (token: string, count: number) =>
    `${count}${SHORT[token] ?? ''}`,
}

/** "3h", "12d": how long ago, in as few characters as a row can spare. */
export function ago(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : formatDistanceToNowStrict(date, { locale: compact })
}

export function RelativeTime({
  iso,
  className,
}: {
  iso: string
  className?: string
}) {
  return (
    <time
      dateTime={iso}
      title={new Date(iso).toLocaleString()}
      className={cn('tabular-nums', className)}
    >
      {ago(iso)}
    </time>
  )
}
