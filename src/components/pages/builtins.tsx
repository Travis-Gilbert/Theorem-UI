// SOURCING: the surfaces Theorem already has, each wrapped as a module rather
// than rebuilt: the Index's ViewRenderer (OpenUI views run against Theorem),
// its document Inspector and the records' RecordInspector and RecordTable,
// assistant-ui's Thread on the one shared runtime, WorkspaceFilePanel for a
// vault file, DocumentApp for a conversation App. DESIGN.md: "the generic
// module boundary is refined from working surfaces".
import { useAui } from '@assistant-ui/react'
import { useEffect, useMemo, useState } from 'react'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { DocumentApp } from '@/components/blocks/document-app'
import {
  focusComposer,
  useComposerReferences,
} from '@/components/chat/composer-references'
import type {
  Scope as IndexScope,
  IndexView,
  ViewRevision,
} from '@/components/index/contract'
import { Inspector } from '@/components/index/inspector'
import type { IndexHost } from '@/components/index/library'
import { observer } from '@/components/index/observe'
import {
  defaultViewFor,
  isDefaultView,
  resolveDefaultView,
  revisionOnScreen,
} from '@/components/index/programs'
import {
  useCollections,
  useSetPreference,
  useStoredView,
} from '@/components/index/queries'
import { ViewRenderer } from '@/components/index/view-renderer'
import type { ViewActions } from '@/components/index/view-renderer'
import {
  objectTypeByName,
  parseRecordItemId,
  recordItemId,
} from '@/components/records/model'
import { useDataModel } from '@/components/records/queries'
import { RecordInspector } from '@/components/records/record-inspector'
import { RecordTable } from '@/components/records/record-table'
import { useOpenMode } from '@/components/shell/modes'
import { useShell } from '@/components/shell/shell-state'
import { Button } from '@/components/ui/button'
import { WorkspaceFilePanel } from '@/components/workspace/workspace-file-panel'
import type { Item } from '@/lib/modules/contract'
import { builtin, registerBuiltin } from '@/lib/modules/registry'
import type { ModuleDefinition, ModuleViewProps } from '@/lib/modules/registry'
import { isItem, isReference } from '@/lib/modules/values'
import { describeError } from '@/lib/theorem/client'
import { useVaultClient } from '@/lib/modules/store'
import { create } from 'zustand'
import { useModuleAction } from './page-runtime'

function Empty({ children }: { children: string }) {
  return <p className="p-3 text-sm text-ink-muted">{children}</p>
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** An item for a document or record the Index opened. */
const indexItem = (id: string, label?: string): Item => ({
  id,
  kind: parseRecordItemId(id) ? 'record' : 'document',
  ...(label && { label }),
})

/**
 * Drafts into the conversation's composer and puts the cursor there, staying
 * on the page when it shows the conversation, else going to Chat.
 */
function useAskInComposer() {
  const aui = useAui()
  const openMode = useOpenMode()
  return (prompt: string, documentIds: string[]) => {
    const listed = documentIds.map((id) => `- (document ${id})`)
    const added = [prompt, ...(listed.length ? ['', ...listed] : [])].join('\n')
    const draft = aui.composer.getState().text.trimEnd()
    aui.composer.setText(draft ? `${draft}\n\n${added}` : added)
    if (!focusComposer()) void openMode('chat')
  }
}

/**
 * An Index view. The revision it first shows is held: a newer one, from the
 * improver or another tab, waits behind a notice, as it does in the Index.
 */
function IndexViewModule(view: ModuleViewProps) {
  const start =
    text(view.settings.view) || defaultViewFor({ kind: 'home' }).viewId
  // A new setting starts the module over at the view it names.
  return <IndexViewAt key={start} start={start} {...view} />
}

function IndexViewAt({
  start,
  output,
  emit,
  path,
}: ModuleViewProps & { start: string }) {
  const [scope, setScope] = useState<IndexScope>({ kind: 'home' })
  const [viewId, setViewId] = useState(start)
  const [selected, setSelected] = useState<string>()
  const collections = useCollections()
  const dataModel = useDataModel()
  const prefer = useSetPreference()
  const ask = useAskInComposer()
  const collectionName = (id: string) =>
    collections.data?.find((c) => c.collectionId === id)?.name
  const objectLabel = (name: string) =>
    objectTypeByName(dataModel.data, name)?.label_plural
  const builtIn = isDefaultView(viewId)
    ? resolveDefaultView(viewId, collectionName, objectLabel)
    : undefined
  const stored = useStoredView(builtIn ? undefined : viewId)
  const shown: IndexView | undefined = builtIn ?? stored.data?.view

  const [held, setHeld] = useState<{ viewId: string; revision: ViewRevision }>()
  if (shown && held?.viewId !== shown.viewId)
    setHeld({ viewId: shown.viewId, revision: shown.current })
  const revision = shown
    ? revisionOnScreen(
        shown,
        held?.viewId === shown.viewId ? held.revision : undefined,
      )
    : undefined
  const newer =
    shown &&
    shown.origin !== 'default' &&
    revision &&
    shown.current.revision > revision.revision

  useModuleAction('select', (payload) => {
    if (isItem(payload)) setSelected(payload.id)
  })

  const host: IndexHost = {
    scope,
    viewId,
    selectedId: selected,
    openItem: (documentId) => {
      observer().record({
        kind: 'item_opened',
        scope,
        viewId,
        subjects: [documentId],
      })
      setSelected(documentId)
      const item = indexItem(documentId)
      output('selected', item)
      emit('opened', item)
    },
    openCollection: (collectionId) => {
      const next: IndexScope = { kind: 'collection', collectionId }
      setScope(next)
      setViewId(defaultViewFor(next, collectionName(collectionId)).viewId)
    },
    openView: setViewId,
    collectionName,
    record: (event) => observer().record({ ...event, scope, viewId }),
  }
  const actions: ViewActions = {
    ask,
    pin: () => {},
    prefer: (statement, documentIds, value) =>
      prefer.mutate({
        scope,
        statement,
        viewId,
        subjects: documentIds.length ? documentIds : undefined,
        value,
      }),
  }
  const moved = viewId !== start || scope.kind !== 'home'

  if (!revision)
    return stored.isPending && !builtIn ? (
      <div className="m-3 h-40 animate-pulse rounded-lg bg-raised" />
    ) : (
      <Empty>
        {stored.error
          ? describeError(stored.error)
          : 'This view is not available.'}
      </Empty>
    )
  return (
    <div className="flex flex-col gap-3 p-3" data-module-path={path}>
      {(moved || newer) && (
        <div className="flex items-center gap-2 text-xs text-ink-muted">
          {newer && (
            <span className="me-auto">This view has a newer revision.</span>
          )}
          {newer && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                setHeld({ viewId: shown.viewId, revision: shown.current })
              }
            >
              Show it
            </Button>
          )}
          {moved && (
            <Button
              variant="ghost"
              size="xs"
              className={newer ? undefined : 'ms-auto'}
              onClick={() => {
                setScope({ kind: 'home' })
                setViewId(start)
              }}
            >
              Back to its view
            </Button>
          )}
        </div>
      )}
      <ViewRenderer definition={revision} host={host} actions={actions} />
    </div>
  )
}

