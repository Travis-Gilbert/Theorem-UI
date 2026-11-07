// SOURCING: zustand (the shell's existing store library). The open program is one
// document: the definition, its layout and what Theorem last reported about it.
import { create } from 'zustand'
import type {
  CatalogEntry,
  ProcessLiveness,
  ProgramDefinition,
  ProgramEdge,
  JsonValue,
  ProgramNode,
  ProgramPort,
  ProgramRunReceipt,
} from './contracts'
import type { LintDiagnostic } from './compute'
import type {
  CanvasGroup,
  CanvasNote,
  EdgeVerdict,
  LoadedProgram,
  NodeAttachment,
  PendingProposal,
  ProgramLayout,
  Waypoint,
} from './api'
import { validateEdge } from './api'
import { nodeIdFor } from './flow'

type Positions = Record<string, { x: number; y: number }>
type Sizes = Record<string, { width: number; height: number }>

/** What whole-program validation last said; `undefined` while Theorem has not answered. */
export type ProgramVerdict =
  | { status: 'valid' }
  | {
      status: 'refused'
      code?: string
      message: string
      nodeIds: Array<string>
    }

const GROUP_PADDING = { top: 48, side: 24 }

type ProgramDoc = {
  nodeId: string | undefined
  contentId: string | undefined
  program: ProgramDefinition | undefined
  layout: ProgramLayout
  positions: Positions
  selected: string | undefined
  /** Everything selected on the canvas; `selected` is the one program node being inspected. */
  selection: Array<string>
  /** What xyflow measured: it hands measurements back and needs them on each node. */
  sizes: Sizes
  verdict: ProgramVerdict | undefined
  /** Counts changes to the definition itself, which is what validation answers for. */
  definitionRevision: number
  /** The definition revision Theorem last confirmed saving. */
  savedDefinition: number
  proposal: PendingProposal | undefined
  proposalPlaces: Positions
  receipt: ProgramRunReceipt | undefined
  /** The run being followed: its events as they arrive, until a receipt replaces them. */
  run: LiveRun | undefined
  liveness: Record<string, ProcessLiveness>
  /** How each node ended in this run, from its events. */
  outcomes: Record<string, 'cached' | 'done'>
  verdicts: Record<string, EdgeVerdict>
  /** While a connection is being dragged: Theorem's answer for each `node/port` it could land on. */
  dragVerdicts: Record<string, EdgeVerdict['status']>
  /** Per-node overrides for the next run; the receipt records what was applied. */
  tweaks: Record<string, JsonValue>
  /** Graph lint's latest diagnostics, by the node they name. */
  diagnostics: Record<string, Array<LintDiagnostic>>
  /** Counts edits, so a save can tell whether the document moved under it. */
  revision: number
  /** Counts opens and closes, so work that waited can tell its document is gone. */
  generation: number
  open: (loaded: LoadedProgram, positions: Positions) => void
  close: () => void
  saved: (nodeId: string, contentId: string, definition: number) => void
  select: (nodeId: string | undefined) => void
  setSelection: (ids: Array<string>) => void
  measure: (id: string, size: { width: number; height: number }) => void
  setVerdict: (verdict: ProgramVerdict | undefined) => void
  addNote: (note: Pick<CanvasNote, 'x' | 'y'> & Partial<CanvasNote>) => void
  patchNote: (id: string, patch: Partial<CanvasNote>) => void
  removeNote: (id: string) => void
  group: (ids: Array<string>) => void
  ungroup: (id: string) => void
  patchGroup: (id: string, patch: Partial<CanvasGroup>) => void
  setRoute: (edgeId: string, route: Array<Waypoint>) => void
  applyLayout: (positions: Positions, groups: Array<CanvasGroup>) => void
  showProposal: (
    proposal: PendingProposal | undefined,
    places: Positions,
  ) => void
  adoptProposal: (proposal: PendingProposal, places: Positions) => void
  place: (nodeId: string, x: number, y: number) => void
  patchNode: (nodeId: string, patch: Partial<ProgramNode>) => void
  removeNode: (nodeId: string) => void
  setIdentity: (identity: { name?: string; intent?: string }) => void
  setParameter: (nodeId: string, name: string, value: unknown) => void
  chooseAffordance: (nodeId: string, affordanceId: string) => void
  promoteParameter: (nodeId: string, name: string, shapeId: string) => void
  demoteParameter: (nodeId: string, name: string) => void
  setCollapsed: (nodeId: string, collapsed: boolean) => void
  setDragVerdict: (key: string, status: EdgeVerdict['status']) => void
  clearDragVerdicts: () => void
  reconnectEdge: (
    edgeId: string,
    edge: ProgramEdge,
    verdict: EdgeVerdict,
  ) => void
  addEdge: (edge: ProgramEdge, verdict: EdgeVerdict) => void
  removeEdges: (edgeIds: Array<string>) => void
  setVerdicts: (verdicts: Record<string, EdgeVerdict>) => void
  setTweak: (nodeId: string, tweak: JsonValue | undefined) => void
  setPins: (pins: ProgramLayout['pins']) => void
  setTrigger: (trigger: ProgramDefinition['trigger']) => void
  setApproval: (approval: ProgramDefinition['approval']) => void
  setAuthority: (authority: ProgramDefinition['authority']) => void
  setDiagnostics: (diagnostics: Record<string, Array<LintDiagnostic>>) => void
  attach: (nodeId: string, attachment: NodeAttachment) => void
  detach: (nodeId: string, attachmentId: string) => void
  setLisp: (revisions: ProgramLayout['lisp']) => void
  report: (receipt: ProgramRunReceipt) => void
  beginRun: (runId?: string) => void
  runStarted: (runId: string) => void
  runEvent: (event: LiveRunEvent) => void
  runSettled: (failure?: string, failureNode?: string) => void
  setRunFailure: (failure: string | undefined) => void
  forgetRun: () => void
  setLiveness: (nodeId: string, liveness: ProcessLiveness) => void
}

