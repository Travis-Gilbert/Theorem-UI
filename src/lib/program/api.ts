// SOURCING: @tanstack/react-query (the cache over Theorem's programmable_graph
// tool); calls go through the generated SDK in ../theorem/native.ts. The action
// names and payloads are Theorem's own, typed by the generated contracts.
import { callTool } from '@/lib/theorem/native'
import type {
  CatalogEntry,
  ColumnContract,
  CompilerProposal,
  ProgramDefinition,
  ProgramDiff,
  ProgramPort,
  ProgramRunOptions,
  ProgramRunReceipt,
  JsonValue,
  SchemaMismatch,
} from './contracts'

/** Node positions and per-canvas state. Layout never enters a program's content id. */
export type ProgramLayout = {
  /** Nodes showing only their header; layout, so it never changes a content id. */
  collapsed?: Array<string>
  nodes?: Record<string, { x: number; y: number }>
  pins?: ProgramRunOptions['pinned_nodes']
  /** Results a person attached to a node; layout, so they never change a content id. */
  attachments?: Record<string, Array<NodeAttachment>>
  /** The Graph Lisp notebook's revisions, kept with the program they were written for. */
  lisp?: Array<LispRevision>
  notes?: Array<CanvasNote>
  groups?: Array<CanvasGroup>
  /** Waypoints an edge is routed through, in canvas coordinates. */
  reroutes?: Record<string, Array<Waypoint>>
  /** The latest run, so reopening the program picks it back up. */
  last_run_id?: string
}

export type Waypoint = { x: number; y: number }

/** A note carries text, has no ports, and is not part of the program. */
export type CanvasNote = {
  id: string
  text: string
  x: number
  y: number
  width: number
  height: number
}

/** A labelled frame; its members' positions are relative to it while they belong. */
export type CanvasGroup = {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  members: Array<string>
}

export type NodeAttachment = {
  id: string
  title: string
  value: JsonValue
  attached_at_ms: number
}

export type LispRevision = {
  id: string
  source: string
  fuel: number
  root?: string
  receipt_id: string
  status: string
  output: JsonValue
}

export type ProgramSummary = {
  node_id: string
  name: string
  intent: string
  status?: string
  program_id?: string
  content_id?: string
  liveness?: Record<string, number>
  updated_at_ms?: number | null
}

export type LoadedProgram = {
  node_id: string
  program: ProgramDefinition
  content_id: string
  layout: ProgramLayout | null
  status?: string
}

export type EdgeVerdict = {
  status: 'compatible' | 'undetermined' | 'mismatch'
  mismatch?: SchemaMismatch
}

const read = <T>(args: object) => callTool<T>('programmable_graph', args)
const apply = <T>(args: object) => callTool<T>('programmable_graph_apply', args)

export const programKeys = {
  all: ['programs'] as const,
  list: () => ['programs', 'list'] as const,
  starters: () => ['programs', 'starters'] as const,
  catalog: () => ['programs', 'catalog'] as const,
  tables: () => ['programs', 'tables'] as const,
  load: (nodeId: string) => ['programs', 'load', nodeId] as const,
  interior: (programId: string, nodeId: string) =>
    ['programs', 'interior', programId, nodeId] as const,
  interiorVersions: (programId: string, nodeId: string) =>
    ['programs', 'interior-versions', programId, nodeId] as const,
  proposals: (nodeId: string, contentId: string | undefined) =>
    ['programs', 'proposals', nodeId, contentId] as const,
  triggers: () => ['programs', 'triggers'] as const,
  approvals: (programId: string | undefined) =>
    ['programs', 'approvals', programId] as const,
  streams: () => ['programs', 'streams'] as const,
  grants: () => ['programs', 'grants'] as const,
  names: () => ['programs', 'names'] as const,
}

export const listPrograms = () =>
  read<{ programs: Array<ProgramSummary> }>({ action: 'list' }).then((answer) =>
    onePerName(answer.programs),
  )

