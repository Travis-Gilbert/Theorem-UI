// SOURCING: @xyflow/react (the canvas, Background, Controls, connection lifecycle),
// following Spaces' canvas setup. Connection law stays with Theorem: verdicts come
// from validate_edge, and only `compatible` shows as a valid drop.
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ControlButton,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTheme } from 'next-themes'
import type {
  Connection,
  Edge,
  EdgeChange,
  EdgeTypes,
  FinalConnectionState,
  FitViewOptions,
  HandleType,
  NodeChange,
  NodeTypes,
  OnBeforeDelete,
  OnConnectEnd,
  OnConnectStartParams,
  OnNodeDrag,
} from '@xyflow/react'
import { Icon } from '@/components/icons'
import type { EdgeVerdict } from '@/lib/program/api'
import { validateEdge } from '@/lib/program/api'
import {
  ghostFlow,
  insertWaypoint,
  portOfHandle,
  relayoutProgram,
  toCanvasNodes,
  toFlowEdges,
} from '@/lib/program/flow'
import type { CanvasFlowNode, ProgramNodeData } from '@/lib/program/flow'
import { spliceExisting, useProgramDoc } from '@/lib/program/store'
import { describeError } from '@/lib/theorem/client'
import {
  ConnectionToasts,
  describeMismatch,
  handleElement,
  refuseAt,
} from './connection-toast'
import { DeleteConfirm, useDeleteConfirm } from './delete-confirm'
import { Palette, usePalette } from './palette'
import { GroupNodeView, NoteNodeView } from './program-annotations'
import { ProgramEdgeView } from './program-edge'
import { ProgramNodeView, SchemaNodeView } from './program-node'
import { ProgramHeader } from './program-header'
import { ProposalReview } from './proposal-review'
import { SelectionBar } from './selection-bar'

const nodeTypes: NodeTypes = {
  program: ProgramNodeView,
  schema: SchemaNodeView,
  note: NoteNodeView,
  programGroup: GroupNodeView,
}
const edgeTypes: EdgeTypes = { program: ProgramEdgeView }

/** Frames the program in the room the bottom bar leaves, at no more than full size. */
const FRAME = {
  padding: { top: '32px', right: '32px', bottom: '72px', left: '32px' },
  maxZoom: 1,
} satisfies FitViewOptions

const pairKey = (connection: {
  source: string | null
  sourceHandle?: string | null
  target: string | null
  targetHandle?: string | null
}) =>
  `${connection.source}/${portOfHandle(connection.sourceHandle)}>${connection.target}/${portOfHandle(connection.targetHandle)}`

const edgeFor = (connection: Connection) => ({
  id: `${connection.source}-${connection.target}-${crypto.randomUUID().slice(0, 8)}`,
  from_node: connection.source,
  from_port: portOfHandle(connection.sourceHandle),
  to_node: connection.target,
  to_port: portOfHandle(connection.targetHandle),
})

