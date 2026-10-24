// SOURCING: @xyflow/react (infinite canvas: pan, zoom, minimap, controls, box select, connect, resize), Theorem Spaces via spaces.ts, notes via notes.ts
//
// The canvas is a view of the project's Space. React Flow keeps the live
// node state while a card is dragged or resized; each finished gesture
// becomes a Space edit, and the Space cache rebuilds the nodes.
import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react'
import type {
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  OnConnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Icon } from '@/components/icons'
import { NotePicker } from '@/components/notes/note-picker'
import { useNoteView } from '@/components/notes/note-view'
import { noteSource, selectedTextIn } from '@/components/notes/note-panel'
import { useActiveProject } from '@/components/shell/projects'
import { Button } from '@/components/ui/button'
import type { CanvasSource } from '@/lib/theorem/canvas-agent'
import type { Theorem } from '@/lib/theorem/client'
import { describeError } from '@/lib/theorem/client'
import { createNote, noteKey, primeNote } from '@/lib/theorem/notes'
import type { Note } from '@/lib/theorem/notes'
import {
  editSpace,
  isNotePlacement,
  movePlacement,
  removeConnections,
  removePlacements,
  settleSpace,
  spaceIdFor,
  upsertConnection,
  upsertPlacement,
  useSpace,
  useSpaceStatus,
  userAuthorship,
} from '@/lib/theorem/spaces'
import type { NotePlacement } from '@/lib/theorem/spaces'
import { useCanvasView } from './canvas-view'
import { useComposer } from './composer-state'
import { ExportToFolder } from './export-to-folder'
import { NoteNodeView } from './note-node'
import type { NoteNode } from './note-node'
import { EDIT_ZOOM } from './zoom'

const nodeTypes = { note: NoteNodeView }
const NEW_NOTE = { w: 360, h: 280 }
const NEW_NOTE_MARKDOWN = '# Untitled note\n\n'

function toNode(placement: NotePlacement): NoteNode {
  const { x, y, w, h } = placement.rect
  return {
    id: placement.id,
    type: 'note',
    position: { x, y },
    width: w,
    height: h,
    data: { documentId: placement.object.id },
    dragHandle: 'header',
  }
}

function toEdge(connection: Theorem.SpaceConnection): Edge {
  return {
    id: connection.id,
    source: connection.from,
    target: connection.to,
    sourceHandle: connection.from_side,
    targetHandle: connection.to_side,
    label: connection.label,
    markerEnd:
      connection.to_end === 'arrow'
        ? { type: MarkerType.ArrowClosed }
        : undefined,
    markerStart:
      connection.from_end === 'arrow'
        ? { type: MarkerType.ArrowClosed }
        : undefined,
  }
}

const SIDES = new Set<string>(['top', 'right', 'bottom', 'left'])
const side = (handle: string | null | undefined) =>
  handle && SIDES.has(handle) ? (handle as Theorem.SpaceSide) : undefined

function SaveState() {
  const queryClient = useQueryClient()
  const { status, error } = useSpaceStatus()
  const { project } = useActiveProject()
  if (status === 'error')
    return (
      <span className="flex items-center gap-2 text-xs text-error-ink">
        Layout not saved: {describeError(error)}
        {project && (
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              void settleSpace(queryClient, spaceIdFor(project.projectId))
            }
          >
            Retry
          </Button>
        )}
      </span>
    )
  return (
    <span className="text-xs text-ink-faint">
      {status === 'saved' ? 'Layout saved' : 'Saving layout…'}
    </span>
  )
}

