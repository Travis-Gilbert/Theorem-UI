// SOURCING: the app's MarkdownDocument (react-markdown) to read a body and a comment, and MarkdownBlocks (Milkdown Crepe, as the notes use it) to write the body; date-fns and ./date-picker for the due date; ./pickers for every property edit. The timeline is hand-rolled: an item's history as the tracker records it (created, comment, status, review, check) has no upstream component
import { format, parseISO } from 'date-fns'
import { Suspense, lazy, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useHotkeys } from '@tanstack/react-hotkeys'
import { MarkdownDocument } from '@/components/artifacts/artifact-renderers'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { describeError, hasStatus } from '@/lib/theorem/client'
import { DatePicker } from './date-picker'
import { PRIORITY_LABEL } from './grouping'
import {
  ActorAvatar,
  ActorStack,
  KindLabel,
  LabelChip,
  PriorityMark,
  PullRequestBadges,
  RelativeTime,
  StatusMark,
  ThreadLink,
  actorName,
} from './marks'
import { EditErrorContext, Notice, useNotice } from './notice'
import { PickerButton } from './pickers'
import {
  useAddComment,
  usePatchWorkItem,
  useWorkFacets,
  useWorkItem,
} from './queries'
import { useWorkSource } from './source'
import { describeEvent } from './timeline'
import type { TimelineEvent, TimelineEventType, WorkItem } from './contract'

// Crepe is large and only wanted once someone edits a description.
const MarkdownBlocks = lazy(() =>
  import('@/components/notes/note-editor').then((m) => ({
    default: m.MarkdownBlocks,
  })),
)

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <dt className="w-20 shrink-0 text-xs text-ink-faint">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center">{children}</dd>
    </div>
  )
}

const dim = (text: string) => <span className="text-sm text-ink-faint">{text}</span>

function DueDate({ item }: { item: WorkItem }) {
  const patch = usePatchWorkItem()
  const report = useContext(EditErrorContext)
  const canEdit = !!useWorkSource().patchItem
  const [anchor, setAnchor] = useState<Element | null>(null)
  const due = item.dueAt ? parseISO(item.dueAt) : undefined
  const text = due ? (
    <span className="text-sm">{format(due, 'MMM d, yyyy')}</span>
  ) : (
    dim('No due date')
  )
  if (!canEdit) return text
  return (
    <>
      <button
        type="button"
        aria-label="Due date"
        onClick={(event) => setAnchor(event.currentTarget)}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-hover"
      >
        <Icon.Calendar className="size-3.5 text-ink-faint" />
        {text}
      </button>
      <DatePicker
        anchor={anchor}
        onClose={() => setAnchor(null)}
        selected={due}
        clearLabel="Clear due date"
        onPick={(date) =>
          patch.mutate(
            { id: item.id, patch: { dueAt: date ? date.toISOString() : null } },
            { onError: report },
          )
        }
      />
    </>
  )
}

function ParentLink({
  parentId,
  onOpen,
}: {
  parentId: string
  onOpen?: (itemId: string) => void
}) {
  const parent = useWorkItem(parentId).data?.item
  return (
    <button
      type="button"
      disabled={!onOpen}
      onClick={() => onOpen?.(parentId)}
      className="min-w-0 truncate rounded-md px-1.5 py-1 text-start text-sm hover:bg-hover"
    >
      {parent ? `${parent.key} ${parent.title}` : 'Parent item'}
    </button>
  )
}