/** Holds what an action showed until the input it overrides changes. */
function useShown(input: Item | undefined) {
  const [shown, setShown] = useState<{
    over: string | undefined
    item: Item | null
  }>()
  const current =
    shown && shown.over === input?.id ? shown.item : (input ?? null)
  return [
    current,
    (item: Item | null) => setShown({ over: input?.id, item }),
  ] as const
}

function InspectorModule({ inputs, emit }: ModuleViewProps) {
  const [current, show] = useShown(
    isItem(inputs.item) ? inputs.item : undefined,
  )
  useModuleAction('show', (payload) => {
    if (isItem(payload)) show(payload)
  })
  const open = (id: string) => {
    const item = indexItem(id)
    show(item)
    emit('opened', item)
  }
  if (!current)
    return <Empty>Nothing to show yet. Connect its Item, or send it one.</Empty>
  const record = parseRecordItemId(current.id)
  if (record)
    return (
      <RecordInspector
        key={current.id}
        nameSingular={record.nameSingular}
        recordId={record.recordId}
        onOpenRecord={(name, id) => open(`record:${name}/${id}`)}
        onClose={() => show(null)}
        className="h-full"
      />
    )
  return (
    <Inspector
      key={current.id}
      documentId={current.id}
      scope={{ kind: 'home' }}
      onOpen={open}
      onClose={() => show(null)}
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

/** Which conversation instance on a page shows the thread; one at a time. */
const useConversationOwner = create<{ owner?: string }>(() => ({}))

function ConversationModule({ settings, path: me }: ModuleViewProps) {
  const pinned = text(settings.conversation)
  const owner = useConversationOwner((s) => s.owner)
  useEffect(() => {
    if (!useConversationOwner.getState().owner)
      useConversationOwner.setState({ owner: me })
    return () => {
      if (useConversationOwner.getState().owner === me)
        useConversationOwner.setState({ owner: undefined })
    }
  }, [me])
  // The page's binding picks the conversation; the runtime stays the one.
  useEffect(() => {
    if (owner === me && pinned && useShell.getState().chatThreadId !== pinned)
      useShell.getState().setChatThreadId(pinned)
  }, [owner, me, pinned])
  useModuleAction('attach', (payload) => {
    if (isReference(payload)) useComposerReferences.getState().add(payload)
  })
  if (owner && owner !== me)
    return <Empty>The conversation shows in another place on this page.</Empty>
  return (
    <div className="h-full min-h-[320px]">
      <Thread autoFocus={false} />
    </div>
  )
}

function FileModule({ settings }: ModuleViewProps) {
  const { client, isPending } = useVaultClient()
  const path = text(settings.path)
  const [moved, setMoved] = useState<{ from: string; to: string }>()
  const shownPath = moved?.from === path ? moved.to : path
  if (!path)
    return <Empty>Choose a file in its settings, or connect its Path.</Empty>
  if (!client)
    return (
      <Empty>
        {isPending ? 'Opening the vault…' : 'The vault is not open.'}
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
      'A view of your material from the Index. Opening an item sends it on.',
    settings: [
      {
        name: 'view',
        label: 'View',
        kind: 'resource',
        resource: 'index-view',
        default: '',
      },
    ],
    outputs: [item('selected', 'Selected item')],
    events: [item('opened', 'Opened an item')],
    actions: [item('select', 'Select an item')],
    Component: IndexViewModule,
  }),
  builtin({
    id: 'theorem.index.inspector',
    label: 'Inspector',
    description: 'A document or record, with its fields and links.',
    inputs: [item('item', 'Item')],
    events: [item('opened', 'Opened a linked item')],
    actions: [item('show', 'Show an item')],
    Component: InspectorModule,
  }),
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
// (useOpenMode), and an importer reached through that cycle would otherwise
// call in before this module's bindings exist.
for (const definition of BUILTIN_MODULES) registerBuiltin(definition)
