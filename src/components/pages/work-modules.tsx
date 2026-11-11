// SOURCING: the work tracker's screens (components/work) wrapped as page modules the way builtins.tsx wraps the Index's own columns: each is one component behind the tracker's gate, with its selection as an output, an opened event and select/deselect actions, so a page connects a list to a detail with the same wires the Index view and Inspector use
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { WorkGate } from '@/components/work/gate'
import { WorkInbox } from '@/components/work/inbox'
import { WorkDetail } from '@/components/work/item-detail'
import { WorkItemsScreen, WorkViewBarOf } from '@/components/work/items-screen'
import { WorkProject, WorkProjects } from '@/components/work/projects'
import { parseWorkItemId, workItemId } from '@/components/work/route'
import {
  SOURCE_CHOICES,
  SOURCE_LABEL,
  sourceFilter,
} from '@/components/work/scope'
import type { Item } from '@/lib/modules/contract'
import { builtin } from '@/lib/modules/registry'
import type { ModuleDefinition, ModuleViewProps } from '@/lib/modules/registry'
import { isItem } from '@/lib/modules/values'
import { useNothingToShow } from './layout-parts'
import { useModuleAction } from './page-runtime'

/** The page area a module fills; the lists inside scroll in it. */
function Body({ children }: { children: ReactNode }) {
  return (
    <WorkGate>
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
        {children}
      </div>
    </WorkGate>
  )
}

function Note({ children }: { children: string }) {
  return <p className="p-3 text-sm text-ink-muted">{children}</p>
}

/** A setting or input that names something, as the string it names. */
function named(value: unknown): string {
  if (typeof value === 'string') return value
  return isItem(value) ? value.id : ''
}

/** A work item as a page value: its id is the one the Index's `item` param uses. */
const workItem = (id: string): Item => ({ id: workItemId(id), kind: 'work' })
const projectItem = (id: string): Item => ({ id, kind: 'work-project' })

/** The item id inside a page value, which may carry the `work:` prefix or not. */
const bare = (value: unknown) => {
  const id = named(value)
  return parseWorkItemId(id) ?? id
}

/**
 * The item a module has open: its Selected output. Opening one sends Opened;
 * Select and Clear the selection move it.
 */
function useSelection({ output, emit }: ModuleViewProps) {
  const [selected, setSelected] = useState<string>()
  useEffect(
    () => output('selected', selected ? workItem(selected) : undefined),
    [output, selected],
  )
  useModuleAction('select', (payload) => {
    if (isItem(payload)) setSelected(bare(payload))
  })
  useModuleAction('deselect', () => setSelected(undefined))
  return {
    selected,
    open: (id: string) => {
      setSelected(id)
      emit('opened', workItem(id))
    },
  }
}

function ListModule(view: ModuleViewProps & { layout: 'list' | 'board' }) {
  const { selected, open } = useSelection(view)
  const viewId = named(view.settings.view) || undefined
  return (
    <Body>
      <WorkItemsScreen
        viewId={viewId ?? (view.layout === 'board' ? 'board' : 'all-issues')}
        extra={sourceFilter(named(view.settings.source))}
        layout={view.layout}
        bar={view.settings.bar !== false}
        selectedId={selected}
        onOpen={open}
      />
    </Body>
  )
}

function ViewBarModule({ settings }: ModuleViewProps) {
  const viewId = named(settings.view) || 'all-issues'
  return (
    <Body>
      <WorkViewBarOf viewId={viewId} />
    </Body>
  )
}

function InboxModule(view: ModuleViewProps) {
  const { selected, open } = useSelection(view)
  const state = named(view.settings.state)
  return (
    <Body>
      <WorkInbox
        initialState={
          state === 'unread' || state === 'snoozed' || state === 'archived'
            ? state
            : 'all'
        }
        selectedId={selected}
        onOpen={open}
      />
    </Body>
  )
}

function ItemModule({ inputs, settings, emit }: ModuleViewProps) {
  const id = bare(inputs.item ?? settings.item)
  useNothingToShow(!id)
  if (!id) return <Note>Nothing to show yet. Connect its Item, or send it one.</Note>
  // A new item coming in starts it over, dropping the linked item it was showing.
  return <ItemShown key={id} start={id} emit={emit} />
}

function ItemShown({
  start,
  emit,
}: {
  start: string
  emit: ModuleViewProps['emit']
}) {
  const [id, setId] = useState(start)
  return (
    <Body>
      <WorkDetail
        key={id}
        itemId={id}
        onOpen={(next) => {
          setId(next)
          emit('opened', workItem(next))
        }}
      />
    </Body>
  )
}