function Properties({
  item,
  onOpen,
}: {
  item: WorkItem
  onOpen?: (itemId: string) => void
}) {
  const pr = item.pullRequest
  return (
    <dl className="flex flex-col gap-0.5">
      <Row label="Status">
        <PickerButton field="status" item={item}>
          <StatusMark status={item.status} />
          <span className="text-sm">{item.status.name}</span>
        </PickerButton>
      </Row>
      <Row label="Priority">
        <PickerButton field="priority" item={item}>
          <PriorityMark priority={item.priority} />
          <span className="text-sm">{PRIORITY_LABEL[item.priority]}</span>
        </PickerButton>
      </Row>
      <Row label="Assignees">
        <PickerButton field="assignee" item={item}>
          {item.assignees.length ? (
            <>
              <ActorStack actors={item.assignees} />
              <span className="truncate text-sm">
                {item.assignees.map(actorName).join(', ')}
              </span>
            </>
          ) : (
            dim('Unassigned')
          )}
        </PickerButton>
      </Row>
      <Row label="Labels">
        <PickerButton field="label" item={item} className="flex-wrap">
          {item.labels.length
            ? item.labels.map((label) => <LabelChip key={label.id} label={label} />)
            : dim('No labels')}
        </PickerButton>
      </Row>
      <Row label="Project">
        <PickerButton field="project" item={item}>
          <ProjectName item={item} />
        </PickerButton>
      </Row>
      <Row label="Milestone">
        <PickerButton field="milestone" item={item}>
          <MilestoneName item={item} />
        </PickerButton>
      </Row>
      <Row label="Due">
        <DueDate item={item} />
      </Row>
      {item.parentId && (
        <Row label="Parent">
          <ParentLink parentId={item.parentId} onOpen={onOpen} />
        </Row>
      )}
      {pr && (
        <>
          <Row label="State">
            <PullRequestBadges pr={pr} />
          </Row>
          {(pr.headRef || pr.baseRef) && (
            <Row label="Branch">
              <span className="min-w-0 truncate font-mono text-xs text-ink-muted">
                {pr.headRef}
                {pr.baseRef && ` into ${pr.baseRef}`}
              </span>
            </Row>
          )}
          {(pr.additions !== undefined || pr.deletions !== undefined) && (
            <Row label="Changes">
              <span className="text-xs tabular-nums">
                <span className="text-teal">+{pr.additions ?? 0}</span>{' '}
                <span className="text-redwood">-{pr.deletions ?? 0}</span>
              </span>
            </Row>
          )}
        </>
      )}
      <Row label="Source">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm text-link hover:bg-hover"
          >
            <span className="truncate">
              {item.source.repo
                ? `${item.source.repo}${item.source.number ? `#${item.source.number}` : ''}`
                : 'Open'}
            </span>
            <Icon.Open className="size-3 shrink-0" />
          </a>
        ) : (
          dim(item.source.provider === 'local' ? 'Local item' : item.key)
        )}
      </Row>
      {item.threadId && (
        <Row label="Conversation">
          <ThreadLink
            threadId={item.threadId}
            className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm text-link hover:bg-hover"
          >
            <Icon.Conversation className="size-3.5 shrink-0" />
            <span className="truncate">Open</span>
          </ThreadLink>
        </Row>
      )}
      <Row label="Created">
        <span className="px-1.5 text-sm text-ink-muted">
          {format(parseISO(item.createdAt), 'MMM d, yyyy')}
        </span>
      </Row>
    </dl>
  )
}

// A project and a milestone read as their names, which only the facets carry.
function ProjectName({ item }: { item: WorkItem }) {
  const projects = useWorkFacets().data?.projects
  const name = projects?.find((p) => p.id === item.projectId)?.name
  return item.projectId ? (
    <span className="truncate text-sm">{name ?? 'Project'}</span>
  ) : (
    dim('No project')
  )
}

function MilestoneName({ item }: { item: WorkItem }) {
  const milestones = useWorkFacets().data?.milestones
  const name = milestones?.find((m) => m.id === item.milestoneId)?.name
  return item.milestoneId ? (
    <span className="truncate text-sm">{name ?? 'Milestone'}</span>
  ) : (
    dim('No milestone')
  )
}

function Title({ item }: { item: WorkItem }) {
  const patch = usePatchWorkItem()
  const report = useContext(EditErrorContext)
  const canEdit = !!useWorkSource().patchItem
  const [draft, setDraft] = useState<string>()
  // The blur's commit reads the draft from a ref, so Escape can drop it
  // before blurring: the state update alone would not have reached the
  // callback the blur runs, and cancelling would have saved the edit.
  const draftRef = useRef<string | undefined>(undefined)
  const edit = (next: string) => {
    draftRef.current = next
    setDraft(next)
  }
  if (!canEdit) return <h2 className="text-lg font-semibold">{item.title}</h2>
  const commit = () => {
    const next = draftRef.current?.trim()
    draftRef.current = undefined
    setDraft(undefined)
    if (next && next !== item.title)
      patch.mutate({ id: item.id, patch: { title: next } }, { onError: report })
  }
  return (
    <Textarea
      aria-label="Title"
      rows={1}
      value={draft ?? item.title}
      onChange={(event) => edit(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          draftRef.current = undefined
          setDraft(undefined)
          event.currentTarget.blur()
        }
      }}
      className="min-h-0 resize-none border-transparent bg-transparent px-1.5 py-1 text-lg font-semibold hover:border-separator md:text-lg"
    />
  )
}

function Body({ item }: { item: WorkItem }) {
  const patch = usePatchWorkItem()
  const report = useContext(EditErrorContext)
  const canEdit = !!useWorkSource().patchItem
  const [draft, setDraft] = useState<string>()
  const body = item.bodyMarkdown?.trim()

  if (draft !== undefined)
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-lg border border-separator">
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <MarkdownBlocks
              markdown={draft}
              autoFocus
              onChange={setDraft}
              className="theorem-note-card"
            />
          </Suspense>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              patch.mutate(
                { id: item.id, patch: { bodyMarkdown: draft } },
                { onError: report },
              )
              setDraft(undefined)
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(undefined)}>
            Cancel
          </Button>
        </div>
      </div>
    )

  return (
    <div className="group/body relative">
      {body ? (
        <MarkdownDocument content={body} className="text-sm leading-6" />
      ) : (
        dim('No description.')
      )}
      {canEdit && (
        <Button
          size="xs"
          variant="ghost"
          className="mt-2"
          onClick={() => setDraft(item.bodyMarkdown ?? '')}
        >
          <Icon.Edit />
          {body ? 'Edit description' : 'Add a description'}
        </Button>
      )}
    </div>
  )
}

