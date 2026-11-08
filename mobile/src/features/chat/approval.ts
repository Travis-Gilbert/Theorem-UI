// SOURCING: none. Reads the tool_approval snapshot @theoremharness/sdk keeps on a tool-call part (artifact.theoremApproval), as the web card does (Theorem-UI src/components/chat/theorem-parts.tsx readApproval)

export type ApprovalOption = { optionId: string; name: string; kind: string }

export type Approval = {
  approvalId: string
  toolCallId: string
  toolName: string
  summary: string
  risk: string
  /** The server's status for this request. */
  status: string
  approved: boolean | undefined
  options: ApprovalOption[]
}

type Json = Record<string, unknown>
const object = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
const str = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/** Statuses Theorem reads as still waiting on a person (assistant-ui.ts). */
const AWAITING = new Set(['requires_action', 'pending', 'open'])

export function readApproval(artifact: unknown): Approval | undefined {
  const part = object(object(artifact).theoremApproval)
  const approvalId = str(part.approvalId)
  const toolCallId = str(part.toolCallId)
  if (!approvalId || !toolCallId) return undefined
  const options = Array.isArray(part.options)
    ? part.options.map(object).flatMap((option) =>
        str(option.optionId) && str(option.kind)
          ? [
              {
                optionId: option.optionId as string,
                name: str(option.name) ?? (option.kind as string),
                kind: option.kind as string,
              },
            ]
          : [],
      )
    : []
  return {
    approvalId,
    toolCallId,
    toolName: str(part.toolName) ?? 'tool',
    summary: str(part.summary) ?? `Allow ${str(part.toolName) ?? 'this tool'} to run?`,
    risk: str(part.risk) ?? 'unknown',
    status: str(part.status) ?? 'pending',
    approved: typeof part.approved === 'boolean' ? part.approved : undefined,
    options,
  }
}

export const awaitsDecision = (approval: Approval) =>
  approval.approved === undefined && AWAITING.has(approval.status)

/** The decision the run reported, in words. */
export function outcomeOf(approval: Approval): string {
  if (approval.approved === true) return 'Allowed'
  if (approval.approved === false) return 'Denied'
  return approval.status.replace(/_/g, ' ')
}

export type Choice = { optionId: string } | { decision: 'allow' | 'deny' }

/** The choices to offer: the request's own options, or allow/deny when it names none. */
export function choicesOf(approval: Approval): Array<{ label: string; choice: Choice; grants: boolean }> {
  if (!approval.options.length)
    return [
      { label: 'Allow once', choice: { decision: 'allow' }, grants: true },
      { label: 'Deny', choice: { decision: 'deny' }, grants: false },
    ]
  const order = ['allow_once', 'allow_always', 'reject_once', 'reject_always']
  // Kinds Theorem adds later keep their order after the known ones.
  const rank = (kind: string) => (order.includes(kind) ? order.indexOf(kind) : order.length)
  return [...approval.options]
    .sort((a, b) => rank(a.kind) - rank(b.kind))
    .map((option) => ({
      label: option.name,
      choice: { optionId: option.optionId },
      grants: option.kind.startsWith('allow'),
    }))
}
