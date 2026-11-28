// SOURCING: zustand (the notes workspace's dock, set while Notes mode shows it), dockview-core's DockviewApi (where each open note sits)
import type { DockviewApi, IDockviewPanel } from 'dockview-react'
import { create } from 'zustand'

/**
 * What a pane shows: a document (any standard-library object), a register
 * record, a library of objects, the graph, a class's editor, or the list of
 * classes. The pane's id is `<kind>:<key>`, so the same thing opens once.
 */
export type PaneSpec =
  | { kind: 'note'; key: string }
  /** `all`, `class:<id>` or `collection:<id>`. */
  | { kind: 'library'; key: string }
  /** `record:<class name>/<id>` (records/model recordItemId). */
  | { kind: 'record'; key: string }
  /** `global`, `local:<object ref>` or `collection:<id>`. */
  | { kind: 'graph'; key: string }
  /** A class id, or `new`. */
  | { kind: 'class'; key: string }
  | { kind: 'classes'; key: 'all' }

export type PaneKind = PaneSpec['kind']

const KINDS: readonly PaneKind[] = [
  'note',
  'library',
  'record',
  'graph',
  'class',
  'classes',
]

/** A note's pane id in the notes workspace. */
export const NOTE_PANE = 'note:'
export const notePaneId = (documentId: string) => `${NOTE_PANE}${documentId}`
export const documentOfPane = (panelId: string) =>
  panelId.startsWith(NOTE_PANE) ? panelId.slice(NOTE_PANE.length) : undefined

export const paneId = (spec: PaneSpec) => `${spec.kind}:${spec.key}`

export function specOfPane(panelId: string): PaneSpec | undefined {
  const at = panelId.indexOf(':')
  const kind = panelId.slice(0, at) as PaneKind
  return at > 0 && KINDS.includes(kind)
    ? ({ kind, key: panelId.slice(at + 1) } as PaneSpec)
    : undefined
}

/** Where the workspace's layout is kept on this device. */
export const LAYOUT_KEY = 'theorem-ui:notes-workspace'

const paneOptions = (spec: PaneSpec) => ({
  id: paneId(spec),
  component: spec.kind,
  tabComponent: spec.kind,
  // A note's params keep their old name, so a kept layout still opens.
  params: spec.kind === 'note' ? { documentId: spec.key } : { key: spec.key },
  title: spec.kind === 'note' ? 'Note' : spec.kind,
  minimumWidth: 320,
})

const asSpec = (target: string | PaneSpec): PaneSpec =>
  typeof target === 'string' ? { kind: 'note', key: target } : target

/**
 * Opens a note or other pane in the pane that has focus, in place of what it
 * shows: the list browses in the pane you are working in. One already open
 * anywhere is focused where it is.
 */
export function openInFocus(api: DockviewApi, target: string | PaneSpec) {
  const spec = asSpec(target)
  const existing = api.getPanel(paneId(spec))
  if (existing) {
    existing.api.setActive()
    return existing
  }
  const replaced: IDockviewPanel | undefined = api.activePanel ?? undefined
  const added = replaced
    ? api.addPanel({
        ...paneOptions(spec),
        position: { referencePanel: replaced.id, direction: 'within' },
      })
    : api.addPanel(paneOptions(spec))
  if (replaced) api.removePanel(replaced)
  added.api.setActive()
  return added
}

/** Opens a note or other pane in a new pane to the right of the one that has focus. */
export function openBeside(api: DockviewApi, target: string | PaneSpec) {
  const spec = asSpec(target)
  const existing = api.getPanel(paneId(spec))
  if (existing) {
    existing.api.setActive()
    return existing
  }
  const reference = api.activeGroup
  const added = reference
    ? api.addPanel({
        ...paneOptions(spec),
        position: { referenceGroup: reference, direction: 'right' },
      })
    : api.addPanel(paneOptions(spec))
  added.api.setActive()
  return added
}

type NotesWorkspace = {
  /** Set while Notes mode shows the workspace. */
  api: DockviewApi | undefined
  /** What a phone shows in place of the workspace, when it is not a note. */
  phone: PaneSpec | undefined
  /** The focused pane's id, so the navigator can mark what is open. */
  active: string | undefined
  /**
   * Opens a note in a new pane beside the focused one. False without the
   * workspace on screen (a phone), where the caller opens it the usual way.
   */
  openBeside: (documentId: string) => boolean
  /**
   * Opens any pane: in the focused one, or beside it. Without the workspace
   * (a phone) it becomes what Notes shows.
   */
  open: (spec: PaneSpec, options?: { beside?: boolean }) => void
  /** Closes the note's pane, if it is open. */
  close: (documentId: string) => void
}

export const useNotesWorkspace = create<NotesWorkspace>()((set, get) => ({
  api: undefined,
  phone: undefined,
  active: undefined,
  openBeside: (documentId) => {
    const { api } = get()
    if (api) openBeside(api, documentId)
    return Boolean(api)
  },
  open: (spec, options) => {
    const { api } = get()
    if (!api) return set({ phone: spec, active: paneId(spec) })
    if (options?.beside) openBeside(api, spec)
    else openInFocus(api, spec)
  },
  close: (documentId) => {
    const { api } = get()
    const panel = api?.getPanel(notePaneId(documentId))
    if (api && panel) api.removePanel(panel)
  },
}))