/** Every saved version answers to its program's name, whichever id names it. */
export const programNames = () =>
  read<{ programs: Array<ProgramSummary> }>({ action: 'list' }).then(
    (answer) =>
      new Map(
        answer.programs.flatMap((program) =>
          [program.node_id, program.program_id, program.content_id].flatMap(
            (id) => (id ? [[id, program.name] as const] : []),
          ),
        ),
      ),
  )

/**
 * Activating a program records the version that runs beside the draft being edited.
 * A person has one program with that name, so the draft stands for both.
 */
function onePerName(programs: Array<ProgramSummary>) {
  const byName = new Map<string, ProgramSummary>()
  for (const program of programs) {
    const held = byName.get(program.name)
    if (!held || (program.status === 'draft' && held.status !== 'draft')) {
      byName.set(program.name, program)
    }
  }
  return [...byName.values()].sort(
    (left, right) =>
      (right.updated_at_ms ?? 0) - (left.updated_at_ms ?? 0) ||
      left.name.localeCompare(right.name, undefined, { numeric: true }),
  )
}

export const listStarters = () =>
  read<{ programs: Array<ProgramDefinition> }>({ action: 'starters' }).then(
    (answer) => answer.programs,
  )

export const loadCatalog = () =>
  read<{
    catalog: { entries: Array<CatalogEntry> }
    published_blocks: Array<CatalogEntry>
  }>({ action: 'catalog' }).then((answer) => answer.catalog.entries)

export const loadProgram = (nodeId: string) =>
  read<LoadedProgram>({ action: 'load', node_id: nodeId })

export const validNext = (boundary: {
  inputs: Array<ProgramPort>
  outputs: Array<ProgramPort>
}) =>
  read<{ entries: Array<CatalogEntry> }>({
    action: 'valid_next',
    boundary,
  }).then((answer) => answer.entries)

export const validateEdge = (producer: ProgramPort, consumer: ProgramPort) =>
  read<EdgeVerdict>({ action: 'validate_edge', producer, consumer })

/** Tables a source node can read: this tenant's graph labels that have rows. */
export const listTables = () =>
  read<{ tables: Array<{ label: string; count: number }> }>({
    action: 'tables',
  }).then((answer) => answer.tables)

/** The graph records of a program's nodes, once it has been materialized. */
export const programNodeRecords = (program: ProgramDefinition) =>
  read<{ program_record: string | null; nodes: Record<string, string> }>({
    action: 'node_records',
    program,
  })

export type ChangeRecord = {
  id: string
  label: string | null
  title: string | null
  named: number
}

/** What in this tenant's graph says it changed something. */
export const listChanges = () =>
  read<{ changes: Array<ChangeRecord> }>({ action: 'changes' }).then(
    (answer) => answer.changes,
  )

/** An expression promoted to a named program: its evidence, and what a call has to bind. */
export type Procedure = {
  name: string
  program_id: string
  source: string
  free_symbols: Array<string>
  receipt_ids: Array<string>
  graph_version: string
}

export const listProcedures = () =>
  read<{ procedures: Array<Procedure> }>({ action: 'procedures' }).then(
    (answer) => answer.procedures,
  )

export const tableColumns = (label: string) =>
  read<{ label: string; column_contract: ColumnContract }>({
    action: 'table_columns',
    label,
  }).then((answer) => answer.column_contract)

export const validateProgram = (program: ProgramDefinition) =>
  read<unknown>({ action: 'validate', program })

export const programInterior = (programId: string, nodeId: string) =>
  read<{ program: ProgramDefinition; pinned_content_id?: string }>({
    action: 'interior',
    program_id: programId,
    node_id: nodeId,
  })

export const interiorVersions = (programId: string, nodeId: string) =>
  read<{
    versions: Array<{ content_id: string; name: string; intent: string }>
  }>({
    action: 'interior_versions',
    program_id: programId,
    node_id: nodeId,
  }).then((answer) => answer.versions)

