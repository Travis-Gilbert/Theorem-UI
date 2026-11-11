// SOURCING: Theorem's native tools over the generated SDK route (src/lib/theorem/native.ts).
// The shapes follow the tool schemas in rustyred-thg-mcp's executable_environment.schema.json;
// the generated SDK has no resource for these tools yet, so they are declared here.
import type { Theorem } from '@theoremharness/sdk'
import type { ProgramDefinition } from './contracts'
import { callTool } from '@/lib/theorem/native'

export const listEngines = () =>
  callTool<Theorem.GraphComputeAvailability>('graph_compute', {
    action: 'availability',
  })

export type NeighborhoodRequest = {
  seeds?: Array<string>
  change_ref?: string
  hops: number
  attach_to: string
  direction: Theorem.GraphAffectedNeighborhood.Direction
  edge_types?: Array<string>
}

/** Theorem stores the result and links it from attach_to; the answer names both. */
export const affectedNeighborhood = (request: NeighborhoodRequest) =>
  callTool<Theorem.GraphAffectedNeighborhood>('graph_compute', {
    action: 'affected_neighborhood',
    ...request,
  })

export type LintSeverity = 'error' | 'warning' | 'info'

export type LintDiagnostic = {
  id: string
  rule_id: string
  severity: LintSeverity
  subject: string
  message: string
  examined: Array<string>
  score: number
}

type LintAnswer = {
  report: { verdict: string; diagnostics: Array<LintDiagnostic> }
}

export const lintGraph = () => callTool<LintAnswer>('graph_lint', { packs: [] })

/** Lints the definition itself, so every finding names one of its nodes. */
export const lintProgram = (program: ProgramDefinition) =>
  callTool<LintAnswer>('graph_lint', { packs: ['program'], program })

export type LispReceipt = {
  receipt_id: string
  status: string
  fuel_limit?: number | null
  fuel_used?: number | null
}

export type LispSurface = {
  graph_version: string
  execution?: {
    result: {
      result: string
      root?: string
      explanation?: { inputs?: Array<string> }
    } & Record<string, unknown>
    receipt: LispReceipt
  }
  failure?: { error: { code: string; detail: string }; receipt: LispReceipt }
}

type LispAction =
  | 'eval'
  | 'explain'
  | 'diff'
  | 'read'
  | 'promote'
  | 'call'
  | 'session_create'
  | 'session_eval'

export const graphLisp = (action: LispAction, args: Record<string, unknown>) =>
  callTool<
    { graph_lisp?: LispSurface; session?: { session_id: string } } & Record<
      string,
      unknown
    >
  >('graph_lisp', {
    action,
    arguments: args,
  })

export type AffordanceCandidate = {
  affordance_id?: string
  name?: string
  one_line_description?: string
  score?: number
  fitness?: number
  status?: string
  degraded_reason?: string | null
  writeback_policy?: string
  matched_terms?: Array<string>
}

export const rankAffordances = (query: string) =>
  callTool<{ results: Array<AffordanceCandidate>; ranking?: string }>(
    'tool_search',
    { query, k: 6, invocable_only: true },
  )

export const describeAffordance = (affordanceId: string) =>
  callTool<{ input_schema?: { properties?: Record<string, unknown> } }>(
    'describe',
    { affordance_id: affordanceId },
  )

export type AffordanceOutcome =
  'output_used' | 'output_discarded' | 'user_correction'

export const recordOutcome = (
  affordanceId: string,
  receiptRef: string,
  outcome: AffordanceOutcome,
  taskType: string,
) =>
  callTool<unknown>('affordance_score_events', {
    affordance_id: affordanceId,
    turn_receipt_ref: receiptRef,
    events: [outcome],
    task_type: taskType,
  })

export const deriveCommand = (
  action: 'list' | 'poll' | 'upsert',
  args: Record<string, unknown> = {},
) => callTool<Record<string, unknown>>('reactive_derive', { action, ...args })

export type SpecDerivationReceipt = {
  document_id: string
  rule_id: string
  record_ids: Array<string>
  archived_record_ids: Array<string>
}

const specDocId = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const commitSpec = (title: string, content: string) =>
  callTool<{ derivation?: { receipt?: SpecDerivationReceipt } }>(
    'document_commit',
    {
      doc_id: specDocId(title),
      kind: 'spec',
      title,
      actor_id: 'canvas',
      content,
    },
  )