export const AFFORDANCE_BLOCK = 'theorem.affordance'

/**
 * Choosing an affordance declares it in the program's environment, where nested programs
 * have to find it. A binding named after an affordance no node runs any more goes with it.
 */
function withChosenBindings(program: ProgramDefinition): ProgramDefinition {
  const chosen = new Set(
    program.nodes.flatMap((node) =>
      node.kind === 'stochastic' &&
      node.block_id === AFFORDANCE_BLOCK &&
      node.affordance_id !== AFFORDANCE_BLOCK
        ? [node.affordance_id]
        : [],
    ),
  )
  const kept = program.environment.bindings.filter(
    (binding) =>
      binding.engine_id !== binding.affordance_id ||
      chosen.has(binding.engine_id),
  )
  const bound = new Set(kept.map((binding) => binding.engine_id))
  const added = [...chosen]
    .filter((id) => !bound.has(id))
    .map((id) => ({ engine_id: id, affordance_id: id, params: {} }))
  return {
    ...program,
    environment: { ...program.environment, bindings: [...kept, ...added] },
  }
}

const edited = (
  doc: ProgramDoc,
  program: ProgramDefinition,
): Pick<ProgramDoc, 'program' | 'revision' | 'definitionRevision'> => ({
  program,
  revision: doc.revision + 1,
  definitionRevision: doc.definitionRevision + 1,
})

const laidOut = (doc: ProgramDoc, layout: ProgramLayout) => ({
  layout,
  revision: doc.revision + 1,
})

/** Where a node is on the canvas, whichever group it is positioned inside. */
function absolute(doc: ProgramDoc, id: string) {
  const at = doc.positions[id] ?? { x: 0, y: 0 }
  const parent = doc.layout.groups?.find((group) => group.members.includes(id))
  return parent ? { x: at.x + parent.x, y: at.y + parent.y } : at
}