export const saveProgram = (
  program: ProgramDefinition,
  layout: ProgramLayout,
  nodeId?: string,
) =>
  apply<{ node_id: string; content_id: string; status: string }>({
    action: 'save',
    program,
    layout,
    ...(nodeId ? { node_id: nodeId } : {}),
  })

export const forkStarter = (starter: string, name: string, intent: string) =>
  read<{ program: ProgramDefinition }>({
    action: 'gallery_fork',
    parent_program_id: starter,
    name,
    intent,
  }).then((answer) => answer.program)

export const blankProgram = () =>
  read<{ program: ProgramDefinition }>({ action: 'blank' }).then(
    (answer) => answer.program,
  )

/** A materialized program's runner state: what its trigger last did and when it is next due. */
export type TriggerState = {
  program_id: string
  name?: string
  kind?: string
  paused?: boolean
  last_slot_ms?: number
  pending?: {
    occurrence: string
    status: string
    claimed_at_ms?: number
    asked_at_ms?: number | null
  } | null
  last?: {
    occurrence?: string
    status?: string
    at_ms?: number
    run_id?: string | null
    code?: string | null
    message?: string | null
  } | null
  fired?: number
  missed_slots?: number
  budget_skipped?: number
  truncated?: boolean
  next_due_ms?: number | null
}

export const listTriggers = () =>
  read<{ triggers: Array<TriggerState> }>({ action: 'triggers' }).then(
    (answer) => answer.triggers,
  )

/** Materializing is what makes a program's trigger fire. */
export const activateProgram = (program: ProgramDefinition) =>
  apply<{ program_id: string; receipt_id: string }>({
    action: 'materialize',
    program,
  })

export const setTriggerPaused = (program: ProgramDefinition, paused: boolean) =>
  apply<TriggerState>({ action: 'set_trigger_paused', program, paused })

export type ProgramAuthorization = {
  approval_receipt_id?: string
  agency_proposal_id?: string
}

/** The durable approval a run of this exact program would be admitted with, if any. */
export const programAuthorization = (program: ProgramDefinition) =>
  read<{ authorization: ProgramAuthorization | null }>({
    action: 'authorization',
    program,
  }).then((answer) => answer.authorization)

/** File, or find, the request a person approves before this exact program runs. */
export const requestApproval = (program: ProgramDefinition) =>
  apply<{ proposal_id: string; created: boolean }>({
    action: 'request_approval',
    program,
  })

export type AgencyProposalRow = {
  id: string
  program_id: string
  what_changed: string
  action_class: string
  target_identity: string
  disclosures: Array<{ id: string; text: string }>
  risk_tier: string
  reversibility: string
  expires_at_ms: number
  authoritative_state: string | null
  trigger_refs: Array<string>
}

export const listProgramApprovals = (programId: string) =>
  callTool<{ proposals: Array<AgencyProposalRow> }>('agency_proposals', {
    program_id: programId,
  }).then((answer) => answer.proposals)

/** The signature is the signed-in person's own session; Theorem reads it from the call. */
export const approveProposal = (proposalId: string, expiresAtMs: number) =>
  callTool<{ approval_receipt_id: string; verified_principal_id: string }>(
    'agency_approve',
    { proposal_id: proposalId, expires_at_ms: expiresAtMs },
  )

export const dismissProposal = (proposalId: string, reason: string) =>
  callTool<unknown>('agency_dismiss', { proposal_id: proposalId, reason })

export type AgencyGrant = {
  id: string
  target_scope: string
  maximum_frequency: number
  expires_at_ms: number
  suspended: boolean
  program_executions?: number
}

export const listGrants = () =>
  callTool<{ grants: Array<AgencyGrant> }>('agency_grants', {}).then(
    (answer) => answer.grants,
  )

