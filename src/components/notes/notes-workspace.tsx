// SOURCING: dockview-react (the panes: splits, tabs, drag to rearrange, serialization; the shell's dock uses it too), @tanstack/react-router (the focused pane is the route's documentId), OpenNote (each pane's note, set as a page), NoteMenu (a pane's chevron menu), NoteStatus, the workspace's store (notes-workspace-state.ts)
import { useNavigate, useParams } from '@tanstack/react-router'
import { DockviewReact } from 'dockview-react'
import type {
  DockviewApi,
  DockviewReadyEvent,
  DockviewTheme,
  IDockviewHeaderActionsProps,
  IDockviewPanelHeaderProps,
  IDockviewPanelProps,
} from 'dockview-react'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/icons'
import { ClassIcon } from '@/components/objects/class-icon'
import {
  ObjectInspector,
  useInspector,
} from '@/components/objects/object-inspector'
import { ObjectLibrary } from '@/components/objects/object-library'
import {
  InspectorToggle,
  noteClass,
  objectPanes,
  objectTabs,
} from '@/components/objects/object-panes'
import { useClassRegistry } from '@/lib/objects/register'
import { useNote } from '@/lib/theorem/notes'
import { NoteMenu } from './note-actions'
import { NoteStatus } from './note-panel'
import { NoteToolbox } from './note-toolbox'
import { OpenNote } from './open-note'
import {
  documentOfPane,
  LAYOUT_KEY,
  openInFocus,
  specOfPane,
  useNotesWorkspace,
} from './notes-workspace-state'

/** The panes stand apart as cards, a gap of the sheet between them. */
const theme: DockviewTheme = {
  name: 'theorem-notes',
  className: 'dockview-theme-theorem notes-dock',
  gap: 10,
}

const readLayout = () => {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    return saved
      ? (JSON.parse(saved) as Parameters<DockviewApi['fromJSON']>[0])
      : undefined
  } catch {
    return undefined
  }
}

const saveLayout = (api: DockviewApi) => {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()))
  } catch {
    // A private window or a full store keeps the layout for this visit only.
  }
}

/** Subscribes React to a dockview event; dockview events return a disposable. */
const subscribe =
  (event: (listener: () => void) => { dispose: () => void }) =>
  (onChange: () => void) => {
    const disposable = event(onChange)
    return () => disposable.dispose()
  }

/** The shell's panel controls, shown in the top-right pane's pill. */
const ShellActions = createContext<ReactNode>(null)

function NotePane({
  api,
  params,
}: IDockviewPanelProps<{ documentId: string }>) {
  const title = useNote(params.documentId).data?.title
  useEffect(() => {
    if (title) api.setTitle(title)
  }, [api, title])
  const inspector = useInspector((s) => s.open)
  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <OpenNote
          documentId={params.documentId}
          chrome="page"
          toolsKey={api.id}
        />
      </div>
      {inspector && <ObjectInspector objectRef={params.documentId} />}
    </div>
  )
}

/**
 * A pane's tab, drawn as the pill at its top left: the note's mark, its
 * title and the chevron of its menu. Dragging it moves the note to another
 * pane or splits one; several notes in one pane are several pills.
 */
function NoteTab({
  api,
  params,
}: IDockviewPanelHeaderProps<{ documentId: string }>) {
  const note = useNote(params.documentId).data
  const cls = noteClass(useClassRegistry().registry, note)
  return (
    <div className="flex h-full min-w-0 items-center gap-1.5 ps-1.5 pe-1">
      {cls ? (
        <ClassIcon cls={cls} />
      ) : (
        <Icon.Article
          aria-hidden="true"
          className="size-4 shrink-0 text-ink-faint"
        />
      )}
      <span className="max-w-[16rem] min-w-0 truncate text-[13px] font-medium">
        {note?.title || 'Note'}
      </span>
      {note ? (
        <NoteMenu
          note={note}
          onClose={() => api.close()}
          onTrashed={() => api.close()}
        />
      ) : (
        <span className="size-1" />
      )}
    </div>
  )
}

/** Whether `group` is the pane at the workspace's top right, which holds the shell's controls. */
function useTopRight(
  group: IDockviewHeaderActionsProps['group'],
  api: DockviewApi,
) {
  return useSyncExternalStore(subscribe(api.onDidLayoutChange), () => {
    const corner = api.groups.reduce<typeof group | undefined>(
      (best, candidate) => {
        if (!best) return candidate
        const a = best.element.getBoundingClientRect()
        const b = candidate.element.getBoundingClientRect()
        if (Math.round(b.top) !== Math.round(a.top))
          return b.top < a.top ? candidate : best
        return b.right > a.right ? candidate : best
      },
      undefined,
    )
    return corner === group
  })
}

/** The note showing in `group`, when it has one. */
function useShownNote(group: IDockviewHeaderActionsProps['group']) {
  const active = useSyncExternalStore(
    subscribe(group.api.onDidActivePanelChange),
    () => group.activePanel,
  )
  return { active, documentId: active && documentOfPane(active.id) }
}

/** The pill after a pane's titles: the tools of the editor it shows. */
function PaneTools({ group }: IDockviewHeaderActionsProps) {
  const { active, documentId } = useShownNote(group)
  return active && documentId ? (
    <div className="notes-pane-tools flex h-full items-center ps-1.5">
      <NoteToolbox toolsKey={active.id} />
    </div>
  ) : null
}