function Flow({
  extras,
}: {
  extras: Record<string, Partial<ProgramNodeData>>
}) {
  const { resolvedTheme } = useTheme()
  const program = useProgramDoc((doc) => doc.program)!
  const positions = useProgramDoc((doc) => doc.positions)
  const liveness = useProgramDoc((doc) => doc.liveness)
  const layout = useProgramDoc((doc) => doc.layout)
  const selection = useProgramDoc((doc) => doc.selection)
  const sizes = useProgramDoc((doc) => doc.sizes)
  const proposal = useProgramDoc((doc) => doc.proposal)
  const proposalPlaces = useProgramDoc((doc) => doc.proposalPlaces)
  const flow = useReactFlow()
  // The fitView prop resolves on the first node measured, which frames that one node.
  const measured = useNodesInitialized()
  // The canvas narrows when a first node brings in the side panel, so it frames again
  // at the new width, until the person has moved the view themselves.
  const width = useStore((state) => state.width)
  const framedAt = useRef(0)
  const moved = useRef(false)
  useEffect(() => {
    if (!measured || moved.current || framedAt.current === width) return
    framedAt.current = width
    void flow.fitView(FRAME)
  }, [measured, width, flow])
  const openPalette = usePalette((palette) => palette.openAt)

  const ghost = useMemo(
    () => (proposal ? ghostFlow(proposal, proposalPlaces) : undefined),
    [proposal, proposalPlaces],
  )
  // xyflow measures nodes and hands the sizes back; a controlled node carries them.
  const nodes = useMemo(
    () =>
      [
        ...toCanvasNodes(program, layout, positions, liveness, extras),
        ...(ghost?.nodes ?? []),
      ].map((node) => ({
        ...node,
        selected: selection.includes(node.id),
        ...(sizes[node.id] ? { measured: sizes[node.id] } : {}),
      })),
    [program, layout, positions, liveness, extras, selection, sizes, ghost],
  )
  const edges = useMemo(
    () => [
      ...toFlowEdges(program, liveness).map((edge) =>
        proposal?.diff?.edge_ids_only_in_left.includes(edge.id)
          ? { ...edge, data: { ...edge.data, undetermined: true } }
          : edge,
      ),
      ...(ghost?.edges ?? []),
    ],
    [program, liveness, ghost, proposal],
  )

  const onNodesChange = useCallback(
    (changes: Array<NodeChange<CanvasFlowNode>>) => {
      const doc = useProgramDoc.getState()
      let picked: Set<string> | undefined
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          doc.place(change.id, change.position.x, change.position.y)
        }
        if (change.type === 'dimensions' && change.dimensions) {
          doc.measure(change.id, change.dimensions)
          if (change.setAttributes) {
            if (doc.layout.groups?.some((group) => group.id === change.id)) {
              doc.patchGroup(change.id, change.dimensions)
            } else {
              doc.patchNote(change.id, change.dimensions)
            }
          }
        }
        if (change.type === 'remove') {
          if (doc.layout.notes?.some((note) => note.id === change.id)) {
            doc.removeNote(change.id)
          } else {
            doc.removeNode(change.id)
          }
        }
        if (change.type === 'select') {
          picked ??= new Set(doc.selection)
          if (change.selected) picked.add(change.id)
          else picked.delete(change.id)
        }
      }
      if (picked) doc.setSelection([...picked])
    },
    [],
  )
  const onEdgesChange = useCallback((changes: Array<EdgeChange>) => {
    const removed = changes.flatMap((change) =>
      change.type === 'remove' ? [change.id] : [],
    )
    if (removed.length) useProgramDoc.getState().removeEdges(removed)
  }, [])

  // Theorem answers for every port the drag could land on when it starts, and the rows
  // show the answers while the drag is under way.
  const verdicts = useRef(new Map<string, EdgeVerdict>())
  const dragFrom = useRef<OnConnectStartParams | undefined>(undefined)
  const askAbout = useCallback(
    (nodeId: string, handleId: string | null, fromOutput: boolean) => {
      const doc = useProgramDoc.getState().program
      if (!doc) return
      verdicts.current.clear()
      const origin = doc.nodes.find((node) => node.id === nodeId)
      const port = portOfHandle(handleId)
      const mine = (fromOutput ? origin?.outputs : origin?.inputs)?.find(
        (candidate) => candidate.id === port,
      )
      if (!mine) return
      for (const node of doc.nodes) {
        if (node.id === nodeId) continue
        for (const other of fromOutput ? node.inputs : node.outputs) {
          const key = fromOutput
            ? pairKey({
                source: nodeId,
                sourceHandle: handleId,
                target: node.id,
                targetHandle: `in:${other.id}`,
              })
            : pairKey({
                source: node.id,
                sourceHandle: `out:${other.id}`,
                target: nodeId,
                targetHandle: handleId,
              })
          void (
            fromOutput ? validateEdge(mine, other) : validateEdge(other, mine)
          ).then((verdict) => {
            verdicts.current.set(key, verdict)
            useProgramDoc
              .getState()
              .setDragVerdict(`${node.id}/${other.id}`, verdict.status)
          })
        }
      }
    },
    [],
  )
  const onConnectStart = useCallback(
    (_: unknown, params: OnConnectStartParams) => {
      dragFrom.current = params
      if (params.nodeId) {
        askAbout(params.nodeId, params.handleId, params.handleType === 'source')
      }
    },
    [askAbout],
  )
  const isValidConnection = useCallback(
    (connection: Edge | Connection) =>
      verdicts.current.get(pairKey(connection))?.status === 'compatible',
    [],
  )
  const onConnect = useCallback((connection: Connection) => {
    const verdict = verdicts.current.get(pairKey(connection))
    if (!verdict || !connection.source || !connection.target) return
    useProgramDoc.getState().addEdge(edgeFor(connection), verdict)
  }, [])
  const refuseConnection = useCallback(
    (connection: Connection, landed: Element | null) => {
      const verdict = verdicts.current.get(pairKey(connection))
      if (verdict?.status === 'mismatch') {
        refuseAt(landed, describeMismatch(verdict))
      }
      return verdict
    },
    [],
  )
  // A quick drag can land before Theorem has answered for that port, so it asks and waits.
  const settleConnection = useCallback(
    async (connection: Connection, landed: Element | null) => {
      const doc = useProgramDoc.getState().program
      const output = doc?.nodes
        .find((node) => node.id === connection.source)
        ?.outputs.find(
          (port) => port.id === portOfHandle(connection.sourceHandle),
        )
      const input = doc?.nodes
        .find((node) => node.id === connection.target)
        ?.inputs.find(
          (port) => port.id === portOfHandle(connection.targetHandle),
        )
      const key = pairKey(connection)
      const known = verdicts.current.get(key)
      if (!known && (!output || !input)) return
      const verdict = known ?? (await validateEdge(output!, input!))
      verdicts.current.set(key, verdict)
      if (verdict.status === 'mismatch') {
        refuseAt(landed, describeMismatch(verdict))
      } else {
        onConnect(connection)
      }
    },
    [onConnect],
  )

  // Releasing on the empty canvas asks what can go next; releasing on a port that
  // Theorem could not type yet still connects, drawn dashed as undetermined.
  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, state) => {
      const origin = dragFrom.current
      dragFrom.current = undefined
      useProgramDoc.getState().clearDragVerdicts()
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      if (!origin?.nodeId || !point) return
      if (!state.isValid && state.toHandle && state.toNode) {
        const landed = handleElement(state.toNode.id, state.toHandle.id)
        const connection: Connection =
          origin.handleType === 'source'
            ? {
                source: origin.nodeId,
                sourceHandle: origin.handleId,
                target: state.toNode.id,
                targetHandle: state.toHandle.id ?? null,
              }
            : {
                source: state.toNode.id,
                sourceHandle: state.toHandle.id ?? null,
                target: origin.nodeId,
                targetHandle: origin.handleId,
              }
        void settleConnection(connection, landed)
        return
      }
      if (state.toNode || state.isValid) return
      const doc = useProgramDoc.getState().program
      const node = doc?.nodes.find(
        (candidate) => candidate.id === origin.nodeId,
      )
      const portId = portOfHandle(origin.handleId)
      const anchor = flow.screenToFlowPosition({
        x: point.clientX,
        y: point.clientY,
      })
      const screen = { x: point.clientX, y: point.clientY }
      if (origin.handleType === 'source') {
        const port = node?.outputs.find((candidate) => candidate.id === portId)
        if (port)
          openPalette(anchor, screen, { from: { node: origin.nodeId, port } })
      } else {
        const port = node?.inputs.find((candidate) => candidate.id === portId)
        if (port)
          openPalette(anchor, screen, { to: { node: origin.nodeId, port } })
      }
    },
    [flow, openPalette, settleConnection],
  )

  // Moving an end of a wire: the other end stays, and Theorem answers for it the same way.
  const onReconnectStart = useCallback(
    (_: unknown, edge: Edge, fixed: HandleType) => {
      if (fixed === 'source') {
        askAbout(edge.source, edge.sourceHandle ?? null, true)
      } else {
        askAbout(edge.target, edge.targetHandle ?? null, false)
      }
    },
    [askAbout],
  )
  const moveWire = useCallback((old: Edge, connection: Connection) => {
    const verdict = verdicts.current.get(pairKey(connection))
    if (!verdict || !connection.source || !connection.target) return
    useProgramDoc.getState().reconnectEdge(old.id, edgeFor(connection), verdict)
  }, [])
  const onReconnectEnd = useCallback(
    (_: unknown, old: Edge, fixed: HandleType, state: FinalConnectionState) => {
      useProgramDoc.getState().clearDragVerdicts()
      if (state.isValid || !state.toHandle || !state.toNode) return
      const connection: Connection =
        fixed === 'source'
          ? {
              source: old.source,
              sourceHandle: old.sourceHandle ?? null,
              target: state.toNode.id,
              targetHandle: state.toHandle.id ?? null,
            }
          : {
              source: state.toNode.id,
              sourceHandle: state.toHandle.id ?? null,
              target: old.target,
              targetHandle: old.targetHandle ?? null,
            }
      const verdict = refuseConnection(
        connection,
        handleElement(state.toNode.id, state.toHandle.id),
      )
      if (verdict?.status === 'undetermined') moveWire(old, connection)
    },
    [moveWire, refuseConnection],
  )

  // A deletion that leaves a node without an input it was being fed asks first.
  const onBeforeDelete = useCallback<OnBeforeDelete<CanvasFlowNode>>(
    async ({ nodes: going, edges: cut }) => {
      const gone = new Set(going.map((node) => node.id))
      const severed = new Set(cut.map((edge) => edge.id))
      const edgesNow = useProgramDoc.getState().program?.edges ?? []
      const orphaned = edgesNow.filter(
        (edge) =>
          severed.has(edge.id) &&
          !gone.has(edge.to_node) &&
          !edgesNow.some(
            (other) =>
              !severed.has(other.id) &&
              other.to_node === edge.to_node &&
              other.to_port === edge.to_port,
          ),
      )
      if (orphaned.length === 0) return true
      return useDeleteConfirm
        .getState()
        .ask(orphaned.map((edge) => `${edge.to_node} / ${edge.to_port}`))
    },
    [],
  )

  // Dropping a free node on a wire puts it on that wire, all or nothing.
  const onNodeDragStop = useCallback<OnNodeDrag<CanvasFlowNode>>(
    (event, node) => {
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      if (!point) return
      const wire = document
        .elementsFromPoint(point.clientX, point.clientY)
        .map((element) => element.closest('.react-flow__edge'))
        .find(Boolean)
      const edgeId = wire?.getAttribute('data-id')
      if (!edgeId) return
      void spliceExisting(node.id, edgeId)
        .then(({ refused }) => {
          if (refused) {
            refuseAt(
              document.querySelector(
                `.react-flow__node[data-id="${CSS.escape(node.id)}"]`,
              ),
              describeMismatch(refused),
            )
          }
        })
        .catch((error: unknown) => refuseAt(null, describeError(error)))
    },
    [],
  )

  return (
    <ReactFlow
      onMoveStart={(event) => {
        if (event) moved.current = true
      }}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
      connectionLineType={ConnectionLineType.SmoothStep}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      onReconnect={moveWire}
      onReconnectStart={onReconnectStart}
      onReconnectEnd={onReconnectEnd}
      onBeforeDelete={onBeforeDelete}
      onNodeDragStop={onNodeDragStop}
      zoomOnDoubleClick={false}
      onDoubleClick={(event) => {
        if (!(event.target as Element).classList.contains('react-flow__pane')) {
          return
        }
        openPalette(
          flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          { x: event.clientX, y: event.clientY },
        )
      }}
      isValidConnection={isValidConnection}
      onPaneClick={() => useProgramDoc.getState().select(undefined)}
      onEdgeDoubleClick={(event, edge) => {
        const doc = useProgramDoc.getState()
        const from = flow.getInternalNode(edge.source)
        const to = flow.getInternalNode(edge.target)
        if (!from || !to) return
        doc.setRoute(
          edge.id,
          insertWaypoint(
            doc.layout.reroutes?.[edge.id] ?? [],
            from.internals.positionAbsolute,
            to.internals.positionAbsolute,
            flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          ),
        )
      }}
      onPaneContextMenu={(event) => {
        event.preventDefault()
        openPalette(
          flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          { x: event.clientX, y: event.clientY },
        )
      }}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1.5} />
      <Controls position="bottom-left" fitViewOptions={FRAME}>
        <ControlButton
          aria-label="Lay the program out again"
          title="Lay the program out again"
          onClick={() => {
            const doc = useProgramDoc.getState()
            void relayoutProgram(program, doc.layout).then((placed) => {
              useProgramDoc
                .getState()
                .applyLayout(placed.positions, placed.groups)
              requestAnimationFrame(() => void flow.fitView(FRAME))
            })
          }}
        >
          <Icon.Organize />
        </ControlButton>
      </Controls>
      <ProgramHeader />
      <SelectionBar />
      <ProposalReview />
      <Palette />
      <ConnectionToasts />
      <DeleteConfirm />
    </ReactFlow>
  )
}

export function ProgramCanvas({
  extras,
}: {
  extras: Record<string, Partial<ProgramNodeData>>
}) {
  return (
    <ReactFlowProvider>
      <Flow extras={extras} />
    </ReactFlowProvider>
  )
}