export type LiveRunEvent = {
  sequence: number
  node_id: string
  kind: string
  cached?: boolean
  liveness?: ProcessLiveness | null
  refusal_code?: string | null
  message?: string | null
}

export type LiveRun = {
  runId?: string
  events: Array<LiveRunEvent>
  active: boolean
  failure?: string
  /** The node Theorem named when it refused the run. */
  failureNode?: string
}

export const useProgramDoc = create<ProgramDoc>((set, get) => ({
  nodeId: undefined,
  contentId: undefined,
  program: undefined,
  layout: {},
  positions: {},
  selected: undefined,
  selection: [],
  sizes: {},
  verdict: undefined,
  definitionRevision: 0,
  savedDefinition: 0,
  proposal: undefined,
  proposalPlaces: {},
  receipt: undefined,
  run: undefined,
  liveness: {},
  outcomes: {},
  verdicts: {},
  dragVerdicts: {},
  tweaks: {},
  diagnostics: {},
  revision: 0,
  generation: 0,
  open: (loaded, positions) => {
    // The same program coming back from the server keeps what was selected on it.
    const { nodeId, selected } = get()
    const kept =
      nodeId === loaded.node_id &&
      loaded.program.nodes.some((node) => node.id === selected)
        ? selected
        : undefined
    set({
      nodeId: loaded.node_id,
      contentId: loaded.content_id,
      program: loaded.program,
      layout: loaded.layout ?? {},
      positions,
      selected: kept,
      selection: kept ? [kept] : [],
      sizes: {},
      verdict: undefined,
      definitionRevision: 0,
      savedDefinition: 0,
      proposal: undefined,
      proposalPlaces: {},
      receipt: undefined,
      run: undefined,
      liveness: {},
      outcomes: {},
      verdicts: {},
      tweaks: {},
      diagnostics: {},
      revision: 0,
      generation: get().generation + 1,
    })
  },
  close: () =>
    set((doc) => ({
      generation: doc.generation + 1,
      nodeId: undefined,
      contentId: undefined,
      program: undefined,
      selected: undefined,
      selection: [],
      proposal: undefined,
      receipt: undefined,
      run: undefined,
    })),
  saved: (nodeId, contentId, definition) =>
    set({ nodeId, contentId, savedDefinition: definition }),
  select: (selected) =>
    set({ selected, selection: selected ? [selected] : [] }),
  setSelection: (selection) =>
    set((doc) => {
      const programNodes = selection.filter((id) =>
        doc.program?.nodes.some((node) => node.id === id),
      )
      return {
        selection,
        selected: programNodes.length === 1 ? programNodes[0] : undefined,
      }
    }),
  measure: (id, size) =>
    set((doc) => ({ sizes: { ...doc.sizes, [id]: size } })),
  setVerdict: (verdict) => set({ verdict }),
  setIdentity: (identity) =>
    set((doc) =>
      doc.program ? edited(doc, { ...doc.program, ...identity }) : {},
    ),
  place: (nodeId, x, y) =>
    set((doc) => {
      if (doc.layout.notes?.some((note) => note.id === nodeId)) {
        return laidOut(doc, {
          ...doc.layout,
          notes: doc.layout.notes.map((note) =>
            note.id === nodeId ? { ...note, x, y } : note,
          ),
        })
      }
      if (doc.layout.groups?.some((group) => group.id === nodeId)) {
        return laidOut(doc, {
          ...doc.layout,
          groups: doc.layout.groups.map((group) =>
            group.id === nodeId ? { ...group, x, y } : group,
          ),
        })
      }
      return {
        positions: { ...doc.positions, [nodeId]: { x, y } },
        revision: doc.revision + 1,
      }
    }),
  addNote: (note) =>
    set((doc) => {
      const id = `note-${crypto.randomUUID().slice(0, 8)}`
      return laidOut(doc, {
        ...doc.layout,
        notes: [
          ...(doc.layout.notes ?? []),
          { id, text: '', width: 240, height: 140, ...note },
        ],
      })
    }),
  patchNote: (id, patch) =>
    set((doc) =>
      laidOut(doc, {
        ...doc.layout,
        notes: doc.layout.notes?.map((note) =>
          note.id === id ? { ...note, ...patch } : note,
        ),
      }),
    ),
  removeNote: (id) =>
    set((doc) =>
      laidOut(doc, {
        ...doc.layout,
        notes: doc.layout.notes?.filter((note) => note.id !== id),
      }),
    ),
  group: (ids) =>
    set((doc) => {
      const members = ids.filter((id) =>
        doc.program?.nodes.some((node) => node.id === id),
      )
      if (members.length === 0) return doc
      const boxes = members.map((id) => {
        const at = absolute(doc, id)
        const size = doc.sizes[id] ?? { width: 248, height: 120 }
        return { id, ...at, ...size }
      })
      const x = Math.min(...boxes.map((b) => b.x)) - GROUP_PADDING.side
      const y = Math.min(...boxes.map((b) => b.y)) - GROUP_PADDING.top
      const right = Math.max(...boxes.map((b) => b.x + b.width))
      const bottom = Math.max(...boxes.map((b) => b.y + b.height))
      const positions = { ...doc.positions }
      for (const box of boxes) {
        positions[box.id] = { x: box.x - x, y: box.y - y }
      }
      return {
        positions,
        ...laidOut(doc, {
          ...doc.layout,
          groups: [
            // A node belongs to one group; grouping it again moves it.
            ...(doc.layout.groups ?? []).map((group) => ({
              ...group,
              members: group.members.filter((id) => !members.includes(id)),
            })),
            {
              id: `group-${crypto.randomUUID().slice(0, 8)}`,
              label: 'Group',
              x,
              y,
              width: right - x + GROUP_PADDING.side,
              height: bottom - y + GROUP_PADDING.side,
              members,
            },
          ],
        }),
      }
    }),
  ungroup: (id) =>
    set((doc) => {
      const group = doc.layout.groups?.find((candidate) => candidate.id === id)
      if (!group) return doc
      const positions = { ...doc.positions }
      for (const member of group.members) {
        positions[member] = absolute(doc, member)
      }
      return {
        positions,
        ...laidOut(doc, {
          ...doc.layout,
          groups: doc.layout.groups?.filter((candidate) => candidate.id !== id),
        }),
      }
    }),
  patchGroup: (id, patch) =>
    set((doc) =>
      laidOut(doc, {
        ...doc.layout,
        groups: doc.layout.groups?.map((group) =>
          group.id === id ? { ...group, ...patch } : group,
        ),
      }),
    ),
  setRoute: (edgeId, route) =>
    set((doc) => {
      const reroutes = { ...doc.layout.reroutes }
      if (route.length) reroutes[edgeId] = route
      else delete reroutes[edgeId]
      return laidOut(doc, { ...doc.layout, reroutes })
    }),
  applyLayout: (positions, groups) =>
    set((doc) => ({
      positions,
      ...laidOut(doc, { ...doc.layout, groups, reroutes: {} }),
    })),
  showProposal: (proposal, proposalPlaces) => set({ proposal, proposalPlaces }),
  adoptProposal: (accepted, places) =>
    set((doc) => ({
      ...edited(doc, accepted.proposal.proposed_program),
      positions: { ...doc.positions, ...places },
      proposal: undefined,
      proposalPlaces: {},
    })),
  patchNode: (nodeId, patch) =>
    set((doc) => {
      if (!doc.program) return doc
      return edited(doc, {
        ...doc.program,
        nodes: doc.program.nodes.map((node) =>
          node.id === nodeId ? ({ ...node, ...patch } as ProgramNode) : node,
        ),
      })
    }),
  removeNode: (nodeId) =>
    set((doc) => {
      if (!doc.program) return doc
      return {
        ...edited(
          doc,
          withChosenBindings({
            ...doc.program,
            nodes: doc.program.nodes.filter((node) => node.id !== nodeId),
            edges: doc.program.edges.filter(
              (edge) => edge.from_node !== nodeId && edge.to_node !== nodeId,
            ),
          }),
        ),
        layout: {
          ...doc.layout,
          groups: doc.layout.groups?.map((group) => ({
            ...group,
            members: group.members.filter((id) => id !== nodeId),
          })),
        },
        selected: doc.selected === nodeId ? undefined : doc.selected,
        selection: doc.selection.filter((id) => id !== nodeId),
      }
    }),
  chooseAffordance: (nodeId, affordanceId) =>
    set((doc) => {
      if (!doc.program) return doc
      return edited(
        doc,
        withChosenBindings({
          ...doc.program,
          nodes: doc.program.nodes.map((node) =>
            node.id === nodeId && node.kind === 'stochastic'
              ? { ...node, affordance_id: affordanceId }
              : node,
          ),
        }),
      )
    }),
  setParameter: (nodeId, name, value) =>
    set((doc) => {
      if (!doc.program) return doc
      return edited(doc, {
        ...doc.program,
        nodes: doc.program.nodes.map((node) => {
          if (node.id !== nodeId) return node
          const parameters = { ...node.parameters }
          if (value === undefined) delete parameters[name]
          else parameters[name] = value as JsonValue
          return { ...node, parameters }
        }),
      })
    }),
  promoteParameter: (nodeId, name, shapeId) =>
    set((doc) => {
      if (!doc.program) return doc
      return edited(doc, {
        ...doc.program,
        nodes: doc.program.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                inputs: [...node.inputs, { id: name, shape_id: shapeId }],
              }
            : node,
        ),
      })
    }),
  demoteParameter: (nodeId, name) =>
    set((doc) => {
      if (!doc.program) return doc
      return edited(doc, {
        ...doc.program,
        nodes: doc.program.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                inputs: node.inputs.filter((port) => port.id !== name),
              }
            : node,
        ),
        edges: doc.program.edges.filter(
          (edge) => !(edge.to_node === nodeId && edge.to_port === name),
        ),
      })
    }),
  setCollapsed: (nodeId, collapsed) =>
    set((doc) => {
      const rest = (doc.layout.collapsed ?? []).filter((id) => id !== nodeId)
      return laidOut(doc, {
        ...doc.layout,
        collapsed: collapsed ? [...rest, nodeId] : rest,
      })
    }),
  setDragVerdict: (key, status) =>
    set((doc) => ({ dragVerdicts: { ...doc.dragVerdicts, [key]: status } })),
  clearDragVerdicts: () => set({ dragVerdicts: {} }),
  reconnectEdge: (edgeId, edge, verdict) =>
    set((doc) => {
      if (!doc.program) return doc
      const { [edgeId]: _replaced, ...verdicts } = doc.verdicts
      return {
        // The moved wire takes the input it lands on, as a new one would.
        ...edited(doc, {
          ...doc.program,
          edges: [
            ...doc.program.edges.filter(
              (candidate) =>
                candidate.id !== edgeId &&
                (candidate.to_node !== edge.to_node ||
                  candidate.to_port !== edge.to_port),
            ),
            edge,
          ],
        }),
        verdicts: { ...verdicts, [edge.id]: verdict },
      }
    }),
  addEdge: (edge, verdict) =>
    set((doc) => {
      if (!doc.program) return doc
      return {
        // An input takes one wire, so the new one takes the place of what was there.
        ...edited(doc, {
          ...doc.program,
          edges: [
            ...doc.program.edges.filter(
              (other) =>
                other.to_node !== edge.to_node ||
                other.to_port !== edge.to_port,
            ),
            edge,
          ],
        }),
        verdicts: { ...doc.verdicts, [edge.id]: verdict },
      }
    }),
  removeEdges: (edgeIds) =>
    set((doc) => {
      if (!doc.program) return doc
      return edited(doc, {
        ...doc.program,
        edges: doc.program.edges.filter((edge) => !edgeIds.includes(edge.id)),
      })
    }),
  setVerdicts: (verdicts) => set({ verdicts }),
  setTweak: (nodeId, tweak) =>
    set((doc) => {
      const tweaks = { ...doc.tweaks }
      if (tweak === undefined) delete tweaks[nodeId]
      else tweaks[nodeId] = tweak
      return { tweaks }
    }),
  setPins: (pins) =>
    set((doc) => ({
      layout: { ...doc.layout, pins },
      revision: doc.revision + 1,
    })),
  setTrigger: (trigger) =>
    set((doc) =>
      doc.program ? edited(doc, { ...doc.program, trigger }) : doc,
    ),
  setApproval: (approval) =>
    set((doc) =>
      doc.program ? edited(doc, { ...doc.program, approval }) : doc,
    ),
  setAuthority: (authority) =>
    set((doc) =>
      doc.program ? edited(doc, { ...doc.program, authority }) : doc,
    ),
  setDiagnostics: (diagnostics) => set({ diagnostics }),
  attach: (nodeId, attachment) =>
    set((doc) => ({
      layout: {
        ...doc.layout,
        attachments: {
          ...doc.layout.attachments,
          [nodeId]: [...(doc.layout.attachments?.[nodeId] ?? []), attachment],
        },
      },
      revision: doc.revision + 1,
    })),
  detach: (nodeId, attachmentId) =>
    set((doc) => ({
      layout: {
        ...doc.layout,
        attachments: {
          ...doc.layout.attachments,
          [nodeId]: (doc.layout.attachments?.[nodeId] ?? []).filter(
            (attachment) => attachment.id !== attachmentId,
          ),
        },
      },
      revision: doc.revision + 1,
    })),
  setLisp: (lisp) =>
    set((doc) => ({
      layout: { ...doc.layout, lisp },
      revision: doc.revision + 1,
    })),
  report: (receipt) =>
    set({
      receipt,
      liveness: receipt.final_liveness,
    }),
  setLiveness: (nodeId, liveness) =>
    set((doc) => ({ liveness: { ...doc.liveness, [nodeId]: liveness } })),
  beginRun: (runId) =>
    set({
      run: { runId, events: [], active: true },
      receipt: undefined,
      liveness: {},
      outcomes: {},
    }),
  runStarted: (runId) =>
    set((doc) => ({
      run: doc.run && { ...doc.run, runId },
      layout: { ...doc.layout, last_run_id: runId },
      revision: doc.revision + 1,
    })),
  runEvent: (event) =>
    set((doc) => {
      if (!doc.run) return {}
      const last = doc.run.events.at(-1)
      if (last && event.sequence <= last.sequence) return {}
      return {
        run: { ...doc.run, events: [...doc.run.events, event] },
        liveness: event.liveness
          ? { ...doc.liveness, [event.node_id]: event.liveness }
          : doc.liveness,
        outcomes:
          event.kind === 'execution_cached' || event.cached
            ? { ...doc.outcomes, [event.node_id]: 'cached' }
            : event.kind === 'node_finished' &&
                doc.outcomes[event.node_id] !== 'cached'
              ? { ...doc.outcomes, [event.node_id]: 'done' }
              : doc.outcomes,
      }
    }),
  runSettled: (failure, failureNode) =>
    set((doc) => ({
      run: doc.run && { ...doc.run, active: false, failure, failureNode },
    })),
  setRunFailure: (failure) =>
    set((doc) => ({
      run: {
        events: [],
        ...doc.run,
        active: false,
        failure,
        failureNode: undefined,
      },
    })),
  forgetRun: () =>
    set((doc) => {
      const { last_run_id: _dropped, ...layout } = doc.layout
      return { run: undefined, layout }
    }),
}))