/** The pill at a pane's top right: the note's save state and Close, and in the corner pane the shell's controls. */
function PaneActions({ group, containerApi }: IDockviewHeaderActionsProps) {
  const shell = useContext(ShellActions)
  const corner = useTopRight(group, containerApi)
  const { active, documentId } = useShownNote(group)
  const kind = active && specOfPane(active.id)?.kind
  return (
    <div className="flex h-full items-center gap-1.5 pe-2.5">
      {active && kind && kind !== 'note' && (
        <div className="notes-pill flex h-8 items-center gap-1 px-1">
          {kind === 'record' && <InspectorToggle />}
          <button
            type="button"
            aria-label="Close pane"
            onClick={() => active.api.close()}
            className="flex size-6 items-center justify-center rounded-full text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Icon.Close className="size-3.5" />
          </button>
        </div>
      )}
      {active && documentId && (
        <div className="notes-pill flex h-8 items-center gap-1 ps-3 pe-1">
          <NoteStatus documentId={documentId} />
          <InspectorToggle />
          <button
            type="button"
            aria-label="Close pane"
            onClick={() => active.api.close()}
            className="flex size-6 items-center justify-center rounded-full text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Icon.Close className="size-3.5" />
          </button>
        </div>
      )}
      {corner && shell && (
        <div className="notes-pill flex h-8 items-center px-0.5">{shell}</div>
      )}
    </div>
  )
}

const components = { note: NotePane, ...objectPanes }
const tabComponents = { note: NoteTab, ...objectTabs }

/**
 * Notes mode on the desktop: open notes as panes, side by side or stacked,
 * each a card with its pills floating over its top edge. The list opens a
 * note in the focused pane; Open to the side (its menu, or a Ctrl or Cmd
 * click) opens it in a new pane. Drag a pill to move a note into another
 * pane or to split one. The focused pane's note is the route's, and the
 * arrangement is kept on this device.
 */
export function NotesWorkspace({ actions }: { actions?: ReactNode }) {
  const { documentId } = useParams({ strict: false })
  const navigate = useNavigate()
  const [api, setApi] = useState<DockviewApi>()
  const [empty, setEmpty] = useState(true)
  const routed = useRef(documentId)
  useEffect(() => {
    routed.current = documentId
  }, [documentId])

  const onReady = ({ api: ready }: DockviewReadyEvent) => {
    const saved = readLayout()
    if (saved) {
      try {
        ready.fromJSON(saved)
      } catch {
        ready.clear()
      }
    }
    setApi(ready)
  }

  // The workspace is the one the list and the other modes open notes into.
  useEffect(() => {
    if (!api) return
    useNotesWorkspace.setState({ api })
    return () => useNotesWorkspace.setState({ api: undefined })
  }, [api])

  // The route names the note to show: it opens in the focused pane.
  useEffect(() => {
    if (api && documentId) openInFocus(api, documentId)
  }, [api, documentId])

  // Focus names the route, and every change to the arrangement is kept.
  useEffect(() => {
    if (!api) return
    const sync = () => {
      setEmpty(api.panels.length === 0)
      useNotesWorkspace.setState({ active: api.activePanel?.id })
      const active = api.activePanel && documentOfPane(api.activePanel.id)
      if (active && active !== routed.current)
        void navigate({
          to: '/notes/$documentId',
          params: { documentId: active },
          replace: true,
        })
      // A focused pane that is not a note leaves the route without one, so opening that note again opens it.
      else if (!active && api.activePanel && routed.current)
        void navigate({ to: '/notes', replace: true })
      else if (!api.panels.length && routed.current)
        void navigate({ to: '/notes', replace: true })
    }
    const listeners = [
      api.onDidActivePanelChange(sync),
      api.onDidRemovePanel(sync),
      api.onDidLayoutChange(() => {
        setEmpty(api.panels.length === 0)
        saveLayout(api)
      }),
    ]
    sync()
    return () => {
      for (const listener of listeners) listener.dispose()
    }
  }, [api, navigate])

  return (
    <ShellActions.Provider value={actions}>
      <div data-notes-workspace="" className="relative h-full p-2.5">
        <DockviewReact
          className="h-full w-full"
          theme={theme}
          components={components}
          tabComponents={tabComponents}
          defaultTabComponent={NoteTab}
          leftHeaderActionsComponent={PaneTools}
          rightHeaderActionsComponent={PaneActions}
          defaultRenderer="always"
          onReady={onReady}
          getTabContextMenuItems={({ panel, api: dock }) =>
            panel.group.panels.length > 1
              ? [
                  {
                    label: 'Move to a pane on the right',
                    action: () =>
                      panel.api.moveTo({
                        group: dock.addGroup({
                          referenceGroup: panel.group,
                          direction: 'right',
                        }),
                      }),
                  },
                  'separator',
                  'close',
                ]
              : ['close']
          }
        />
        {empty && (
          <div className="absolute inset-2.5 rounded-(--notes-pane-radius) border border-separator bg-(--notes-pane)">
            {actions && (
              <div className="notes-pill absolute end-2.5 top-2 flex h-8 items-center px-0.5">
                {actions}
              </div>
            )}
            <ObjectLibrary scope="all" />
          </div>
        )}
      </div>
    </ShellActions.Provider>
  )
}
