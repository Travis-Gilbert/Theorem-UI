// SOURCING: @xyflow/react (infinite canvas: pan, zoom, minimap, controls, box select, connect, resize, parentId subflows for groups, getIntersectingNodes for dropping into one), Theorem Spaces via spaces.ts, notes via notes.ts
//
// The canvas is a view of one Space. React Flow keeps the live node state while
// a card is dragged or resized; each finished gesture becomes a Space edit, and
// the Space cache rebuilds the nodes. Rects in a Space are always canvas
// positions; only React Flow's nodes are relative to their group.
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
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Input } from '@/components/coss/input'
import { Icon } from '@/components/icons'
import { BLOCK_CONTROLS } from '@/components/notes/kinds/embed-block'
import { linkBlock, useBlockPickers } from '@/components/notes/kinds/pickers'
import type { PickedBlock } from '@/components/notes/kinds/pickers'
import { useNoteView } from '@/components/notes/note-view'
import { noteSource, selectedTextIn } from '@/components/notes/note-panel'
import { useActiveProject } from '@/components/shell/projects'
import { freeSpot } from '@/lib/free-spot'
import { Button } from '@/components/ui/button'
import type { CanvasSource } from '@/lib/theorem/canvas-agent'
import type { Theorem } from '@/lib/theorem/client'
import { describeError } from '@/lib/theorem/client'
import { noteHolding, noteShape, starterFor } from '@/lib/theorem/note-kinds'
import { createNote, noteKey, primeNote } from '@/lib/theorem/notes'
import type { Note } from '@/lib/theorem/notes'
import {
  createChildSpace,
  editSpace,
  isNotePlacement,
  movePlacement,
  moveGroup,
  projectSeed,
  removeConnections,
  removeGroups,
  removePlacements,
  renameSpace,
  resizeGroup,
  setPlacementGroup,
  settleSpace,
  spaceKey,
  upsertConnection,
  upsertGroup,
  upsertPlacement,
  useSpaceRecord,
  useSpaceStatus,
  userAuthorship,
} from '@/lib/theorem/spaces'
import type { SpaceSeed } from '@/lib/theorem/spaces'
import { useCanvasView } from './canvas-view'
import { useComposer } from './composer-state'
import { ExportToFolder } from './export-to-folder'
import { GroupNodeView } from './group-node'
import type { GroupNode } from './group-node'
import { NoteKindBar } from './note-kind-bar'
import type { BarAction } from './note-kind-bar'
import { NoteNodeView } from './note-node'
import type { NoteNode } from './note-node'
import { FALLBACK_CANVAS_TITLE, SpaceNodeView } from './space-node'
import type { SpaceNode } from './space-node'
import { EDIT_ZOOM } from './zoom'

type CanvasNode = NoteNode | SpaceNode | GroupNode
type Point = { x: number; y: number }
type Size = { w: number; h: number }

const nodeTypes = {
  note: NoteNodeView,
  space: SpaceNodeView,
  // Not "group": React Flow's stylesheet paints that type's box.
  frame: GroupNodeView,
}

const SIZES = {
  note: { w: 360, h: 280 },
  text: { w: 260, h: 120 },
  block: { w: 360, h: 240 },
  image: { w: 320, h: 240 },
  video: { w: 372, h: 208 },
  audio: { w: 372, h: 120 },
  pdf: { w: 372, h: 372 },
  file: { w: 300, h: 72 },
  link: { w: 240, h: 56 },
  object: { w: 300, h: 72 },
  canvas: { w: 280, h: 240 },
  group: { w: 480, h: 320 },
} satisfies Record<string, Size>

const GROUP_PADDING = 32
/** A group's own row, then the row a card's title takes above the card. */
const GROUP_HEADER = 60
/** Between new cards: a group can frame the lower one and still clear the upper. */
const NEW_CARD_GAP = GROUP_HEADER + 24

