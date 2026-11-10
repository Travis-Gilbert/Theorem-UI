// SOURCING: the surfaces Theorem already has, each wrapped as a module rather
// than rebuilt: the Index's own columns (ViewColumn, with its header,
// proposals and held revision, at an IndexPlace) and its document Inspector,
// the records' RecordInspector and RecordTable, assistant-ui's Thread on the
// one shared runtime, WorkspaceFilePanel for a vault file, DocumentApp for a
// conversation App, the IDE frame (browser-only Theia) and the tabbed agent
// terminal (terminal-screen over side-terminal's useTerminalTabs, the tabs the
// right drawer shows). DESIGN.md: "the generic module boundary is refined
// from working surfaces".
import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import { create } from 'zustand'
import type { StoreApi, UseBoundStore } from 'zustand'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { DocumentApp } from '@/components/blocks/document-app'
import { useComposerReferences } from '@/components/chat/composer-references'
import { IdeFrame } from '@/components/ide/ide-frame'
import type { Scope as IndexScope } from '@/components/index/contract'
import { ViewColumn } from '@/components/index/index-surface'
import { Inspector } from '@/components/index/inspector'
import {
  IndexPlaceContext,
  useLocalIndexPlace,
} from '@/components/index/navigation'
import type { IndexPlace } from '@/components/index/navigation'
import { observer } from '@/components/index/observe'
import { dataModelViewId } from '@/components/index/programs'
import {
  objectTypeByName,
  parseRecordItemId,
  recordItemId,
} from '@/components/records/model'
import { useDataModel } from '@/components/records/queries'
import { RecordInspector } from '@/components/records/record-inspector'
import { RecordTable } from '@/components/records/record-table'
import { useActiveProject } from '@/components/shell/projects'
import { useShell } from '@/components/shell/shell-state'
import {
  attachToSideTerminal,
  useTerminalTabs,
} from '@/components/terminal/side-terminal'
import {
  TerminalScreen,
  addReference,
} from '@/components/terminal/terminal-screen'
import { Button } from '@/components/ui/button'
import { WorkInspector } from '@/components/work/inspector'
import { parseWorkItemId } from '@/components/work/route'
import { WorkspaceFilePanel } from '@/components/workspace/workspace-file-panel'
import type { Item } from '@/lib/modules/contract'
import { builtin, registerBuiltin } from '@/lib/modules/registry'
import type { ModuleDefinition, ModuleViewProps } from '@/lib/modules/registry'
import type { PageRuntime } from '@/lib/modules/runtime'
import { useVaultClient } from '@/lib/modules/store'
import { isItem, isReference } from '@/lib/modules/values'
import { describeError } from '@/lib/theorem/client'
import { useNothingToShow } from './layout-parts'
import { useModuleAction, usePageRuntime } from './page-runtime'
import { WORK_MODULES } from './work-modules'

