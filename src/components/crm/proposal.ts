// SOURCING: Theorem's `record_change_proposal` chat part and its record-proposals routes (ProposalView): a change the assistant proposes to a saved record, which is not made until the person approves it. Decoded here once, with the words each state is shown as, so the renderer never prints a code
type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : undefined
const whole = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const either = (raw: Json, camel: string, snake: string) =>
  raw[camel] ?? raw[snake]

export type ProposalStatus =
  'pending_approval' | 'applied' | 'dismissed' | 'refused'

export type ProposalDecision = {
  decision: 'approve' | 'dismiss'
  reason: string | null
  decidedAtMs: number
  beforeRevision: number | null
  afterRevision: number | null
  currentRevision: number | null
  changeId: string | null
  refusal: { code: string; detail: string } | undefined
  /** What the approval made beyond the saved fields: the task, once made. */
  task: MadeTask | undefined
  /** The message draft an approval saved, once saved. */
  draft: SavedDraft | undefined
}

/** The task a proposal would add to the person's work tracker. */
export type ProposedTask = {
  title: string
  details: string | undefined
  workItemId: string
}

/** The task an approval made, as the work tracker answered. */
export type MadeTask = {
  workItemId: string
  key: string
  title: string
}

/**
 * A message Theorem would draft for the person to send themselves. Approving
 * saves it as a document; nothing is ever sent from it.
 */
export type ProposedDraft = {
  subject: string
  body: string
  /** Who it is for: a person given to the conversation. */
  to: { recordId: string; title: string } | undefined
  /** The id the saved draft will have. */
  documentId: string
}

/** The draft an approval saved, and the records it was filed to. */
export type SavedDraft = {
  documentId: string
  title: string
  /** The titles of the records the draft was filed to. */
  filedTo: string[]
}

export type ProposalField = {
  key: string
  label: string
  from: unknown
  to: unknown
}

/** A passage of a document filed to the record, that the change rests on. */
export type ProposalSource = {
  documentId: string
  title: string
  /** The document's revision when the passage was read. */
  revision: number | null
  quote: string
}

export type RecordProposal = {
  proposalId: string
  threadId: string
  branchId: string
  runId: string
  recordId: string
  objectTypeId: string
  objectType: string
  baseRevision: number | null
  fields: ProposalField[]
  reason: string
  evidence: string[]
  /** Passages of filed documents the change rests on; empty when none. */
  sources: ProposalSource[]
  status: ProposalStatus
  applied: boolean
  decision: ProposalDecision | null
  createdAtMs: number
  /** Set when approving also adds a task to the work tracker. */
  task: ProposedTask | undefined
  /** Set when approving also saves a message draft. */
  draft: ProposedDraft | undefined
}

const STATUSES: ProposalStatus[] = [
  'pending_approval',
  'applied',
  'dismissed',
  'refused',
]

function decodeDecision(raw: unknown): ProposalDecision | null {
  if (!isObject(raw)) return null
  const decision = raw.decision
  if (decision !== 'approve' && decision !== 'dismiss') return null
  const refusal = isObject(raw.refusal)
    ? {
        code: text(raw.refusal.code) ?? '',
        detail: text(raw.refusal.detail) ?? '',
      }
    : undefined
  return {
    decision,
    reason: text(raw.reason) ?? null,
    decidedAtMs: Number(either(raw, 'decidedAtMs', 'decided_at_ms')) || 0,
    beforeRevision: whole(either(raw, 'beforeRevision', 'before_revision')),
    afterRevision: whole(either(raw, 'afterRevision', 'after_revision')),
    currentRevision: whole(either(raw, 'currentRevision', 'current_revision')),
    changeId: text(either(raw, 'changeId', 'change_id')) ?? null,
    refusal,
    task: decodeMadeTask(raw.result),
    draft: decodeSavedDraft(raw.result),
  }
}

function decodeSavedDraft(raw: unknown): SavedDraft | undefined {
  if (!isObject(raw) || raw.kind !== 'message_draft') return undefined
  const documentId = text(either(raw, 'documentId', 'document_id'))
  if (!documentId) return undefined
  const filedTo = either(raw, 'filedTo', 'filed_to')
  return {
    documentId,
    title: text(raw.title) ?? '',
    filedTo: Array.isArray(filedTo)
      ? filedTo
          .map((record) => (isObject(record) ? text(record.title) : undefined))
          .filter((title): title is string => !!title)
      : [],
  }
}