/** The kind fields a new node starts with, filled from what its catalog entry names. */
function kindFields(entry: CatalogEntry): Record<string, unknown> {
  const kind = entry.node_kind ?? 'stochastic'
  switch (kind) {
    case 'source':
      return {
        kind,
        // A page fetch reads the web; every other source reads a table of this tenant.
        selector:
          entry.group === 'monitor'
            ? { plane: 'rusty_web', label: '', predicates: { op: entry.id } }
            : { plane: 'tenant_graph', label: '', predicates: {} },
      }
    case 'sentinel':
      return {
        kind,
        question: '',
        watch: {},
        target_derivation_id: '',
      }
    case 'rule':
      return { kind, expression_root: '' }
    case 'verify':
      return { kind, verifier_id: entry.id }
    case 'fold':
      return { kind, target_derivation_id: '' }
    case 'human_input':
      return {
        kind,
        prompt: 'Should this continue?',
        coordination_stream: 'program.asks',
      }
    case 'sink':
      return {
        kind,
        sink_id: entry.id,
        asserts: false,
        effect: entry.contract?.capabilities.some(
          (capability) => capability.has_side_effects,
        )
          ? 'external'
          : 'advisory',
      }
    case 'compound':
      return {
        kind,
        interior_program_id: entry.published_program_id ?? '',
        pinned_content_id: entry.published_program_id ?? '',
      }
    case 'view':
      return { kind, surface_id: 'rerun' }
    default:
      return { kind: 'stochastic', affordance_id: entry.id }
  }
}