function nodesFrom(space: Theorem.Space): CanvasNode[] {
  const groups = space.groups ?? []
  const frames = new Map(groups.map((group) => [group.id, group]))
  return [
    // React Flow wants a group before what it holds.
    ...groups.map(
      (group): GroupNode => ({
        id: group.id,
        type: 'frame',
        position: { x: group.rect.x, y: group.rect.y },
        width: group.rect.w,
        height: group.rect.h,
        data: { spaceId: space.id, group },
      }),
    ),
    ...(space.placements ?? []).flatMap((placement): CanvasNode[] => {
      const { x, y, w, h } = placement.rect
      const frame = placement.group ? frames.get(placement.group) : undefined
      const base = {
        id: placement.id,
        position: frame
          ? { x: x - frame.rect.x, y: y - frame.rect.y }
          : { x, y },
        width: w,
        height: h,
        ...(frame ? { parentId: frame.id } : {}),
      }
      if (isNotePlacement(placement))
        return [
          {
            ...base,
            type: 'note',
            data: { documentId: placement.object.id },
          },
        ]
      if (placement.target === 'space')
        return [
          {
            ...base,
            type: 'space',
            data: { spaceId: placement.space, label: placement.label },
          },
        ]
      return []
    }),
  ]
}

const ARROW = {
  type: MarkerType.ArrowClosed,
  width: 11,
  height: 11,
  color: 'var(--ink-faint)',
}

function toEdge(connection: Theorem.SpaceConnection): Edge {
  return {
    id: connection.id,
    source: connection.from,
    target: connection.to,
    sourceHandle: connection.from_side,
    targetHandle: connection.to_side,
    label: connection.label,
    markerEnd: connection.to_end === 'arrow' ? ARROW : undefined,
    markerStart: connection.from_end === 'arrow' ? ARROW : undefined,
  }
}

const SIDES = new Set<string>(['top', 'right', 'bottom', 'left'])
const side = (handle: string | null | undefined) =>
  handle && SIDES.has(handle) ? (handle as Theorem.SpaceSide) : undefined