function decodeProposedDraft(raw: unknown): ProposedDraft | undefined {
  if (!isObject(raw) || raw.kind !== 'message_draft') return undefined
  const subject = text(raw.subject)
  const body = text(raw.body)
  const documentId = text(either(raw, 'documentId', 'document_id'))
  if (!subject || !body || !documentId) return undefined
  const to = isObject(raw.to) ? raw.to : undefined
  const recordId = to && text(either(to, 'recordId', 'record_id'))
  return {
    subject,
    body,
    to: recordId ? { recordId, title: text(to.title) ?? recordId } : undefined,
    documentId,
  }
}

function decodeMadeTask(raw: unknown): MadeTask | undefined {
  if (!isObject(raw) || raw.kind !== 'task') return undefined
  const workItemId = text(either(raw, 'workItemId', 'work_item_id'))
  if (!workItemId) return undefined
  return {
    workItemId,
    key: text(raw.key) ?? '',
    title: text(raw.title) ?? '',
  }
}

function decodeProposedTask(raw: unknown): ProposedTask | undefined {
  if (!isObject(raw) || raw.kind !== 'task') return undefined
  const title = text(raw.title)
  const workItemId = text(either(raw, 'workItemId', 'work_item_id'))
  if (!title || !workItemId) return undefined
  return { title, details: text(raw.details), workItemId }
}

/** A proposal as the server sends it; anything that is not one is `undefined`. */
export function decodeProposal(raw: unknown): RecordProposal | undefined {
  if (!isObject(raw)) return undefined
  const proposalId = text(raw.proposalId)
  const recordId = text(raw.recordId)
  const status = STATUSES.find((s) => s === raw.status)
  if (!proposalId || !recordId || !status) return undefined
  const fields: ProposalField[] = []
  if (Array.isArray(raw.fields))
    for (const field of raw.fields) {
      if (!isObject(field)) continue
      const key = text(field.key)
      if (key)
        fields.push({
          key,
          label: text(field.label) ?? key,
          from: field.from,
          to: field.to,
        })
    }
  return {
    proposalId,
    threadId: text(raw.threadId) ?? '',
    branchId: text(raw.branchId) ?? '',
    runId: text(raw.runId) ?? '',
    recordId,
    objectTypeId: text(raw.objectTypeId) ?? '',
    objectType: text(raw.objectType) ?? 'record',
    baseRevision: whole(raw.baseRevision),
    fields,
    reason: text(raw.reason) ?? '',
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.filter((v): v is string => typeof v === 'string' && !!v)
      : [],
    sources: decodeSources(raw.sources),
    status,
    applied: raw.applied === true,
    decision: decodeDecision(raw.decision),
    createdAtMs: Number(raw.createdAtMs) || 0,
    task: decodeProposedTask(raw.action),
    draft: decodeProposedDraft(raw.action),
  }
}

function decodeSources(raw: unknown): ProposalSource[] {
  if (!Array.isArray(raw)) return []
  const sources: ProposalSource[] = []
  for (const source of raw) {
    if (!isObject(source)) continue
    const documentId = text(source.documentId)
    const quote = text(source.quote)
    if (!documentId || !quote) continue
    const revision = isObject(source.revision)
      ? whole(source.revision.position)
      : null
    sources.push({
      documentId,
      title: text(source.title) ?? 'Untitled document',
      revision,
      quote,
    })
  }
  return sources
}

/** The part's payload: the proposal at `proposal`, or nested under `payload`. */
export function decodeProposalPart(data: unknown): RecordProposal | undefined {
  const outer = isObject(data) ? data : {}
  const part = isObject(outer.proposal)
    ? outer
    : isObject(outer.payload)
      ? outer.payload
      : {}
  return decodeProposal(part.proposal)
}

export type EvidenceRef = {
  objectType: string
  recordId: string
  revision: number | undefined
}

/**
 * `record:<Type>/<id>@<rev>`. Ids may contain `@` (and `/`), so the revision is
 * split off the last `@` only when what follows is all digits.
 */