export function nodeFromEntry(
  program: ProgramDefinition,
  entry: CatalogEntry,
): ProgramNode {
  const id = nodeIdFor(program, entry.class_name ?? entry.id)
  return {
    id,
    block_id: entry.id,
    contract: entry.contract,
    inputs: entry.input_ports,
    outputs: entry.output_ports,
    bypassed: false,
    muted: false,
    ...kindFields(entry),
    // A monitor sentinel records its conclusion under a target of its own.
    ...(entry.node_kind === 'sentinel' && entry.group === 'monitor'
      ? { target_derivation_id: `monitor:signal:${program.name}:${id}` }
      : {}),
  } as unknown as ProgramNode
}

type PortEnd = { node: string; port: ProgramPort }
export type Placement = {
  from?: PortEnd
  to?: PortEnd
  replacing?: string
}

/**
 * The connections a placement would make, judged by Theorem. All of them land or none
 * do: a refused splice leaves the wire it would have replaced in place.
 */
async function judgeEdges(
  node: ProgramNode,
  connect: Placement,
): Promise<
  | { refused: { message: EdgeVerdict; at: 'from' | 'to' } }
  | { edges: Array<ProgramEdge>; verdicts: Record<string, EdgeVerdict> }
> {
  const stamp = crypto.randomUUID().slice(0, 8)
  const edges: Array<ProgramEdge> = []
  const verdicts: Record<string, EdgeVerdict> = {}
  if (connect.from && node.inputs[0]) {
    const verdict = await validateEdge(connect.from.port, node.inputs[0])
    if (verdict.status === 'mismatch')
      return { refused: { message: verdict, at: 'from' } }
    const id = `${connect.from.node}-${node.id}-${stamp}`
    verdicts[id] = verdict
    edges.push({
      id,
      from_node: connect.from.node,
      from_port: connect.from.port.id,
      to_node: node.id,
      to_port: node.inputs[0].id,
    })
  }
  if (connect.to && node.outputs[0]) {
    const verdict = await validateEdge(node.outputs[0], connect.to.port)
    if (verdict.status === 'mismatch')
      return { refused: { message: verdict, at: 'to' } }
    const id = `${node.id}-${connect.to.node}-${stamp}`
    verdicts[id] = verdict
    edges.push({
      id,
      from_node: node.id,
      from_port: node.outputs[0].id,
      to_node: connect.to.node,
      to_port: connect.to.port.id,
    })
  }
  return { edges, verdicts }
}