function Empty({ children }: { children: string }) {
  return <p className="p-3 text-sm text-ink-muted">{children}</p>
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** An item for a document or record, opened in `scope` when it was. */
const indexItem = (id: string, scope?: IndexScope): Item => ({
  id,
  kind: parseWorkItemId(id)
    ? 'work'
    : parseRecordItemId(id)
      ? 'record'
      : 'document',
  ...(scope && { scope }),
})

const HOME: IndexScope = { kind: 'home' }

/** The Index scope an item says it was opened in, when it names one. */
function itemScope(item: Item): IndexScope | undefined {
  const scope = item.scope
  if (scope?.kind === 'home') return HOME
  if (scope?.kind === 'collection' && typeof scope.collectionId === 'string')
    return { kind: 'collection', collectionId: scope.collectionId }
  return undefined
}

/** One string per scope, for effects that hang on where the place is. */
const scopeKey = (scope: IndexScope) =>
  scope.kind === 'home' ? 'home' : `collection:${scope.collectionId}`

/**
 * An Index view: the Index's own column (its header, what Theorem prepared
 * for it, the view) at a place. In Index mode it can follow the panel beside
 * the rail; anywhere else, or set to its own, it keeps a place of its own that
 * starts at the view its setting names (the scope's pinned view when none).
 */
function IndexViewModule(view: ModuleViewProps) {
  const start = text(view.settings.view)
  const panel = useContext(IndexPlaceContext)
  if (view.settings.follows === 'panel' && panel)
    return <IndexViewAt place={panel} {...view} />
  // A new setting starts the module over at the view it names.
  return <OwnIndexView key={start} start={start} {...view} />
}

function OwnIndexView({ start, ...view }: ModuleViewProps & { start: string }) {
  const place = useLocalIndexPlace(start ? { view: start } : {})
  const { search, navigate } = place
  const moved = (search.view ?? '') !== start || search.scope.kind !== 'home'
  return (
    <div className="flex h-full flex-col">
      {moved && (
        <div className="flex shrink-0 justify-end px-3 pt-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              start ? navigate.openView(start, HOME) : navigate.openHome()
            }
          >
            Back to its view
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <IndexViewAt place={place} {...view} />
      </div>
    </div>
  )
}

/**
 * The column at `place`. The item open there is its Selected output; opening
 * one sends Opened; its actions move the place.
 */
function IndexViewAt({
  place,
  output,
  emit,
}: ModuleViewProps & { place: IndexPlace }) {
  const { search, navigate } = place
  const open = search.item
  const scope = search.scope
  const where = scopeKey(scope)
  useEffect(
    () => output('selected', open ? indexItem(open, scope) : undefined),
    // `where` stands for the scope, which may be a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [output, open, where],
  )
  useModuleAction('select', (payload) => {
    if (isItem(payload)) navigate.openItem(payload.id)
  })
  useModuleAction('deselect', () => navigate.closeItem())
  useModuleAction('openFields', (payload) =>
    navigate.openView(
      dataModelViewId(typeof payload === 'string' ? payload : undefined),
      search.scope,
    ),
  )
  const reporting: IndexPlace = {
    search,
    navigate: {
      ...navigate,
      openItem: (id) => {
        navigate.openItem(id)
        emit('opened', indexItem(id, scope))
      },
    },
  }
  return (
    <IndexPlaceContext.Provider value={reporting}>
      <ViewColumn />
    </IndexPlaceContext.Provider>
  )
}

/**
 * What an action showed, held until the input it overrides changes (to
 * anything, so the same item coming in again after a close shows it).
 */
function useShown(input: Item | undefined) {
  const id = input?.id
  const [shown, setShown] = useState<{
    over: string | undefined
    item: Item | null
  }>()
  const [seen, setSeen] = useState(id)
  if (seen !== id) {
    setSeen(id)
    setShown(undefined)
  }
  const current = shown && shown.over === id ? shown.item : (input ?? null)
  return [current, (item: Item | null) => setShown({ over: id, item })] as const
}

/**
 * A document or record. It says when it has nothing to show, so a split set
 * to fold hides it; closing it, a linked item and Edit fields are its events.
 */
function InspectorModule({ inputs, emit }: ModuleViewProps) {
  const around = useContext(IndexPlaceContext)?.search.scope ?? HOME
  const [current, show] = useShown(
    isItem(inputs.item) ? inputs.item : undefined,
  )
  // The scope the item was opened in: an Index view of its own beside this
  // one is not the place the page provides.
  const scope = (current && itemScope(current)) ?? around
  useNothingToShow(!current)
  useModuleAction('show', (payload) => {
    if (isItem(payload)) show(payload)
  })
  const open = (id: string) => {
    observer().record({ kind: 'item_opened', scope, subjects: [id] })
    const item = indexItem(id, scope)
    show(item)
    emit('opened', item)
  }
  const close = () => {
    show(null)
    if (current) emit('closed', current)
  }
  if (!current)
    return <Empty>Nothing to show yet. Connect its Item, or send it one.</Empty>
  const work = parseWorkItemId(current.id)
  if (work)
    return (
      <WorkInspector
        key={current.id}
        itemId={work}
        onOpen={(id) => open(`work:${id}`)}
        onClose={close}
        className="h-full"
      />
    )
  const record = parseRecordItemId(current.id)
  if (record)
    return (
      <RecordInspector
        key={current.id}
        nameSingular={record.nameSingular}
        recordId={record.recordId}
        onOpenRecord={(name, id) => open(`record:${name}/${id}`)}
        onEditFields={(name) => emit('editFields', name)}
        onClose={close}
        className="h-full"
      />
    )
  return (
    <Inspector
      key={current.id}
      documentId={current.id}
      scope={scope}
      onOpen={open}
      onClose={close}
      className="h-full"
    />
  )
}

function RecordsModule({
  settings,
  output,
  emit,
  instanceId,
}: ModuleViewProps) {
  const model = useDataModel()
  const name = text(settings.object)
  const type = objectTypeByName(model.data, name)
  const [active, setActive] = useState<string>()
  if (!name) return <Empty>Choose an object in its settings.</Empty>
  if (model.isPending)
    return <div className="m-3 h-40 animate-pulse rounded-lg bg-raised" />
  if (!model.data || !type)
    return (
      <Empty>
        {model.error
          ? describeError(model.error)
          : `There is no "${name}" object in the schema.`}
      </Empty>
    )
  const send = (id: string) => {
    const item = indexItem(id)
    output('selected', item)
    emit('opened', item)
  }
  return (
    <div className="p-3">
      <RecordTable
        objectType={type}
        model={model.data}
        viewKey={`page:${instanceId}`}
        activeRecordId={active}
        onOpenRecord={(id) => {
          setActive(id)
          send(recordItemId(type, id))
        }}
        onOpenRelated={(related, id) => send(`record:${related}/${id}`)}
        onEditFields={() => undefined}
      />
    </div>
  )
}

type Owner = { owner?: string }
export type OwnerStore = UseBoundStore<StoreApi<Owner>>

/** Each open page view's runtime, numbered, so two views never share a name. */
const views = new WeakMap<PageRuntime, number>()
let lastView = 0
const viewOf = (runtime: PageRuntime) => {
  let n = views.get(runtime)
  if (n === undefined) views.set(runtime, (n = ++lastView))
  return n
}

/**
 * For a surface there is one of (the conversation, Theia, the agent
 * terminal): which instance shows it. The first placed takes it, another
 * takes it when its owner goes, and "Show it here" moves it. While arranging
 * an instance does not ask for it.
 *
 * An instance is named by its page view and its path in the page. Pages
 * made from one template share instance ids, and a mode's page can be open
 * in use and in Pages at once; the path stays the same while the view
 * switches between arranging and in use. Exported for its test.
 */
export function useOwner(store: OwnerStore, path: string, wanted: boolean) {
  const me = `${viewOf(usePageRuntime())}:${path}`
  const owner = store((s) => s.owner)
  // Before paint, so the first placed never shows "in another place".
  useLayoutEffect(() => {
    if (wanted && !store.getState().owner) store.setState({ owner: me })
  }, [store, me, wanted, owner])
  useEffect(
    () => () => {
      if (store.getState().owner === me) store.setState({ owner: undefined })
    },
    [store, me],
  )
  return {
    mine: owner === me,
    take: () => store.setState({ owner: me }),
  }
}

function Elsewhere({ what, onTake }: { what: string; onTake: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 p-3 text-sm text-ink-muted">
      <p>{what} shows in another place.</p>
      <Button variant="outline" size="sm" onClick={onTake}>
        Show it here
      </Button>
    </div>
  )
}

const useConversationOwner = create<Owner>(() => ({}))

function ConversationModule({ settings, path }: ModuleViewProps) {
  const pinned = text(settings.conversation)
  const { mine, take } = useOwner(useConversationOwner, path, true)
  // The page's binding picks the conversation; the runtime stays the one.
  useEffect(() => {
    if (mine && pinned && useShell.getState().chatThreadId !== pinned)
      useShell.getState().setChatThreadId(pinned)
  }, [mine, pinned])
  useModuleAction('attach', (payload) => {
    if (isReference(payload)) useComposerReferences.getState().add(payload)
  })
  if (!mine) return <Elsewhere what="The conversation" onTake={take} />
  return (
    <div className="h-full min-h-[320px]">
      <Thread autoFocus={false} />
    </div>
  )
}

const useIdeOwner = create<Owner>(() => ({}))

/**
 * Theia, for the active project. Add to chat is its Added event; with its
 * chat set to the page, Theia's own chat closes and Follow follows the agent
 * terminal's active tab, so a connection from Added to a terminal's Attach
 * makes the terminal the conversation.
 */
function IdeModule({ settings, emit, arranging, path }: ModuleViewProps) {
  const { mine, take } = useOwner(useIdeOwner, path, !arranging)
  const { project } = useActiveProject()
  if (arranging)
    return <Empty>Theia opens here while the page is in use.</Empty>
  if (!mine) return <Elsewhere what="The IDE" onTake={take} />
  return (
    <div className="h-full">
      <IdeFrame
        docked={settings.chat !== 'own'}
        onAddToChat={(reference) => {
          emit('added', reference)
          if (settings.chat === 'terminal' && project)
            attachToSideTerminal(project.projectId, reference)
        }}
      />
    </div>
  )
}

const useTerminalOwner = create<Owner>(() => ({}))

/**
 * The active project's agent terminal: its tabs, each an agent thread, the
 * same tabs the right drawer shows. Attach adds a reference to the active
 * tab's next turn.
 */
function TerminalModule({ arranging, path }: ModuleViewProps) {
  const hostId = useId()
  const { project } = useActiveProject()
  const { mine, take } = useOwner(useTerminalOwner, path, !arranging)
  useModuleAction('attach', (payload) => {
    const tab =
      project && useShell.getState().terminalTabs[project.projectId]?.active
    if (!isReference(payload) || !tab) return
    addReference(tab, payload)
    if (mine) document.getElementById(hostId)?.focus()
  })
  if (arranging)
    return (
      <Empty>The agent terminal shows here while the page is in use.</Empty>
    )
  if (!mine) return <Elsewhere what="The agent terminal" onTake={take} />
  return <PageTerminal hostId={hostId} />
}

function PageTerminal({ hostId }: { hostId: string }) {
  // Esc leaves the terminal for the editor, when there is one; it stays open.
  const { tabs, active, onAction } = useTerminalTabs(true, () =>
    document.querySelector<HTMLIFrameElement>('iframe[title="IDE"]')?.focus(),
  )
  return (
    <div className="flex h-full min-w-0 flex-col bg-term pt-1.5">
      <TerminalScreen
        hostId={hostId}
        tabbed
        tabs={tabs}
        active={active}
        onAction={onAction}
        closable={false}
      />
    </div>
  )
}

function FileModule({ settings }: ModuleViewProps) {
  const { client, isPending, missing } = useVaultClient()
  const path = text(settings.path)
  const [moved, setMoved] = useState<{ from: string; to: string }>()
  const shownPath = moved?.from === path ? moved.to : path
  if (!path)
    return <Empty>Choose a file in its settings, or connect its Path.</Empty>
  if (!client)
    return (
      <Empty>
        {isPending
          ? 'Opening the vault…'
          : `The Theorem vault is not available. ${missing}`}
      </Empty>
    )
  return (
    <WorkspaceFilePanel
      key={shownPath}
      file={{ workspaceId: client.workspace.id, entryId: '', path: shownPath }}
      onMoved={(file) => setMoved({ from: path, to: file.path })}
    />
  )
}

function AppModule({ settings }: ModuleViewProps) {
  const documentId = text(settings.app)
  if (!documentId) return <Empty>Choose an App in its settings.</Empty>
  return (
    <div className="p-3">
      <DocumentApp key={documentId} documentId={documentId} initiallyRunning />
    </div>
  )
}

function TextModule({ settings, output }: ModuleViewProps) {
  const body = text(settings.text)
  useEffect(() => output('text', body), [output, body])
  if (!body) return <Empty>Write its text in its settings.</Empty>
  return <p className="p-3 text-sm whitespace-pre-wrap text-ink">{body}</p>
}

function ValueModule({ inputs }: ModuleViewProps) {
  const shown = useMemo(() => {
    if (inputs.value === undefined) return undefined
    try {
      return JSON.stringify(inputs.value, null, 2)
    } catch {
      return String(inputs.value)
    }
  }, [inputs.value])
  if (shown === undefined) return <Empty>Nothing has come in yet.</Empty>
  return (
    <pre className="p-3 font-mono text-xs whitespace-pre-wrap text-ink">
      {shown}
    </pre>
  )
}

const item = (name: string, label: string) => ({
  name,
  label,
  type: 'item' as const,
})

export const BUILTIN_MODULES: ReadonlyArray<ModuleDefinition> = [
  builtin({
    id: 'theorem.index.view',
    label: 'Index view',
    description:
      'A view of your material from the Index, with its header and what Theorem prepared for it. Opening an item sends it on.',
    settings: [
      {
        name: 'view',
        label: 'View',
        kind: 'resource',
        resource: 'index-view',
        default: '',
      },
      {
        name: 'follows',
        label: 'Moves with',
        kind: 'select',
        options: [
          { label: 'Itself', value: 'own' },
          { label: 'The Index panel, in Index mode', value: 'panel' },
        ],
        default: 'own',
      },
    ],
    outputs: [item('selected', 'Selected item')],
    events: [item('opened', 'Opened an item')],
    actions: [
      item('select', 'Select an item'),
      { name: 'deselect', label: 'Clear the selection', type: 'json' },
      { name: 'openFields', label: "Open an object's fields", type: 'text' },
    ],
    Component: IndexViewModule,
  }),
  builtin({
    id: 'theorem.index.inspector',
    label: 'Inspector',
    description:
      'A document or record, with its fields and links. It has nothing to show until an item comes in.',
    inputs: [item('item', 'Item')],
    events: [
      item('opened', 'Opened a linked item'),
      item('closed', 'Closed'),
      { name: 'editFields', label: 'Edit fields', type: 'text' },
    ],
    actions: [item('show', 'Show an item')],
    Component: InspectorModule,
  }),
  ...WORK_MODULES,
  builtin({
    id: 'theorem.records.table',
    label: 'Records',
    description: "One object's records as a table.",
    settings: [
      {
        name: 'object',
        label: 'Object',
        kind: 'resource',
        resource: 'object-type',
        default: '',
      },
    ],
    outputs: [item('selected', 'Selected record')],
    events: [item('opened', 'Opened a record')],
    Component: RecordsModule,
  }),
  builtin({
    id: 'theorem.conversation',
    label: 'Conversation',
    description:
      'The conversation and its composer. Moving it keeps the draft.',
    settings: [
      {
        name: 'conversation',
        label: 'Conversation',
        kind: 'resource',
        resource: 'conversation',
        default: '',
      },
    ],
    actions: [
      { name: 'attach', label: 'Attach to the composer', type: 'reference' },
    ],
    Component: ConversationModule,
  }),
  builtin({
    id: 'theorem.ide',
    label: 'IDE',
    description:
      'Theia, for the active project. Add to chat sends the selection on.',
    settings: [
      {
        name: 'chat',
        label: 'Its chat',
        kind: 'select',
        options: [
          { label: "Theia's own", value: 'own' },
          { label: 'The agent terminal on the right', value: 'terminal' },
          { label: 'On the page, through Added', value: 'page' },
        ],
        default: 'own',
      },
    ],
    events: [{ name: 'added', label: 'Added to chat', type: 'reference' }],
    Component: IdeModule,
  }),
  builtin({
    id: 'theorem.terminal',
    label: 'Agent terminal',
    description:
      "The project's agent terminal, the tabs the right drawer shows.",
    actions: [
      {
        name: 'attach',
        label: "Attach to the active tab's next turn",
        type: 'reference',
      },
    ],
    Component: TerminalModule,
  }),
  builtin({
    id: 'theorem.file',
    label: 'File',
    description: 'A file from the vault, opened with its usual view.',
    settings: [
      {
        name: 'path',
        label: 'File',
        kind: 'resource',
        resource: 'file',
        default: '',
      },
    ],
    inputs: [{ name: 'path', label: 'Path', type: 'text' }],
    Component: FileModule,
  }),
  builtin({
    id: 'theorem.app',
    label: 'App',
    description: 'An App from a conversation, running.',
    settings: [
      {
        name: 'app',
        label: 'App',
        kind: 'resource',
        resource: 'app',
        default: '',
      },
    ],
    Component: AppModule,
  }),
  builtin({
    id: 'theorem.text',
    label: 'Text',
    description: 'A note on the page. Its text is also an output.',
    settings: [{ name: 'text', label: 'Text', kind: 'textarea', default: '' }],
    outputs: [{ name: 'text', label: 'Text', type: 'text' }],
    Component: TextModule,
  }),
  builtin({
    id: 'theorem.value',
    label: 'Value',
    description: 'Shows whatever comes in, to see what a connection carries.',
    inputs: [{ name: 'value', label: 'Value', type: 'json' }],
    Component: ValueModule,
  }),
]

// Importing this module puts the built-ins in the catalog. It is done here,
// once this module has finished loading, rather than by a function its
// importers call: this module and the shell's modes import each other
// (through the Index's navigation), and an importer reached through that cycle would otherwise
// call in before this module's bindings exist.
for (const definition of BUILTIN_MODULES) registerBuiltin(definition)