const TIMELINE_ICON: Partial<Record<TimelineEventType, keyof typeof Icon>> = {
  created: 'Add',
  comment: 'Conversation',
  status: 'Check',
  review: 'Eye',
  commit: 'Code',
  check: 'Checklist',
  reference: 'Link',
}

function Entry({ event }: { event: TimelineEvent }) {
  const Mark = Icon[TIMELINE_ICON[event.type] ?? 'Note']
  if (event.type === 'comment')
    return (
      <li className="flex gap-2">
        {event.actor ? (
          <ActorAvatar actor={event.actor} />
        ) : (
          <span className="size-6" />
        )}
        <div className="min-w-0 flex-1 rounded-lg border border-separator bg-raised">
          <div className="flex items-center gap-2 border-b border-separator px-3 py-1.5 text-xs">
            <span className="font-medium">
              {event.actor ? actorName(event.actor) : 'Someone'}
            </span>
            <RelativeTime iso={event.createdAt} className="text-ink-faint" />
          </div>
          <div className="px-3 py-2">
            <MarkdownDocument
              content={event.bodyMarkdown ?? ''}
              className="text-sm leading-6"
            />
          </div>
        </div>
      </li>
    )
  return (
    <li className="flex items-center gap-2 text-xs text-ink-muted">
      <span className="grid size-6 shrink-0 place-items-center text-ink-faint">
        <Mark className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium text-ink">
          {event.actor ? actorName(event.actor) : 'Someone'}
        </span>{' '}
        {describeEvent(event)}
      </span>
      <RelativeTime iso={event.createdAt} className="shrink-0 text-ink-faint" />
    </li>
  )
}

function Composer({ item }: { item: WorkItem }) {
  const comment = useAddComment(item.id)
  const [text, setText] = useState('')
  const [box, setBox] = useState<HTMLTextAreaElement | null>(null)
  const submit = () => {
    const body = text.trim()
    if (!body || comment.isPending) return
    comment.mutate(body, { onSuccess: () => setText('') })
  }
  useHotkeys([{ hotkey: 'Mod+Enter', callback: submit }], {
    target: box,
    preventDefault: true,
  })
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        ref={setBox}
        aria-label="Comment"
        placeholder="Leave a comment (Markdown)"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="min-h-20"
      />
      {comment.isError && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(comment.error)}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-ink-faint">Cmd+Enter to send</span>
        <Button size="sm" disabled={!text.trim() || comment.isPending} onClick={submit}>
          Comment
        </Button>
      </div>
    </div>
  )
}

/**
 * One item: an editable title and Markdown description, its properties, and
 * the timeline of what happened with a box to comment. It reads and writes
 * through the WorkSource, so a source that cannot patch or comment gets a
 * read-only view.
 */
export function WorkDetail({
  itemId,
  onOpen,
  onClose,
}: {
  itemId: string
  onOpen?: (itemId: string) => void
  onClose?: () => void
}) {
  const detail = useWorkItem(itemId)
  const source = useWorkSource()
  const { notice, say, clear } = useNotice()

  if (detail.isPending)
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  if (detail.isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm">
        <span className="text-error-ink">
          {hasStatus(detail.error, 404)
            ? 'This item is no longer available.'
            : describeError(detail.error)}
        </span>
        {!hasStatus(detail.error, 404) && (
          <Button size="sm" variant="outline" onClick={() => void detail.refetch()}>
            Try again
          </Button>
        )}
      </div>
    )

  const { item, timeline } = detail.data
  return (
    <EditErrorContext.Provider value={say}>
      <article
        aria-label={`${item.key} ${item.title}`}
        className="@container flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <Notice notice={notice} onClear={clear} />
        <header className="flex items-center gap-2 px-4 pt-3 text-xs text-ink-faint">
          <span className="tabular-nums">{item.key}</span>
          <KindLabel kind={item.kind} />
          <span className="flex-1" />
          {onClose && (
            <Button size="icon-xs" variant="ghost" aria-label="Close" onClick={onClose}>
              <Icon.Close />
            </Button>
          )}
        </header>
        <div className="px-4 pt-1">
          <Title item={item} />
        </div>
        <div className="grid gap-6 px-4 pt-3 pb-6 @2xl:grid-cols-[minmax(0,1fr)_17rem]">
          <aside aria-label="Properties" className="@2xl:order-last">
            <Properties item={item} onOpen={onOpen} />
          </aside>
          <div className="flex min-w-0 flex-col gap-6">
            <Body item={item} />
            <section aria-label="Activity" className="flex flex-col gap-3">
              <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                Activity
              </h3>
              {timeline.length ? (
                <ol className="flex flex-col gap-3">
                  {timeline.map((event) => (
                    <Entry key={event.id} event={event} />
                  ))}
                </ol>
              ) : (
                dim('Nothing has happened yet.')
              )}
              {source.comment && <Composer item={item} />}
            </section>
          </div>
        </div>
      </article>
    </EditErrorContext.Provider>
  )
}
