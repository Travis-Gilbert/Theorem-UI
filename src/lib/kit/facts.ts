// SOURCING: assistant-ui ThreadMessage content as @theoremharness/sdk/assistant-ui maps theorem-chat/1 parts onto it (an approval on its tool call's `artifact.theoremApproval`, with a human interrupt only while it awaits; other parts as `theorem-<type>` data parts), read with the chat's own approval reading in components/chat/theorem-parts
import type { ThreadMessage } from '@assistant-ui/react'
import { approvalOutcome, readApproval } from '@/components/chat/theorem-parts'
import { readExpression } from './liveness'
import type { KitExpression } from './liveness'

/** What one conversation tells Kit right now. */
export interface SourceFacts {
  readonly running: boolean
  /** The conversation's run is waiting on the person to answer an approval. */
  readonly asking: boolean
  /** The newest expression the live turn authored, keyed by its part. */
  readonly expression?: {
    readonly partId: string
    readonly value: KitExpression
  }
}

/**
 * Reads the conversation's last assistant message, which is the live turn
 * while one runs. An approval asks only while its status awaits a decision:
 * one that expired or was replaced settles unanswered and asks nothing.
 * Expressions are taken from a running turn only, so reopening an old
 * conversation never replays a manner the agent has since moved past; the
 * thread snapshot's `figureExpression` carries the current one instead.
 */
export function kitFactsOf(
  messages: readonly ThreadMessage[],
  running: boolean,
): SourceFacts {
  const last = messages.at(-1)
  if (last?.role !== 'assistant') return { running, asking: false }
  let asking = false
  let expression: SourceFacts['expression']
  for (const part of last.content) {
    if (part.type === 'tool-call' && part.result === undefined) {
      const approval = readApproval(part)
      if (approval && approvalOutcome(approval) === 'awaiting') asking = true
    } else if (
      running &&
      part.type === 'data' &&
      part.name === 'theorem-expression'
    ) {
      const data = part.data as Record<string, unknown> | undefined
      const value = readExpression(data)
      if (value && typeof data?.partId === 'string')
        expression = { partId: data.partId, value }
    }
  }
  return expression ? { running, asking, expression } : { running, asking }
}