function Surface({ projectId, title }: { projectId: string; title: string }) {
  const queryClient = useQueryClient()
  const flow = useReactFlow()
  const { resolvedTheme } = useTheme()
  const space = useSpace(projectId, title)
  const spaceId = spaceIdFor(projectId)
  const openComposer = useComposer((s) => s.open)
  const [picking, setPicking] = useState<{ x: number; y: number }>()
  const [creating, setCreating] = useState<string>()

  const placements = useMemo(
    () => (space.data?.space.placements ?? []).filter(isNotePlacement),
    [space.data],
  )
  // The Space has no selection, so the canvas keeps which edges are selected.
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const edges = useMemo(
    () =>
      (space.data?.space.connections ?? []).map((c) => ({
        ...toEdge(c),
        selected: selectedEdges.has(c.id),
      })),
    [space.data, selectedEdges],
  )

  // React Flow owns the nodes between Space edits: selection, drags, resizes.
  // A Space edit rebuilds them during render, keeping the selection.
  const [nodes, setNodes] = useState<NoteNode[]>([])
  const [shownPlacements, setShownPlacements] = useState<typeof placements>()
  if (shownPlacements !== placements) {
    setShownPlacements(placements)
    const selected = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
    setNodes(
      placements.map((p) => ({ ...toNode(p), selected: selected.has(p.id) })),
    )
  }

  // The Spaces panel focuses a card: select it alone and bring it into view
  // at a zoom where it is editable.
  useEffect(() => {
    useCanvasView.setState({
      canvas: {
        focus: (placementId) => {
          setNodes((current) =>
            current.map((n) =>
              n.selected === (n.id === placementId)
                ? n
                : { ...n, selected: n.id === placementId },
            ),
          )
          void flow.fitView({
            nodes: [{ id: placementId }],
            duration: 300,
            padding: 0.3,
            minZoom: EDIT_ZOOM,
            maxZoom: 1,
          })
        },
      },
    })
    return () => useCanvasView.setState({ canvas: undefined })
  }, [flow])

  const edit = (spaceEdit: Parameters<typeof editSpace>[2]) =>
    editSpace(queryClient, spaceId, spaceEdit)

  const onNodesChange = (changes: NodeChange<NoteNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current))
    const removed = new Set<string>()
    for (const change of changes) {
      if (change.type === 'remove') removed.add(change.id)
      // A finished drag or resize becomes one Space edit.
      if (
        (change.type === 'position' && change.dragging === false) ||
        (change.type === 'dimensions' && change.resizing === false)
      ) {
        const node = flow.getNode(change.id)
        if (!node) continue
        const position =
          change.type === 'position' && change.position
            ? change.position
            : node.position
        const width =
          change.type === 'dimensions' && change.dimensions
            ? change.dimensions.width
            : (node.width ?? node.measured?.width)
        const height =
          change.type === 'dimensions' && change.dimensions
            ? change.dimensions.height
            : (node.height ?? node.measured?.height)
        if (!width || !height) continue
        edit(movePlacement(change.id, { ...position, w: width, h: height }))
      }
    }
    // Deleting a card removes its placement; the note itself stays in Theorem.
    if (removed.size) edit(removePlacements(removed))
  }

  const onEdgesChange = (changes: EdgeChange[]) => {
    if (changes.some((c) => c.type === 'select'))
      setSelectedEdges(
        new Set(
          applyEdgeChanges(changes, edges).flatMap((e) =>
            e.selected ? [e.id] : [],
          ),
        ),
      )
    const removed = new Set(
      changes.flatMap((c) => (c.type === 'remove' ? [c.id] : [])),
    )
    if (removed.size) edit(removeConnections(removed))
  }

  const onConnect: OnConnect = ({
    source,
    target,
    sourceHandle,
    targetHandle,
  }) => {
    if (source === target) return
    edit(
      upsertConnection({
        id: `c:${crypto.randomUUID()}`,
        from: source,
        to: target,
        from_side: side(sourceHandle),
        to_side: side(targetHandle),
        to_end: 'arrow',
      }),
    )
  }

  const place = (documentId: string, at: { x: number; y: number }) =>
    edit(
      upsertPlacement({
        target: 'object',
        id: `p:${crypto.randomUUID()}`,
        rect: { x: at.x, y: at.y, ...NEW_NOTE },
        authorship: userAuthorship,
        object: { kind: 'document', id: documentId },
      }),
    )

  const newNote = async (at: { x: number; y: number }) => {
    setCreating(undefined)
    try {
      const note = await createNote(NEW_NOTE_MARKDOWN)
      primeNote(queryClient, note)
      place(note.documentId, at)
    } catch (error) {
      setCreating(describeError(error))
    }
  }

  const viewportCenter = () => {
    const bounds = document
      .querySelector('.theorem-canvas')
      ?.getBoundingClientRect()
    return flow.screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? 0) / 2 - NEW_NOTE.w / 2,
      y: (bounds?.top ?? 0) + (bounds?.height ?? 0) / 2 - NEW_NOTE.h / 2,
    })
  }

  /** A composer source for each card, from the shared note cache. */
  const sourcesFor = (ids: readonly string[], quote?: string): CanvasSource[] =>
    ids.flatMap((id) => {
      const placement = placements.find((p) => p.id === id)
      const note =
        placement &&
        queryClient.getQueryData<Note>(noteKey(placement.object.id))
      return note ? [noteSource(note, id, quote)] : []
    })

  const selectedIds = () => nodes.filter((n) => n.selected).map((n) => n.id)

  const onNodeContextMenu = (event: ReactMouseEvent, node: Node) => {
    const element = (event.target as Element).closest('.react-flow__node')
    const quote = element ? selectedTextIn(element) : undefined
    // In the editor without a selection, the browser's own menu stays.
    if (!quote && (event.target as Element).closest('.milkdown')) return
    event.preventDefault()
    const selection = selectedIds()
    openComposer({
      anchor: { x: event.clientX, y: event.clientY },
      sources: quote
        ? sourcesFor([node.id], quote)
        : sourcesFor(selection.includes(node.id) ? selection : [node.id]),
    })
  }

  const onPaneContextMenu = (event: ReactMouseEvent | MouseEvent) => {
    event.preventDefault()
    openComposer({
      anchor: { x: event.clientX, y: event.clientY },
      sources: [],
      at: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    })
  }

  const onSelectionContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault()
    openComposer({
      anchor: { x: event.clientX, y: event.clientY },
      sources: sourcesFor(selectedIds()),
    })
  }

  /** Cmd/Ctrl+Enter asks about the selected cards. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
    if ((event.target as Element).closest('.milkdown, input, textarea')) return
    const ids = selectedIds()
    if (!ids.length) return
    event.preventDefault()
    const box = flow.getNodesBounds(ids)
    const corner = flow.flowToScreenPosition({ x: box.x + box.width, y: box.y })
    openComposer({ anchor: corner, sources: sourcesFor(ids) })
  }

  if (space.isPending)
    return <p className="p-6 text-sm text-ink-muted">Loading the canvas…</p>
  if (space.isError)
    return (
      <p className="p-6 text-sm text-ink-muted">
        The canvas could not load: {describeError(space.error)}
      </p>
    )

  return (
    <div className="theorem-canvas h-full w-full" onKeyDown={onKeyDown}>
      <ReactFlow<NoteNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={(event, node) => {
          // Inside the editor a double-click selects a word.
          if ((event.target as Element).closest('.milkdown')) return
          const documentId = placements.find((p) => p.id === node.id)?.object.id
          if (documentId) useNoteView.getState().open(documentId)
        }}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onSelectionContextMenu={onSelectionContextMenu}
        onDoubleClick={(event) => {
          if (!(event.target as Element).classList.contains('react-flow__pane'))
            return
          void newNote(
            flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          )
        }}
        connectionMode={ConnectionMode.Loose}
        zoomOnDoubleClick={false}
        onlyRenderVisibleElements
        minZoom={0.1}
        maxZoom={2}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
        colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-raised" />
        <Panel position="top-left" className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void newNote(viewportCenter())}
          >
            <Icon.Add />
            New note
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPicking(viewportCenter())}
          >
            <Icon.Search />
            Add note
          </Button>
          <ExportToFolder title={title} space={space.data.space} />
          {creating && (
            <span className="text-xs text-error-ink">{creating}</span>
          )}
        </Panel>
        <Panel position="top-right">
          <SaveState />
        </Panel>
        {!placements.length && (
          <Panel position="bottom-center" className="mb-16">
            <p className="text-sm text-ink-muted">
              Double-click to start a note. Right-click anything to ask Theorem.
            </p>
          </Panel>
        )}
      </ReactFlow>
      <NotePicker
        open={picking !== undefined}
        onOpenChange={(open) => !open && setPicking(undefined)}
        title="Add a note to the canvas"
        onPick={(doc) => picking && place(doc.documentId, picking)}
      />
    </div>
  )
}

/** Spaces mode: the active project's canvas. */
export function Canvas() {
  const { project, isPending } = useActiveProject()
  if (!project)
    return (
      <p className="p-6 text-sm text-ink-muted">
        {isPending ? 'Loading the project…' : 'No project to show.'}
      </p>
    )
  return (
    <ReactFlowProvider>
      <Surface
        key={project.projectId}
        projectId={project.projectId}
        title={project.title}
      />
    </ReactFlowProvider>
  )
}
