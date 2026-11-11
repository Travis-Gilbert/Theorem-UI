// SOURCING: @openuidev/react-lang (defineComponent) with zod/v4 prop schemas, to register the work tracker's components in the Index's library; the components are ./inbox, ./items-screen, ./item-detail and ./projects, and the host (open an item, open a view) is the Index's, passed in so this file never imports the library that imports it
import { defineComponent } from '@openuidev/react-lang'
import type { ReactNode } from 'react'
import { z } from 'zod/v4'
import { WorkGate } from './gate'
import { WorkDetail } from './item-detail'
import { WorkInbox } from './inbox'
import { WorkItemsScreen, WorkViewBarOf } from './items-screen'
import { WorkProject, WorkProjects } from './projects'
import { parseWorkItemId, workItemId, workViewId } from './route'
import { SOURCE_CHOICES, sourceFilter } from './scope'

/** What a tracker component asks of the place it sits in. */
export type WorkHost = {
  selectedId: string | undefined
  openItem: (id: string) => void
  openView: (viewId: string) => void
}

/** The component names, for the library's group and for programs. */
export const WORK_COMPONENT_NAMES = [
  'WorkView',
  'WorkList',
  'WorkBoard',
  'WorkViewBar',
  'WorkInbox',
  'WorkItem',
  'WorkProjects',
  'WorkProject',
] as const

/** A bounded, calm frame: the lists inside scroll in it rather than the page. */
export function WorkFrame({ children }: { children: ReactNode }) {
  return (
    <WorkGate>
      <div className="flex h-[70vh] min-h-96 min-w-0 flex-col overflow-hidden rounded-lg border border-separator bg-raised">
        {children}
      </div>
    </WorkGate>
  )
}

const source = z
  .enum(SOURCE_CHOICES)
  .optional()
  .describe('all (default), github or local: narrows the view without changing it')

/**
 * The tracker's components as OpenUI definitions. `useHost` is the Index's
 * host hook, so the components open items and views the way every other
 * Index component does.
 */
export function workComponents(useHost: () => WorkHost) {
  const View = defineComponent({
    name: 'WorkView',
    description:
      'A saved or built-in work view with its bar (filters, grouping, display, saving), as a list or a board. view is a view id: my-issues, active, high-priority, review-requests, all-issues, board, or a saved view\'s id. Needs no Query; it reads the work tracker itself.',
    props: z.object({ view: z.string().optional(), source }),
    component: function WorkViewComponent({ props }) {
      const host = useHost()
      return (
        <WorkFrame>
          <WorkItemsScreen
            viewId={props.view ?? 'all-issues'}
            extra={sourceFilter(props.source)}
            selectedId={parseWorkItemId(host.selectedId)}
            onOpen={(id) => host.openItem(workItemId(id))}
            onOpenView={(id) => host.openView(workViewId({ kind: 'view', viewId: id }))}
          />
        </WorkFrame>
      )
    },
  })

  const List = defineComponent({
    name: 'WorkList',
    description:
      'A work view as a list, grouped and ordered as the view says, with no bar. Pair it with WorkViewBar for the same view id to filter it.',
    props: z.object({ view: z.string().optional(), source }),
    component: function WorkListComponent({ props }) {
      const host = useHost()
      return (
        <WorkFrame>
          <WorkItemsScreen
            viewId={props.view ?? 'all-issues'}
            extra={sourceFilter(props.source)}
            layout="list"
            bar={false}
            selectedId={parseWorkItemId(host.selectedId)}
            onOpen={(id) => host.openItem(workItemId(id))}
          />
        </WorkFrame>
      )
    },
  })

  const Board = defineComponent({
    name: 'WorkBoard',
    description:
      'A work view as a board: columns from the view\'s grouping (status by default), cards that move between columns by drag. No bar.',
    props: z.object({ view: z.string().optional(), source }),
    component: function WorkBoardComponent({ props }) {
      const host = useHost()
      return (
        <WorkFrame>
          <WorkItemsScreen
            viewId={props.view ?? 'board'}
            extra={sourceFilter(props.source)}
            layout="board"
            bar={false}
            selectedId={parseWorkItemId(host.selectedId)}
            onOpen={(id) => host.openItem(workItemId(id))}
          />
        </WorkFrame>
      )
    },
  })

  const Bar = defineComponent({
    name: 'WorkViewBar',
    description:
      'The bar over a work view: its name, filter chips, display options and saving. It edits the view named by view; a WorkList or WorkBoard for the same view id shows the change.',
    props: z.object({ view: z.string().optional() }),
    component: function WorkViewBarComponent({ props }) {
      const host = useHost()
      return (
        <WorkGate>
          <WorkViewBarOf
            viewId={props.view ?? 'all-issues'}
            onOpenView={(id) => host.openView(workViewId({ kind: 'view', viewId: id }))}
          />
        </WorkGate>
      )
    },
  })

  const Inbox = defineComponent({
    name: 'WorkInbox',
    description:
      'The work inbox: what came in (review requests, assignments, mentions, CI results), to read, snooze or archive. state is the filter it opens on. Choosing an entry opens its item beside it.',
    props: z.object({
      state: z.enum(['all', 'unread', 'snoozed', 'archived']).optional(),
    }),
    component: function WorkInboxComponent({ props }) {
      const host = useHost()
      return (
        <WorkFrame>
          <WorkInbox
            initialState={props.state}
            selectedId={parseWorkItemId(host.selectedId)}
            onOpen={(id) => host.openItem(workItemId(id))}
          />
        </WorkFrame>
      )
    },
  })

  const Item = defineComponent({
    name: 'WorkItem',
    description:
      'One work item: editable title and description, properties, pull request details, and its timeline with a comment box. item is a work item id; without one it shows the item open beside the view.',
    props: z.object({ item: z.string().optional() }),
    component: function WorkItemComponent({ props }) {
      const host = useHost()
      const id = props.item ?? parseWorkItemId(host.selectedId)
      return (
        <WorkFrame>
          {id ? (
            <WorkDetail
              key={id}
              itemId={id}
              onOpen={(next) => host.openItem(workItemId(next))}
            />
          ) : (
            <p className="p-4 text-sm text-ink-muted">Choose a work item to see it here.</p>
          )}
        </WorkFrame>
      )
    },
  })

  const Projects = defineComponent({
    name: 'WorkProjects',
    description:
      'Every tracked project: status, lead, target date, progress and last change. Choosing one opens it.',
    props: z.object({}),
    component: function WorkProjectsComponent() {
      const host = useHost()
      return (
        <WorkFrame>
          <WorkProjects
            onOpen={(projectId) =>
              host.openView(workViewId({ kind: 'project', projectId }))
            }
          />
        </WorkFrame>
      )
    },
  })

  const Project = defineComponent({
    name: 'WorkProject',
    description:
      'One project: progress, milestones, status breakdown, recent activity and its items as a list or board. project is a project id.',
    props: z.object({ project: z.string() }),
    component: function WorkProjectComponent({ props }) {
      const host = useHost()
      return (
        <WorkGate>
          <div className="flex h-[80vh] min-h-96 min-w-0 flex-col overflow-hidden rounded-lg border border-separator bg-raised">
            <WorkProject
              projectId={props.project}
              selectedItemId={parseWorkItemId(host.selectedId)}
              onOpenItem={(id) => host.openItem(workItemId(id))}
            />
          </div>
        </WorkGate>
      )
    },
  })

  return [View, List, Board, Bar, Inbox, Item, Projects, Project]
}