function SaveState({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient()
  const { status, error } = useSpaceStatus()
  if (status === 'error')
    return (
      <span className="flex items-center gap-2 text-xs text-error-ink">
        Layout not saved: {describeError(error)}
        <Button
          variant="outline"
          size="xs"
          onClick={() => void settleSpace(queryClient, spaceId)}
        >
          Retry
        </Button>
      </span>
    )
  return (
    <span className="text-xs text-ink-faint">
      {status === 'saved' ? 'Layout saved' : 'Saving layout…'}
    </span>
  )
}

/** The way down from the project's canvas. The canvas on screen renames here. */
function Breadcrumb({
  rootTitle,
  title,
  onRename,
}: {
  rootTitle: string
  title: string
  onRename: (title: string) => void
}) {
  const trail = useCanvasView((s) => s.trail)
  const backTo = useCanvasView((s) => s.backTo)
  const [text, setText] = useState(title)
  const [shown, setShown] = useState(title)
  if (shown !== title) {
    setShown(title)
    setText(title)
  }
  const crumb =
    'max-w-48 truncate rounded-md px-1.5 py-0.5 text-sm text-ink-muted hover:bg-hover hover:text-ink'
  return (
    <nav aria-label="Canvas" className="flex min-w-0 items-center gap-0.5">
      {trail.length ? (
        <button type="button" className={crumb} onClick={() => backTo(-1)}>
          {rootTitle}
        </button>
      ) : (
        <span className="truncate px-1.5 py-0.5 text-sm text-ink">
          {rootTitle}
        </span>
      )}
      {trail.map((item, index) => (
        <Fragment key={item.spaceId}>
          <Icon.ChevronRight
            aria-hidden
            className="size-3.5 shrink-0 text-ink-faint"
          />
          {index < trail.length - 1 ? (
            <button
              type="button"
              className={crumb}
              onClick={() => backTo(index)}
            >
              {item.title}
            </button>
          ) : (
            <Input
              unstyled
              aria-label="Canvas title"
              className="w-40 [&_input]:px-1.5 [&_input]:py-0.5 [&_input]:text-sm [&_input]:text-ink"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onBlur={() => {
                const next = text.trim()
                if (next && next !== title) onRename(next)
                else setText(title)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          )}
        </Fragment>
      ))}
    </nav>
  )
}

function Surface({ seed, rootTitle }: { seed: SpaceSeed; rootTitle: string }) {
  const queryClient = useQueryClient()
  const flow = useReactFlow<CanvasNode, Edge>()
  const { resolvedTheme } = useTheme()
  const { spaceId } = seed
  const record = useSpaceRecord(seed)
  const space = record.data?.space
  const openComposer = useComposer((s) => s.open)
  const editing = useCanvasView((s) => s.editing)
  const arriving = useCanvasView((s) => s.arriving)
  const wrapper = useRef<HTMLDivElement>(null)
  const [problem, setProblem] = useState<string>()

  const placements = useMemo(
    () => (space?.placements ?? []).filter(isNotePlacement),
    [space],
  )
  // The Space has no selection, so the canvas keeps which edges are selected.
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const edges = useMemo(
    () =>
      (space?.connections ?? []).map((c) => ({
        ...toEdge(c),
        selected: selectedEdges.has(c.id),
      })),
    [space, selectedEdges],
  )

  // React Flow owns the nodes between Space edits: selection, drags, resizes.
  // A Space edit rebuilds them during render, keeping the selection and any
  // gesture still under way, whose own edit comes when it ends.
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [shownSpace, setShownSpace] = useState<Theorem.Space>()
  if (space && shownSpace !== space) {
    setShownSpace(space)
    const current = new Map(nodes.map((node) => [node.id, node]))
    const arrived = space.placements?.some((p) => p.id === arriving)
      ? arriving
      : undefined
    setNodes(
      nodesFrom(space).map((node): CanvasNode => {
        const now = current.get(node.id)
        const selected = arrived ? node.id === arrived : !!now?.selected
        return now?.dragging || now?.resizing
          ? ({
              ...node,
              selected,
              position: now.position,
              width: now.width,
              height: now.height,
              dragging: now.dragging,
              resizing: now.resizing,
            })
          : { ...node, selected }
      }),
    )
  }

  // Typing ends when the card stops being selected. A card still on its way
  // in is selected as soon as it lands.
  useEffect(() => {
    if (
      editing &&
      editing !== arriving &&
      !nodes.some((node) => node.id === editing && node.selected)
    )
      useCanvasView.setState({ editing: undefined })
  }, [editing, arriving, nodes])

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

  /** A finished gesture, as a Space edit. */
  const finishGesture = (
    id: string,
    gesture: 'drag' | 'resize',
    position: Point | undefined,
    size: { width: number; height: number } | undefined,
  ) => {
    const node = flow.getNode(id)
    if (!node) return
    const at = position ?? node.position
    const width = size?.width ?? node.width ?? node.measured?.width
    const height = size?.height ?? node.height ?? node.measured?.height
    if (!width || !height) return
    if (node.type === 'frame') {
      const rect = { ...at, w: width, h: height }
      edit(gesture === 'drag' ? moveGroup(id, rect) : resizeGroup(id, rect))
      return
    }
    const frame = node.parentId
      ? flow.getInternalNode(node.parentId)?.internals.positionAbsolute
      : undefined
    const x = at.x + (frame?.x ?? 0)
    const y = at.y + (frame?.y ?? 0)
    edit(movePlacement(id, { x, y, w: width, h: height }))
    if (gesture !== 'drag') return
    // Where a card's middle lands decides which group it is in.
    const into = flow
      .getIntersectingNodes({
        x: x + width / 2,
        y: y + height / 2,
        width: 1,
        height: 1,
      })
      .find((other) => other.type === 'frame')
    if (into?.id !== node.parentId) edit(setPlacementGroup(id, into?.id))
  }

  const onNodesChange = (changes: NodeChange<CanvasNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current))
    const removedGroups = new Set<string>()
    const removed = new Set<string>()
    for (const change of changes) {
      if (change.type === 'remove')
        (nodes.find((n) => n.id === change.id)?.type === 'frame'
          ? removedGroups
          : removed
        ).add(change.id)
      if (change.type === 'position' && change.dragging === false)
        finishGesture(change.id, 'drag', change.position, undefined)
      if (change.type === 'dimensions' && change.resizing === false)
        finishGesture(change.id, 'resize', undefined, change.dimensions)
    }
    // Deleting a card removes its placement; the note itself stays in Theorem.
    if (removed.size) edit(removePlacements(removed))
    if (removedGroups.size) edit(removeGroups(removedGroups))
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

  /** Where a new card goes: the viewport's center, or the nearest open place below it. */
  const openSpot = ({ w, h }: Size): Point => {
    const bounds = wrapper.current?.getBoundingClientRect()
    const center = flow.screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? 0) / 2,
      y: (bounds?.top ?? 0) + (bounds?.height ?? 0) / 2,
    })
    const taken = flow.getNodes().map((node) => ({
      ...(flow.getInternalNode(node.id)?.internals.positionAbsolute ??
        node.position),
      width: node.measured?.width ?? node.width ?? 0,
      height: node.measured?.height ?? node.height ?? 0,
    }))
    const spot = freeSpot(
      { x: center.x - w / 2, y: center.y - h / 2 },
      taken,
      { width: w, height: h },
      NEW_CARD_GAP,
    )
    // Past the fold the card would arrive unseen, so the view follows it.
    const fold = flow.screenToFlowPosition({ x: 0, y: bounds?.bottom ?? 0 }).y
    if (spot.y + h > fold)
      void flow.setCenter(spot.x + w / 2, spot.y + h / 2, {
        zoom: flow.getZoom(),
        duration: 240,
      })
    return spot
  }

  const place = (documentId: string, at: Point, size: Size, type = false) => {
    const id = `p:${crypto.randomUUID()}`
    useCanvasView.setState({ arriving: id, editing: type ? id : undefined })
    edit(
      upsertPlacement({
        target: 'object',
        id,
        rect: { ...at, ...size },
        authorship: userAuthorship,
        object: { kind: 'document', id: documentId },
      }),
    )
  }

  /** A new note on the canvas; `type` puts the caret in it. */
  const placeNote = async (
    markdown: string,
    at: Point,
    size: Size,
    type = false,
  ) => {
    setProblem(undefined)
    try {
      const note = await createNote(markdown)
      primeNote(queryClient, note)
      place(note.documentId, at, size, type)
    } catch (error) {
      setProblem(describeError(error))
    }
  }

  const placePicked = async (picked: PickedBlock, at?: Point) => {
    const size = picked.documentId ? SIZES.note : SIZES[picked.shape]
    const point = at ?? openSpot(size)
    if (picked.documentId) place(picked.documentId, point, size)
    // A link card reads as its own title, so it gets none above it.
    else if (picked.shape === 'link')
      await placeNote(picked.markdown, point, size)
    else await placeNote(noteHolding(picked.title, picked.markdown), point, size)
  }

  const pickers = useBlockPickers<Point>({ onPicked: placePicked })

  const newCanvas = async () => {
    setProblem(undefined)
    try {
      const child = await createChildSpace(
        queryClient,
        spaceId,
        FALLBACK_CANVAS_TITLE,
      )
      const id = `p:${crypto.randomUUID()}`
      useCanvasView.setState({ arriving: id })
      edit(
        upsertPlacement({
          target: 'space',
          id,
          rect: { ...openSpot(SIZES.canvas), ...SIZES.canvas },
          authorship: userAuthorship,
          space: child,
          label: FALLBACK_CANVAS_TITLE,
        }),
      )
    } catch (error) {
      setProblem(describeError(error))
    }
  }

  /** Frames what is selected, or starts an empty group mid-screen. */
  const newGroup = () => {
    const id = `g:${crypto.randomUUID()}`
    const members = nodes.filter((n) => n.selected && n.type !== 'frame')
    if (!members.length) {
      edit(
        upsertGroup({
          id,
          rect: { ...openSpot(SIZES.group), ...SIZES.group },
        }),
      )
      return
    }
    const box = flow.getNodesBounds(members.map((n) => n.id))
    edit(
      upsertGroup({
        id,
        rect: {
          x: box.x - GROUP_PADDING,
          y: box.y - GROUP_HEADER,
          w: box.width + GROUP_PADDING * 2,
          h: box.height + GROUP_HEADER + GROUP_PADDING,
        },
      }),
    )
    for (const member of members) edit(setPlacementGroup(member.id, id))
  }

  const onBarAction = (action: BarAction) => {
    if (action.type === 'request') pickers.request(action.request)
    if (action.type === 'canvas') void newCanvas()
    if (action.type === 'group') newGroup()
    if (action.type === 'text')
      void placeNote('', openSpot(SIZES.text), SIZES.text, true)
    if (action.type === 'kind') {
      const size = action.kind === 'note' ? SIZES.note : SIZES.block
      // A diagram shows what it draws; its source opens with the note.
      const type = action.kind !== 'diagram'
      void placeNote(starterFor(action.kind), openSpot(size), size, type)
    }
  }

  // Pasting on the canvas adds what was copied, unless something else takes it.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        target !== document.body &&
        (!wrapper.current?.contains(target) ||
          target.closest('input, textarea, [contenteditable="true"]'))
      )
        return
      const data = event.clipboardData
      const files = [...(data?.files ?? [])]
      const text = data?.getData('text/plain').trim()
      if (files.length) void pickers.uploadFiles(files)
      else if (text && /^https?:\/\/\S+$/i.test(text))
        void placePicked(linkBlock(text))
      else if (text)
        void placeNote(text, openSpot(SIZES.text), SIZES.text)
      else return
      event.preventDefault()
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })

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

  /**
   * Into a card: a canvas opens, a text card takes the caret, and anything
   * else (or anything too small on screen to type in) opens in the note panel.
   */
  const activate = (id: string) => {
    const placement = space?.placements?.find((p) => p.id === id)
    if (placement?.target === 'space') {
      const inner = queryClient.getQueryData<Theorem.SpaceRecord>(
        spaceKey(placement.space),
      )
      useCanvasView.getState().enter({
        spaceId: placement.space,
        title: inner?.space.title ?? placement.label ?? FALLBACK_CANVAS_TITLE,
      })
      return
    }
    if (!placement || !isNotePlacement(placement)) return
    const note = queryClient.getQueryData<Note>(noteKey(placement.object.id))
    if (
      note?.editable &&
      noteShape(note.markdown).body.type === 'text' &&
      flow.getZoom() >= EDIT_ZOOM
    )
      useCanvasView.setState({ editing: id })
    else useNoteView.getState().open(placement.object.id)
  }

  const stopTyping = () => {
    const id = useCanvasView.getState().editing
    if (!id) return
    useCanvasView.setState({ editing: undefined })
    // The editor is going away; the card keeps the keyboard.
    wrapper.current
      ?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
      ?.focus()
  }

  /** Enter goes into the selected card; Cmd/Ctrl+Enter asks about the selection. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as Element
    if (event.key === 'Escape' && editing) {
      // Crepe's slash menu takes its own Escape first.
      if (!document.querySelector('.milkdown-slash-menu[data-show="true"]'))
        stopTyping()
      return
    }
    if (event.key !== 'Enter' || target.closest('.milkdown, input, textarea'))
      return
    const ids = selectedIds()
    if (!ids.length) return
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault()
      const box = flow.getNodesBounds(ids)
      const corner = flow.flowToScreenPosition({
        x: box.x + box.width,
        y: box.y,
      })
      openComposer({ anchor: corner, sources: sourcesFor(ids) })
    } else if (ids.length === 1 && ids[0] && !target.closest('button, a')) {
      event.preventDefault()
      activate(ids[0])
    }
  }

  if (record.isPending)
    return <p className="p-6 text-sm text-ink-muted">Loading the canvas…</p>
  if (record.isError || !space)
    return (
      <p className="p-6 text-sm text-ink-muted">
        The canvas could not load: {describeError(record.error)}
      </p>
    )

  return (
    <div
      ref={wrapper}
      className="theorem-canvas h-full w-full"
      onKeyDown={onKeyDown}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        const files = [...event.dataTransfer.files]
        if (!files.length) return
        event.preventDefault()
        const at = flow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        })
        files.forEach((file, index) =>
          void pickers.uploadFiles([file], {
            x: at.x + index * 32,
            y: at.y + index * 32,
          }),
        )
      }}
    >
      <ReactFlow<CanvasNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        // Deleting a group is taking the frame away, not what it holds.
        onBeforeDelete={async ({ nodes: going, edges: lines }) => {
          const frames = new Set(
            going.filter((n) => n.type === 'frame').map((n) => n.id),
          )
          const kept = going.filter(
            (n) => n.selected || !n.parentId || !frames.has(n.parentId),
          )
          const ids = new Set(kept.map((n) => n.id))
          return {
            nodes: kept,
            edges: lines.filter(
              (line) =>
                line.selected || ids.has(line.source) || ids.has(line.target),
            ),
          }
        }}
        onNodeDoubleClick={(event, node) => {
          // Inside the editor a double-click selects a word, and a viewer's
          // controls keep theirs.
          if (
            (event.target as Element).closest(
              `.milkdown, [${BLOCK_CONTROLS}]`,
            )
          )
            return
          activate(node.id)
        }}
        onPaneClick={stopTyping}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onSelectionContextMenu={onSelectionContextMenu}
        onDoubleClick={(event) => {
          if (!(event.target as Element).classList.contains('react-flow__pane'))
            return
          void placeNote(
            '',
            flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
            SIZES.text,
            true,
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
        <Background gap={24} size={1.5} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-raised" />
        <Panel position="top-center" className="flex items-center gap-1.5">
          <Breadcrumb
            rootTitle={rootTitle}
            title={space.title}
            onRename={(title) => {
              edit(renameSpace(title))
              useCanvasView.getState().renameCrumb(spaceId, title)
            }}
          />
          <ExportToFolder title={space.title} space={space} />
        </Panel>
        <Panel
          position="top-right"
          className="flex flex-col items-end gap-1 text-xs"
        >
          <SaveState spaceId={spaceId} />
          {pickers.uploading && (
            <span className="text-ink-muted">
              Uploading {pickers.uploading}…
            </span>
          )}
          {(pickers.error ?? problem) && (
            <span className="text-error-ink">{pickers.error ?? problem}</span>
          )}
        </Panel>
        <Panel
          position="bottom-center"
          className="flex flex-col items-center gap-2"
        >
          {!nodes.length && (
            <p className="text-sm text-ink-muted">
              Double-click for a text card, or drop a file here. Right-click
              anything to ask Theorem.
            </p>
          )}
          <NoteKindBar onAction={onBarAction} />
        </Panel>
      </ReactFlow>
      {pickers.element}
    </div>
  )
}

/** Spaces mode: the active project's canvas, or a canvas inside it. */
export function Canvas() {
  const { project, isPending } = useActiveProject()
  const crumb = useCanvasView((s) => s.trail.at(-1))
  const setProject = useCanvasView((s) => s.setProject)
  const projectId = project?.projectId
  useLayoutEffect(() => {
    if (projectId) setProject(projectId)
  }, [projectId, setProject])
  if (!project)
    return (
      <p className="p-6 text-sm text-ink-muted">
        {isPending ? 'Loading the project…' : 'No project to show.'}
      </p>
    )
  const seed: SpaceSeed = crumb
    ? { kind: 'custom', ...crumb }
    : projectSeed(project.projectId, project.title)
  return (
    <ReactFlowProvider key={seed.spaceId}>
      <Surface seed={seed} rootTitle={project.title} />
    </ReactFlowProvider>
  )
}
