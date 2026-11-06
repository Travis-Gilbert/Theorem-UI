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

/** Background deliveries extend an assistant's durable parent chain. */
function backgroundAnswersAfter(
  message: ThreadMessage,
  visible: readonly ThreadMessage[],
  durable: readonly Theorem.Message[],
): Theorem.Message[] {
  if (message.role !== 'assistant') return []
  const index = durable.findIndex((candidate) => sameHead(message, candidate))
  if (index < 0) return []
  const answers: Theorem.Message[] = []
  let parentId = durable[index]!.messageId
  for (const candidate of durable.slice(index + 1)) {
    if (
      candidate.role !== 'assistant' ||
      candidate.parentMessageId !== parentId ||
      visible.some((local) => sameHead(local, candidate))
    )
      break
    answers.push(candidate)
    parentId = candidate.messageId
  }
  return answers
}

/** Use assistant-ui's existing repository conversion and preserve local entries. */
function graftMessages(
  entries: Map<string, ExportedMessageRepository['messages'][number]>,
  parentId: string,
  messages: readonly Theorem.Message[],
  snapshot: Theorem.ThreadSnapshot,
): string {
  const additions = ExportedMessageRepository.fromArray(
    toHistoryMessages([...messages], snapshot.thread),
  )
  for (const entry of additions.messages) {
    entries.set(entry.message.id, {
      ...(entries.get(entry.message.id) ?? entry),
      parentId,
    })
    parentId = entry.message.id
  }
  return parentId
}

function insertBackgroundAnswers(
  entries: Map<string, ExportedMessageRepository['messages'][number]>,
  visible: readonly ThreadMessage[],
  snapshot: Theorem.ThreadSnapshot,
): boolean {
  let changed = false
  for (let index = 0; index < visible.length - 1; index += 1) {
    const anchor = visible[index]!
    const successor = entries.get(visible[index + 1]!.id)
    if (!entries.has(anchor.id) || !successor) continue
    const missing = backgroundAnswersAfter(anchor, visible, snapshot.messages)
    if (!missing.length) continue
    const parentId = graftMessages(entries, anchor.id, missing, snapshot)
    entries.set(successor.message.id, { ...successor, parentId })
    changed = true
  }
  return changed
}

/** Keep local IDs, configuration and side branches while filling durable gaps. */
function reconcileHistory(
  repository: ExportedMessageRepository,
  visible: readonly ThreadMessage[],
  snapshot: Theorem.ThreadSnapshot,
): ExportedMessageRepository | undefined {
  const head = visible.at(-1)!
  const index = snapshot.messages.findIndex((message) =>
    sameHead(head, message),
  )
  if (index < 0) return undefined
  const entries = new Map(
    repository.messages.map((entry) => [entry.message.id, entry]),
  )
  if (!entries.has(head.id)) return undefined
  const inserted = insertBackgroundAnswers(entries, visible, snapshot)
  const tail = snapshot.messages.slice(index + 1)
  if (!inserted && !tail.length) return undefined
  const headId = graftMessages(entries, head.id, tail, snapshot)
  return { headId, messages: [...entries.values()] }
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
  const extended = reconcileHistory(thread.export(), now.messages, snapshot)
  if (!extended) return false
  thread.import(extended)
  return true
}
