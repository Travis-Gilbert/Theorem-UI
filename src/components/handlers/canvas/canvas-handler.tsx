// SOURCING: @xyflow/react (pan, zoom, select, connect, resize, minimap),
// as canvas.tsx uses it, over a JSON Canvas 1.0 file edited through
// json-canvas.ts, so an untouched file keeps its bytes. Base UI Popover for
// adding a link; FilePicker for adding a file.
//
// React Flow holds the live node state while a node is dragged or resized;
// each finished gesture becomes a text edit of the file, and the file's new
// text rebuilds the nodes. Nodes with `theorem:kind` show their kind; running
// an executable graph (plan D14) is Phase 5's, so there are no run controls.
import { Popover } from '@base-ui/react/popover'
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react'
import type { EdgeChange, NodeChange, OnConnect, XYPosition } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  applyCanvasEdits,
  parseCanvas,
  removeNodes,
} from '@/lib/canvas/json-canvas'
import type { CanvasData, CanvasEdit, CanvasNode } from '@/lib/canvas/json-canvas'
import { openFileAt } from '@/lib/handlers/actions'
import { useTextFile } from '@/lib/handlers/file-sync'
import type { FileCardProps, FileViewProps } from '@/lib/handlers/types'
import { FileMessage, FileStatusBar, textFileMessage } from '../file-status'
import { FilePicker } from '../file-picker'
import {
  canvasId,
  nodesInside,
  toFlowEdges,
  toFlowNode,
  withSideHandles,
} from './canvas-flow'
import type { CanvasFlowEdge, CanvasFlowNode, Side } from './canvas-flow'
import {
  CanvasFileContext,
  canvasNodeTypes,
  thumbnailNodeTypes,
} from './canvas-nodes'

const NEW_TEXT = { width: 260, height: 140 }
const NEW_FILE = { width: 400, height: 400 }
const NEW_LINK = { width: 400, height: 120 }