/**
 * Taken before work that waits, it answers afterwards whether the document that work
 * started on is still the one open.
 */
export function sameDocument(): () => boolean {
  const { generation } = useProgramDoc.getState()
  return () => useProgramDoc.getState().generation === generation
}

/** A new block goes in, spliced into a wire when the palette opened on one. */
export async function insertNode(
  entry: CatalogEntry,
  at: { x: number; y: number },
  connect: Placement = {},
): Promise<{ refused?: EdgeVerdict }> {
  const before = useProgramDoc.getState().program
  if (!before) return {}
  const still = sameDocument()
  const node = nodeFromEntry(before, entry)
  const judged = await judgeEdges(node, connect)
  if (!still()) return {}
  if ('refused' in judged) return { refused: judged.refused.message }
  const doc = useProgramDoc.getState()
  if (!doc.program) return {}
  useProgramDoc.setState({
    program: {
      ...doc.program,
      nodes: [...doc.program.nodes, node],
      edges: [
        ...doc.program.edges.filter(
          (edge) =>
            edge.id !== connect.replacing &&
            !judged.edges.some(
              (next) =>
                next.to_node === edge.to_node && next.to_port === edge.to_port,
            ),
        ),
        ...judged.edges,
      ],
    },
    verdicts: { ...doc.verdicts, ...judged.verdicts },
    positions: { ...doc.positions, [node.id]: at },
    selected: node.id,
    selection: [node.id],
    revision: doc.revision + 1,
    definitionRevision: doc.definitionRevision + 1,
  })
  return {}
}

