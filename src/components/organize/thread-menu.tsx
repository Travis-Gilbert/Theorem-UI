// SOURCING: coss ui menu over Base UI Menu (the same parts serve the More button and the right-click ContextMenu), coss ui toast (a refused change, said after the menu has closed), date-fns for the Later presets, lib/theorem/organization for placement and Later, thread-tree for forks. Placement rules are Theorem's; this only asks.
import { addDays, addHours, nextMonday, setHours, startOfHour } from 'date-fns'
import {
  MenuCheckboxItem,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from '@/components/coss/menu'
import { Icon } from '@/components/icons'
import { toastManager } from '@/components/coss/toast'
import { describeError } from '@/lib/theorem/client'
import {
  primaryProjectId,
  useLater,
  useMoveThread,
  usePlacement,
} from '@/lib/theorem/organization'
import type {
  LaterCondition,
  ProjectEntry,
  ThreadEntry,
} from '@/lib/theorem/organization'

const morning = (date: Date) => startOfHour(setHours(date, 9))

/** When a thread can wake by the clock. Read at click time, so a long-open menu stays right. */
const LATER_PRESETS: Array<{ label: string; at: () => Date }> = [
  { label: 'In an hour', at: () => addHours(new Date(), 1) },
  { label: 'Tomorrow morning', at: () => morning(addDays(new Date(), 1)) },
  { label: 'Next week', at: () => morning(nextMonday(new Date())) },
]

/** The menu has closed by the time Theorem answers, so a refusal is said in a toast. */
const refused = (title: string) => (error: Error) =>
  toastManager.add({ type: 'error', title, description: describeError(error) })

/** The menu both a row's More button and its right-click open. */
export function ThreadMenuItems({
  thread,
  projects,
  running,
  served,
  canStartFrom,
  onFork,
  onContinue,
  onRename,
  onArchive,
  onDelete,
}: {
  thread: ThreadEntry
  projects: readonly ProjectEntry[]
  /** Threads with a run going: the ones this one can wait for. */
  running: readonly ThreadEntry[]
  /** Whether this Theorem serves placement and Later. */
  served: boolean
  canStartFrom: boolean
  onFork: () => void
  onContinue: () => void
  onRename: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const placement = usePlacement({
    onError: refused('Could not change where this thread is filed'),
  })
  const mover = useMoveThread({
    onError: refused('Could not move this thread'),
  })
  const later = useLater({ onError: refused('Could not set Later') })
  const filed = projects.filter((project) => !project.isInbox)
  const members = new Set(thread.memberships.map((m) => m.projectId))
  const primary = primaryProjectId(thread)
  const primaryMembership = thread.memberships.find(
    (m) => m.projectId === primary,
  )
  const primaryTitle = projects.find((p) => p.projectId === primary)?.title
  const waitable = running.filter((t) => t.threadId !== thread.threadId)
  const place = (condition: LaterCondition | null) =>
    later.mutate({ threadId: thread.threadId, condition })

  return (
    <>
      <MenuItem disabled={!canStartFrom} onClick={onFork}>
        <Icon.Fork className="size-4" />
        Fork into new thread
      </MenuItem>
      <MenuItem disabled={!canStartFrom} onClick={onContinue}>
        <Icon.Continue className="size-4" />
        Continue in new thread
      </MenuItem>
      <MenuSeparator />
      {served ? (
        <MenuSub>
          <MenuSubTrigger>
            <Icon.Folder className="size-4" />
            Projects
          </MenuSubTrigger>
          <MenuSubPopup className="min-w-44">
            {filed.map((project) => (
              <MenuCheckboxItem
                key={project.projectId}
                closeOnClick={false}
                checked={members.has(project.projectId)}
                onCheckedChange={(checked) =>
                  placement.mutate({
                    threadId: thread.threadId,
                    change: checked
                      ? { add: [project.projectId] }
                      : { remove: [project.projectId] },
                  })
                }
              >
                {project.title}
              </MenuCheckboxItem>
            ))}
          </MenuSubPopup>
        </MenuSub>
      ) : (
        // Without placement a thread lives in one project: moving it changes its home.
        <MenuSub>
          <MenuSubTrigger>
            <Icon.Folder className="size-4" />
            Move to
          </MenuSubTrigger>
          <MenuSubPopup className="min-w-44">
            <MenuRadioGroup
              value={members.size ? thread.homeProjectId : 'unsorted'}
              onValueChange={(value: string) =>
                mover.move(
                  thread,
                  thread.homeProjectId,
                  value === 'unsorted' ? null : value,
                )
              }
            >
              {filed.map((project) => (
                <MenuRadioItem
                  key={project.projectId}
                  value={project.projectId}
                >
                  {project.title}
                </MenuRadioItem>
              ))}
              <MenuRadioItem value="unsorted">Unsorted</MenuRadioItem>
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>
      )}
      {served && (
        <>
          {primaryMembership && (
            <MenuItem
              onClick={() =>
                placement.mutate({
                  threadId: thread.threadId,
                  change: primaryMembership.pinned
                    ? { unpin: [primary] }
                    : { pin: [primary] },
                })
              }
            >
              {primaryMembership.pinned ? (
                <Icon.Unpin className="size-4" />
              ) : (
                <Icon.Pin className="size-4" />
              )}
              {primaryMembership.pinned ? 'Unpin from' : 'Pin to'}{' '}
              {primaryTitle}
            </MenuItem>
          )}
          <MenuSub>
            <MenuSubTrigger>
              <Icon.Later className="size-4" />
              Later
            </MenuSubTrigger>
            <MenuSubPopup className="min-w-44">
              {thread.later && (
                <>
                  <MenuItem onClick={() => place(null)}>Wake now</MenuItem>
                  <MenuSeparator />
                </>
              )}
              {LATER_PRESETS.map(({ label, at }) => (
                <MenuItem
                  key={label}
                  onClick={() => place({ kind: 'time', atMs: at().getTime() })}
                >
                  {label}
                </MenuItem>
              ))}
              {waitable.length > 0 && <MenuSeparator />}
              {waitable.map((other) => (
                <MenuItem
                  key={other.threadId}
                  onClick={() =>
                    place({
                      kind: 'thread',
                      threadId: other.threadId,
                      event: 'run_ended',
                    })
                  }
                >
                  <span className="min-w-0 truncate">
                    When {other.title || 'New chat'} finishes
                  </span>
                </MenuItem>
              ))}
            </MenuSubPopup>
          </MenuSub>
        </>
      )}
      <MenuSeparator />
      <MenuItem onClick={onRename}>
        <Icon.Edit className="size-4" />
        Rename
      </MenuItem>
      <MenuItem onClick={onArchive}>
        <Icon.Archive className="size-4" />
        Archive
      </MenuItem>
      <MenuItem variant="destructive" onClick={onDelete}>
        <Icon.Delete className="size-4" strokeWidth={1.75} />
        Delete
      </MenuItem>
    </>
  )
}
