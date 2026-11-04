import { ExportedMessageRepository } from '@assistant-ui/react'
import type { ThreadMessage, ThreadRuntime } from '@assistant-ui/react'
import type { Theorem } from './client'
import { toHistoryMessages } from './message-history'

function sameHead(local: ThreadMessage, durable: Theorem.Message): boolean {
  if (local.id === durable.messageId) return true
  if (local.role !== 'assistant' || durable.role !== 'assistant') return false
  const runId = local.metadata.custom.theoremRunId
  return (
    typeof runId === 'string' && runId.length > 0 && runId === durable.runId
  )
}

/** Keep the current IDs and side branches; only graft the durable tail onto its known head. */
function appendTail(
  repository: ExportedMessageRepository,
  head: ThreadMessage,
  snapshot: Theorem.ThreadSnapshot,
): ExportedMessageRepository | undefined {
  const index = snapshot.messages.findIndex((message) =>
    sameHead(head, message),
  )
  if (index < 0 || index === snapshot.messages.length - 1) return undefined
  const entries = new Map(
    repository.messages.map((entry) => [entry.message.id, entry]),
  )
  if (!entries.has(head.id)) return undefined
  const tail = ExportedMessageRepository.fromArray(
    toHistoryMessages(snapshot.messages.slice(index + 1), snapshot.thread),
  )
  let parentId = head.id
  for (const entry of tail.messages) {
    entries.set(entry.message.id, { ...entry, parentId })
    parentId = entry.message.id
  }
  return { headId: parentId, messages: [...entries.values()] }
}

/** Import a completed background answer only while the visible conversation is unchanged. */
export async function refreshConversation(
  thread: Pick<ThreadRuntime, 'getState' | 'export' | 'import'>,
  load: () => Promise<Theorem.ThreadSnapshot>,
): Promise<boolean> {
  const before = thread.getState()
  if (before.isRunning || before.isLoading) return false
  const snapshot = await load()
  const now = thread.getState()
  if (
    now.isRunning ||
    now.isLoading ||
    now.messages !== before.messages ||
    snapshot.liveRun
  )
    return false
  const head = now.messages.at(-1)
  if (!head) return false
  const extended = appendTail(thread.export(), head, snapshot)
  if (!extended) return false
  thread.import(extended)
  return true
}