export function parseEvidence(reference: string): EvidenceRef | undefined {
  const match = /^record:([^/]+)\/(.+)$/.exec(reference)
  if (!match) return undefined
  const objectType = match[1]!
  let recordId = match[2]!
  let revision: number | undefined
  const at = recordId.lastIndexOf('@')
  if (at > 0 && /^\d+$/.test(recordId.slice(at + 1))) {
    revision = Number(recordId.slice(at + 1))
    recordId = recordId.slice(0, at)
  }
  return recordId ? { objectType, recordId, revision } : undefined
}

/** A value as the diff shows it; nothing is "—". */
export function valueWords(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value))
    return value.length ? value.map(valueWords).join(', ') : '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** What a settled proposal says, or undefined while it waits. */
export function outcomeWords(proposal: RecordProposal): string | undefined {
  const { decision } = proposal
  switch (proposal.status) {
    case 'pending_approval':
      return undefined
    case 'applied':
      if (decision?.draft)
        return `Saved the draft \u201c${decision.draft.title}\u201d${
          decision.draft.filedTo.length
            ? ` and filed it to ${decision.draft.filedTo.join(' and ')}`
            : ''
        }. Nothing was sent.`
      if (proposal.draft)
        return `Saved the draft on this ${proposal.objectType.toLowerCase()}. Nothing was sent.`
      if (decision?.task)
        return `Added ${decision.task.key || 'the task'} to your work tracker and saved it on this ${proposal.objectType.toLowerCase()}.`
      if (proposal.task)
        return `Added the task to your work tracker and saved it on this ${proposal.objectType.toLowerCase()}.`
      return decision?.afterRevision != null
        ? `Saved at revision ${decision.afterRevision}`
        : 'Saved'
    case 'dismissed':
      return "Dismissed. Theorem won't propose this again unless something new supports it."
    case 'refused':
      if (proposal.draft && decision?.refusal?.code !== 'record_revision_stale')
        return `No draft was saved: ${decision?.refusal?.detail || 'the approval was refused.'}`
      if (proposal.task && decision?.refusal?.code !== 'record_revision_stale')
        return `No task was made: ${decision?.refusal?.detail || 'the approval was refused.'}`
      return decision?.refusal?.code === 'record_revision_stale'
        ? `Not applied: this ${proposal.objectType.toLowerCase()} changed after it was proposed, so it keeps its current values.`
        : `Not applied: ${decision?.refusal?.detail || 'the change could not be made.'}`
  }
}

/**
 * The `origin` a record's saved change carries: a proposal the person
 * approved, or a write Theorem made in the person's conversation.
 */
export type ChangeOrigin =
  | {
      kind: 'proposal'
      proposalId: string
      threadId: string
      runId: string
      proposedBy: 'theorem'
      reason: string | undefined
      evidence: string[]
    }
  | {
      kind: 'conversation'
      threadId: string
      runId: string
      proposedBy: 'theorem'
    }

/** An origin of a kind not listed here is `undefined`, never an error. */
export function decodeOrigin(raw: unknown): ChangeOrigin | undefined {
  if (!isObject(raw)) return undefined
  const threadId = text(either(raw, 'threadId', 'thread_id'))
  const runId = text(either(raw, 'runId', 'run_id')) ?? ''
  if (!threadId) return undefined
  if (raw.kind === 'conversation')
    return { kind: 'conversation', threadId, runId, proposedBy: 'theorem' }
  if (raw.kind !== 'proposal') return undefined
  const proposalId = text(either(raw, 'proposalId', 'proposal_id'))
  if (!proposalId) return undefined
  const evidence = raw.evidence
  return {
    kind: 'proposal',
    proposalId,
    threadId,
    runId,
    proposedBy: 'theorem',
    reason: text(raw.reason),
    evidence: Array.isArray(evidence)
      ? evidence.filter((v): v is string => typeof v === 'string' && !!v)
      : [],
  }
}

/** How a change's origin reads beside it. */
export const originText = (origin: ChangeOrigin) =>
  origin.kind === 'proposal'
    ? `Proposed by Theorem, approved by you${origin.reason ? `: ${origin.reason}` : ''}`
    : 'Made by Theorem in your conversation'
