// SOURCING: assistant-ui thread and thread list item state (useAuiState), readApproval (the chat's own reading of a Theorem approval), penpal through the frame's remote; the message shapes are the frame contract in ide/theia-extensions/theorem-workspace/src/common/ide-bridge.ts
//
// The IDE's chat shows the conversation this window shows. Each update
// carries only the messages that are new or changed since the last one, so a
// streaming reply sends the one message it changes.
import { useAuiState } from '@assistant-ui/react'
import type { ThreadMessage } from '@assistant-ui/react'
import type { RemoteProxy } from 'penpal'
import { useEffect, useRef } from 'react'
import { approvalOutcome, readApproval } from '@/components/chat/theorem-parts'
import { describeError } from '@/lib/theorem/client'
import type {
  ChatMessage,
  ChatPart,
  IdeFrameMethods,
} from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-bridge'

type Ide = RemoteProxy<IdeFrameMethods>

export function toPart(
  part: ThreadMessage['content'][number],
  runId: string | undefined,
): ChatPart | undefined {
  switch (part.type) {
    case 'text':
    case 'reasoning':
      return { type: part.type, text: part.text }
    case 'tool-call': {
      const approval = readApproval(part)
      // One that settled unanswered (expired, replaced or failed) goes marked
      // settled, so the frame closes a prompt it already opened for it.
      const outcome = approval && approvalOutcome(approval)
      const settled = outcome === 'unanswered' || outcome === 'failed'
      return {
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        argsText: part.argsText,
        result: part.result,
        isError: part.isError,
        approval:
          approval && runId
            ? {
                runId,
                approvalId: approval.approvalId,
                toolCallId: approval.toolCallId,
                summary: approval.summary,
                approved: approval.approved,
                settled: settled ? { reason: approval.reason } : undefined,
                options: approval.options,
              }
            : undefined,
      }
    }
    case 'data':
      return { type: 'data', name: part.name, data: part.data }
    default:
      return undefined
  }
}

function toChatMessage(message: ThreadMessage): ChatMessage {
  const runId = message.metadata.custom.theoremRunId
  const status = message.role === 'assistant' ? message.status : undefined
  const ended = status?.type === 'incomplete' ? status : undefined
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    parts: message.content.flatMap(
      (part) => toPart(part, typeof runId === 'string' ? runId : undefined) ?? [],
    ),
    running: status?.type === 'running' || status?.type === 'requires-action',
    stopped: ended?.reason === 'cancelled' || undefined,
    error:
      ended && ended.reason !== 'cancelled'
        ? ended.error === undefined
          ? 'The turn did not finish.'
          : describeError(ended.error)
        : undefined,
  }
}

type Sent = {
  ide: Ide
  key: string
  threadId: string | null
  title: string | undefined
  order: string
  messages: ReadonlyMap<string, ThreadMessage>
}

/** Keeps the IDE's chat on the conversation on screen while the frame is linked. */
export function useChatMirror(ide: Ide | undefined) {
  const messages = useAuiState((s) => s.thread.messages)
  // The item id stays the same when a new chat gains its thread id.
  const key = useAuiState((s) => s.threadListItem.id)
  const threadId = useAuiState((s) => s.threadListItem.remoteId) ?? null
  const title = useAuiState((s) => s.threadListItem.title)
  const sent = useRef<Sent>(undefined)

  useEffect(() => {
    if (!ide) return
    const last =
      sent.current?.ide === ide && sent.current.key === key
        ? sent.current
        : undefined
    const shown = messages.filter((m) => m.role !== 'system')
    const order = shown.map((m) => m.id)
    const changed = shown.filter((m) => last?.messages.get(m.id) !== m)
    if (
      last &&
      !changed.length &&
      last.order === order.join('\n') &&
      last.threadId === threadId &&
      last.title === title
    )
      return
    sent.current = {
      ide,
      key,
      threadId,
      title,
      order: order.join('\n'),
      messages: new Map(shown.map((m) => [m.id, m])),
    }
    void ide.setThread({
      key,
      threadId,
      title,
      order,
      changed: changed.map(toChatMessage),
    })
  }, [ide, key, threadId, title, messages])
}