function parse(text: string): CanvasData | Error {
  try {
    return parseCanvas(text)
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

const sideOf = (handle: string | null | undefined) =>
  handle as Side | undefined

function LinkAdder({ onAdd }: { onAdd: (url: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={<Button variant="outline" size="sm" />}>
        <Icon.Link />
        Link
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start" className="z-50">
          <Popover.Popup className="w-80 rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none">
            <Popover.Title className="mb-2 text-xs font-medium text-ink-muted">
              Add a web page
            </Popover.Title>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                const url = new FormData(event.currentTarget).get('url')
                if (typeof url !== 'string' || !url.trim()) return
                onAdd(url.trim())
                setOpen(false)
              }}
            >
              <Input
                name="url"
                type="url"
                required
                autoFocus
                placeholder="https://"
                className="h-8"
              />
              <Button type="submit" size="sm">
                Add
              </Button>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function Surface({
  file,
  canvas,
  text,
  setText,
}: {
  file: FileViewProps
  canvas: CanvasData
  text: string
  setText: (text: string) => void
}) {
  const flow = useReactFlow<CanvasFlowNode, CanvasFlowEdge>()
  const { resolvedTheme } = useTheme()
  const [picking, setPicking] = useState<XYPosition>()

  // Consecutive edits in one turn each build on the one before, and the
  // function stays the same so the nodes that call it need not re-render.
  const latest = useRef({ text, setText })
  useEffect(() => {
    latest.current = { text, setText }
  })
  const [edit] = useState(() => (edits: Array<CanvasEdit>) => {
    if (!edits.length) return
    const next = applyCanvasEdits(latest.current.text, edits)
    latest.current.text = next
    latest.current.setText(next)
  })

  // React Flow owns nodes and edges between file edits; a new canvas rebuilds
  // them, keeping the selection.
  const [nodes, setNodes] = useState<Array<CanvasFlowNode>>([])
  const [edges, setEdges] = useState<Array<CanvasFlowEdge>>([])
  const [shown, setShown] = useState<CanvasData>()
  if (shown !== canvas) {
    setShown(canvas)
    const selected = new Set(
      [...nodes, ...edges].filter((x) => x.selected).map((x) => x.id),
    )
    setNodes(
      canvas.nodes.map((n) => ({ ...toFlowNode(n), selected: selected.has(n.id) })),
    )
    setEdges(
      toFlowEdges(canvas).map((e) => ({ ...e, selected: selected.has(e.id) })),
    )
  }

  /** Nodes that move with a group being dragged, where they started. */
  const carried = useRef<{ group: XYPosition; nodes: Array<CanvasNode> }>(
    undefined,
  )

  const onNodesChange = (changes: Array<NodeChange<CanvasFlowNode>>) => {
    const resized = new Set(
      changes.flatMap((c) => (c.type === 'dimensions' ? [c.id] : [])),
    )
    setNodes((current) =>
      applyNodeChanges(changes, current).map((n) =>
        resized.has(n.id) ? withSideHandles(n) : n,
      ),
    )
    const edits: Array<CanvasEdit> = []
    for (const change of changes) {
      // A finished drag or resize becomes one edit of the file.
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
        edits.push({
          type: 'set',
          list: 'nodes',
          id: change.id,
          values: { x: position.x, y: position.y, width, height },
        })
      }
    }
    edit(edits)
  }

  const onEdgesChange = (changes: Array<EdgeChange<CanvasFlowEdge>>) =>
    setEdges((current) => applyEdgeChanges(changes, current))

  const onConnect: OnConnect = ({ source, target, sourceHandle, targetHandle }) => {
    if (source === target) return
    edit([
      {
        type: 'add',
        list: 'edges',
        item: {
          id: canvasId(),
          fromNode: source,
          fromSide: sideOf(sourceHandle),
          toNode: target,
          toSide: sideOf(targetHandle),
        },
      },
    ])
  }

  const addNode = (node: Omit<CanvasNode, 'id'>) =>
    edit([
      { type: 'add', list: 'nodes', item: { id: canvasId(), ...node } as CanvasNode },
    ])

  const center = (size: { width: number; height: number }) => {
    const bounds = document
      .querySelector(`[data-canvas-file="${CSS.escape(file.path)}"]`)
      ?.getBoundingClientRect()
    const at = flow.screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? 0) / 2,
      y: (bounds?.top ?? 0) + (bounds?.height ?? 0) / 2,
    })
    return { x: at.x - size.width / 2, y: at.y - size.height / 2 }
  }

  const context = useMemo(() => ({ file, edit }), [file, edit])
  return (
    <CanvasFileContext value={context}>
      <div className="h-full w-full" data-canvas-file={file.path}>
        <ReactFlow<CanvasFlowNode, CanvasFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={canvasNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDelete={({ nodes: gone, edges: cut }) =>
            edit([
              ...cut.map((e): CanvasEdit => ({ type: 'remove', list: 'edges', id: e.id })),
              ...removeNodes(canvas, new Set(gone.map((n) => n.id))),
            ])
          }
          onNodeDragStart={(_event, node) => {
            const group = canvas.nodes.find((n) => n.id === node.id)
            carried.current =
              group?.type === 'group'
                ? { group: node.position, nodes: nodesInside(canvas, group) }
                : undefined
          }}
          onNodeDrag={(_event, node) => {
            const move = carried.current
            if (!move) return
            const dx = node.position.x - move.group.x
            const dy = node.position.y - move.group.y
            const inside = new Map(move.nodes.map((n) => [n.id, n]))
            setNodes((current) =>
              current.map((n) => {
                const start = inside.get(n.id)
                return start
                  ? { ...n, position: { x: start.x + dx, y: start.y + dy } }
                  : n
              }),
            )
          }}
          onNodeDragStop={(_event, node) => {
            const move = carried.current
            carried.current = undefined
            if (!move) return
            const dx = node.position.x - move.group.x
            const dy = node.position.y - move.group.y
            edit(
              move.nodes.map((n) => ({
                type: 'set',
                list: 'nodes',
                id: n.id,
                values: { x: n.x + dx, y: n.y + dy },
              })),
            )
          }}
          onNodeDoubleClick={(event, node) => {
            if (node.type !== 'file') return
            if ((event.target as Element).closest('.nodrag')) return
            const { file: path, subpath } = node.data.node
            openFileAt(
              { client: file.client, path: String(path) },
              typeof subpath === 'string' ? subpath : undefined,
            )
          }}
          onDoubleClick={(event) => {
            if (!(event.target as Element).classList.contains('react-flow__pane'))
              return
            const at = flow.screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            })
            addNode({ type: 'text', text: '', ...at, ...NEW_TEXT })
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
              onClick={() =>
                addNode({ type: 'text', text: '', ...center(NEW_TEXT), ...NEW_TEXT })
              }
            >
              <Icon.Add />
              Text
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPicking(center(NEW_FILE))}
            >
              <Icon.TreeFile />
              File
            </Button>
            <LinkAdder
              onAdd={(url) =>
                addNode({ type: 'link', url, ...center(NEW_LINK), ...NEW_LINK })
              }
            />
          </Panel>
          {!canvas.nodes.length && (
            <Panel position="bottom-center" className="mb-16">
              <p className="text-sm text-ink-muted">
                Double-click to add a card.
              </p>
            </Panel>
          )}
        </ReactFlow>
        <FilePicker
          client={file.client}
          open={picking !== undefined}
          onOpenChange={(open) => !open && setPicking(undefined)}
          title="Add a file to the canvas"
          exclude={file.path}
          onPick={(entry) =>
            picking &&
            addNode({ type: 'file', file: entry.path, ...picking, ...NEW_FILE })
          }
        />
      </div>
    </CanvasFileContext>
  )
}