/** A wire's two ends, for placing something on it. */
export function wireEnds(
  program: ProgramDefinition,
  edge: ProgramEdge,
): { from?: PortEnd; to?: PortEnd } {
  const fromPort = program.nodes
    .find((node) => node.id === edge.from_node)
    ?.outputs.find((port) => port.id === edge.from_port)
  const toPort = program.nodes
    .find((node) => node.id === edge.to_node)
    ?.inputs.find((port) => port.id === edge.to_port)
  return {
    from: fromPort && { node: edge.from_node, port: fromPort },
    to: toPort && { node: edge.to_node, port: toPort },
  }
}

/** A node already on the canvas, dropped onto a wire. It must be free to take one. */
export async function spliceExisting(
  nodeId: string,
  edgeId: string,
): Promise<{ refused?: EdgeVerdict; spliced?: boolean }> {
  const before = useProgramDoc.getState().program
  const node = before?.nodes.find((candidate) => candidate.id === nodeId)
  const wire = before?.edges.find((candidate) => candidate.id === edgeId)
  if (!before || !node || !wire || !node.inputs[0] || !node.outputs[0])
    return {}
  if (wire.from_node === nodeId || wire.to_node === nodeId) return {}
  const inputFree = !before.edges.some(
    (edge) => edge.to_node === nodeId && edge.to_port === node.inputs[0]!.id,
  )
  const outputFree = !before.edges.some(
    (edge) =>
      edge.from_node === nodeId && edge.from_port === node.outputs[0]!.id,
  )
  if (!inputFree || !outputFree) return {}
  const still = sameDocument()
  const judged = await judgeEdges(node, wireEnds(before, wire))
  if (!still()) return {}
  if ('refused' in judged) return { refused: judged.refused.message }
  const doc = useProgramDoc.getState()
  if (!doc.program) return {}
  useProgramDoc.setState({
    program: {
      ...doc.program,
      edges: [
        ...doc.program.edges.filter((edge) => edge.id !== edgeId),
        ...judged.edges,
      ],
    },
    verdicts: { ...doc.verdicts, ...judged.verdicts },
    revision: doc.revision + 1,
    definitionRevision: doc.definitionRevision + 1,
  })
  return { spliced: true }
}