function ProjectsModule({ output, emit }: ModuleViewProps) {
  const [selected, setSelected] = useState<string>()
  useEffect(
    () => output('selected', selected ? projectItem(selected) : undefined),
    [output, selected],
  )
  useModuleAction('select', (payload) => {
    if (isItem(payload)) setSelected(payload.id)
  })
  useModuleAction('deselect', () => setSelected(undefined))
  return (
    <Body>
      <WorkProjects
        selectedId={selected}
        onOpen={(id) => {
          setSelected(id)
          emit('opened', projectItem(id))
        }}
      />
    </Body>
  )
}

function ProjectModule(view: ModuleViewProps) {
  const { selected, open } = useSelection(view)
  const project = named(view.inputs.project ?? view.settings.project)
  useNothingToShow(!project)
  if (!project) return <Note>Choose a project in its settings, or connect its Project.</Note>
  return (
    <Body>
      <WorkProject
        key={project}
        projectId={project}
        selectedItemId={selected}
        onOpenItem={open}
      />
    </Body>
  )
}

const item = (name: string, label: string) => ({
  name,
  label,
  type: 'item' as const,
})

const selection = {
  outputs: [item('selected', 'Selected item')],
  events: [item('opened', 'Opened an item')],
  actions: [
    item('select', 'Select an item'),
    { name: 'deselect', label: 'Clear the selection', type: 'json' as const },
  ],
}

const viewSetting = {
  name: 'view',
  label: 'View',
  kind: 'resource' as const,
  resource: 'work-view' as const,
  default: '',
}
const viewInput = { name: 'view', label: 'View', type: 'text' as const }
const barSetting = {
  name: 'bar',
  label: 'Show its bar',
  kind: 'boolean' as const,
  default: true,
}
const sourceSetting = {
  name: 'source',
  label: 'Source',
  kind: 'select' as const,
  options: SOURCE_CHOICES.map((value) => ({
    value,
    label: SOURCE_LABEL[value],
  })),
  default: 'all',
}

export const WORK_MODULES: ReadonlyArray<ModuleDefinition> = [
  builtin({
    id: 'theorem.work.inbox',
    label: 'Work inbox',
    description:
      'What came in for you from the work tracker: review requests, assignments, mentions and CI results. Opening an entry sends its item on.',
    category: 'Work',
    settings: [
      {
        name: 'state',
        label: 'Opens on',
        kind: 'select',
        options: [
          { label: 'All', value: 'all' },
          { label: 'Unread', value: 'unread' },
          { label: 'Snoozed', value: 'snoozed' },
          { label: 'Archived', value: 'archived' },
        ],
        default: 'all',
      },
    ],
    ...selection,
    Component: InboxModule,
  }),
  builtin({
    id: 'theorem.work.list',
    label: 'Work list',
    description:
      'Issues and pull requests as a list, grouped and ordered as its view says. Opening one sends it on.',
    category: 'Work',
    settings: [viewSetting, sourceSetting, barSetting],
    inputs: [viewInput],
    ...selection,
    Component: (view) => <ListModule {...view} layout="list" />,
  }),
  builtin({
    id: 'theorem.work.board',
    label: 'Work board',
    description:
      'Issues and pull requests as columns from the view\'s grouping, status by default. Dragging a card changes the field it is grouped by.',
    category: 'Work',
    settings: [viewSetting, sourceSetting, barSetting],
    inputs: [viewInput],
    ...selection,
    Component: (view) => <ListModule {...view} layout="board" />,
  }),
  builtin({
    id: 'theorem.work.viewbar',
    label: 'Work view bar',
    description:
      'The bar over a work view: filters, grouping, display options and saving. A work list or board for the same view shows what it changes.',
    category: 'Work',
    settings: [viewSetting],
    inputs: [viewInput],
    Component: ViewBarModule,
  }),
  builtin({
    id: 'theorem.work.item',
    label: 'Work item',
    description:
      'One work item: title, description, properties, pull request details and its timeline with a comment box. It has nothing to show until an item comes in.',
    category: 'Work',
    inputs: [item('item', 'Item')],
    events: [item('opened', 'Opened a linked item')],
    Component: ItemModule,
  }),
  builtin({
    id: 'theorem.work.projects',
    label: 'Work projects',
    description:
      'Every tracked project with its status, lead, target date and progress. Opening one sends it on.',
    category: 'Work',
    outputs: [item('selected', 'Selected project')],
    events: [item('opened', 'Opened a project')],
    actions: [
      item('select', 'Select a project'),
      { name: 'deselect', label: 'Clear the selection', type: 'json' },
    ],
    Component: ProjectsModule,
  }),
  builtin({
    id: 'theorem.work.project',
    label: 'Work project',
    description:
      'One project: progress, milestones, status breakdown, recent activity and its items. Opening an item sends it on.',
    category: 'Work',
    settings: [
      {
        name: 'project',
        label: 'Project',
        kind: 'resource',
        resource: 'work-project',
        default: '',
      },
    ],
    inputs: [item('project', 'Project')],
    ...selection,
    Component: ProjectModule,
  }),
]