export function CanvasPanel(file: FileViewProps) {
  const text = useTextFile(file)
  const canvas = useMemo(
    () => (text.text === undefined ? undefined : parse(text.text)),
    [text.text],
  )
  const message = textFileMessage(text)
  if (message !== null || !canvas) return <FileMessage>{message}</FileMessage>
  if (canvas instanceof Error)
    return (
      <FileMessage>
        This file is not a JSON Canvas: {canvas.message}
      </FileMessage>
    )
  return (
    <div className="flex h-full min-h-0 flex-col">
      <FileStatusBar file={text} />
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <Surface
            file={file}
            canvas={canvas}
            text={text.text ?? ''}
            setText={text.setText}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}

/** A canvas as a card: a still picture of its nodes and edges. */
export function CanvasCard(file: FileCardProps) {
  const text = useTextFile(file)
  const { resolvedTheme } = useTheme()
  const picture = useMemo(() => {
    if (text.text === undefined) return undefined
    const canvas = parse(text.text)
    return canvas instanceof Error
      ? canvas
      : { nodes: canvas.nodes.map(toFlowNode), edges: toFlowEdges(canvas) }
  }, [text.text])
  const message = textFileMessage(text)
  if (message !== null || !picture)
    return <FileMessage className="text-xs">{message}</FileMessage>
  if (picture instanceof Error)
    return <FileMessage className="text-xs">Not a JSON Canvas.</FileMessage>
  return (
    <div
      className="pointer-events-none h-full w-full"
      aria-label={`${file.path}, a canvas`}
    >
      <ReactFlowProvider>
        <ReactFlow<CanvasFlowNode, CanvasFlowEdge>
          nodes={picture.nodes}
          edges={picture.edges}
          nodeTypes={thumbnailNodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          minZoom={0.01}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
          proOptions={{ hideAttribution: true }}
        />
      </ReactFlowProvider>
    </div>
  )
}