/** Every version of a named program falls inside this scope. */
export const programGrantScope = (name: string) => `program:${name}:`

export const issueGrant = (
  targetScope: string,
  maximumFrequency: number,
  expiresAtMs: number,
) =>
  callTool<{ grant_id: string }>('agency_grant_issue', {
    target_scope: targetScope,
    maximum_frequency: maximumFrequency,
    expires_at_ms: expiresAtMs,
  })

export const suspendGrant = (grantId: string, suspended: boolean) =>
  callTool<unknown>('agency_grant_suspend', { grant_id: grantId, suspended })

export type StreamEvent = {
  id?: string
  sequence?: number
  topic?: string
  kind?: string
  urgency?: string
  payload?: Record<string, unknown>
  created_at?: string
}

/** Standing programs' notices, oldest first; reading never moves anyone's cursor. */
export const readProgramStreams = (limit: number) =>
  callTool<{ events: Array<StreamEvent> }>('stream_read', {
    actor: 'canvas',
    streams: ['program.notifications', 'program.approvals'],
    advance: false,
    limit,
  }).then((answer) => answer.events)

export const loadRunReceipt = (runId: string) =>
  read<ProgramRunReceipt>({ action: 'run_receipt', run_id: runId })

/** A compound change saves the exterior again: over a draft in place, else as a new draft. */
export type CompoundChange = { node_id: string; content_id: string }

export const advancePin = (
  programId: string,
  nodeId: string,
  toContentId: string,
) =>
  apply<CompoundChange>({
    action: 'advance_pin',
    program_id: programId,
    node_id: nodeId,
    to_content_id: toContentId,
  })

export const expandNode = (programId: string, nodeId: string) =>
  apply<CompoundChange>({
    action: 'expand_node',
    program_id: programId,
    node_id: nodeId,
  })

export const collapseNode = (programId: string, nodeId: string) =>
  apply<CompoundChange>({
    action: 'collapse_node',
    program_id: programId,
    node_id: nodeId,
  })

/** With no publication given, this node attests the block as the tenant's own. */
export const publishProgram = (program: ProgramDefinition) =>
  apply<{ block_id?: string; program_id?: string }>({
    action: 'publish',
    program,
  })

export type BoundaryShape = {
  inputs: Array<ProgramPort>
  outputs: Array<ProgramPort>
}

export type SubgraphExtract = {
  program: ProgramDefinition
  boundary: BoundaryShape
}

/** The selected nodes as a program of their own, with the boundary they would publish. */
export const extractSubgraph = (
  program: ProgramDefinition,
  nodeIds: Array<string>,
  name: string,
) =>
  read<SubgraphExtract>({
    action: 'subgraph',
    program,
    node_ids: nodeIds,
    name,
  })

export const forkProgram = (
  program: ProgramDefinition,
  name: string,
  intent: string,
) => read<ProgramDefinition>({ action: 'fork', program, name, intent })

export type PendingProposal = {
  proposal_id: string
  proposal: CompilerProposal
  diff: ProgramDiff | null
  acceptable: boolean
  refusal: { code: string; message: string; node_ids: Array<string> } | null
  proposed_at_ms: number
}

export type ProposalReceipt = {
  program_id: string
  receipt_id: string
  compiler_id: string
  compiler_receipt_id: string
  source_intent: string
}

export const listProposals = (nodeId: string, program: ProgramDefinition) =>
  read<{ proposals: Array<PendingProposal> }>({
    action: 'proposals',
    node_id: nodeId,
    program,
  }).then((answer) => answer.proposals)

export const acceptProposal = (proposalId: string) =>
  apply<ProposalReceipt>({ action: 'accept_proposal', proposal_id: proposalId })

export const rejectProposal = (proposalId: string, reason: string) =>
  apply<{ proposal_id: string; status: string }>({
    action: 'reject_proposal',
    proposal_id: proposalId,
    reason,
  })
