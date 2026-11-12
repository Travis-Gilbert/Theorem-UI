// SOURCING: none. The delivery record for docs/plans/theo-iphone.md §4 ("queued, uploaded, or accepted"), over Theorem's stored message parts (`attachment` parts carrying `uploadId`, as src/lib/theorem/chat-attachments.ts reads them on the web).
//
// A delivery is one thing the person handed to an existing conversation: some
// items, an instruction, and the conversation that receives them. Each stage
// below names something that was confirmed, by this phone or by Theorem. No
// stage says the model read an item: Theorem does not report that.

export type ItemSource = 'camera' | 'library' | 'files' | 'share' | 'paste' | 'screen'

export type FileItem = {
  kind: 'file'
  id: string
  source: ItemSource
  /** A copy inside the app's own storage, so the delivery outlives the picker's temporary file. */
  uri: string
  name: string
  mimeType: string
  size?: number
  /** Set once Theorem has stored the bytes. */
  uploadId?: string
}

export type TextItem = { kind: 'text'; id: string; source: ItemSource; text: string }
export type LinkItem = { kind: 'link'; id: string; source: ItemSource; url: string; title?: string }
export type IntakeItem = FileItem | TextItem | LinkItem

/** Where a delivery goes. Only Theorem conversations take attachments today. */
export type Receiver = {
  kind: 'theorem-thread'
  projectId: string
  threadId: string
  /** What the person saw when they chose it. */
  title: string
  projectTitle: string
}

/**
 * - `queued`: saved on this phone. Nothing has left it.
 * - `uploading`: files are going to Theorem; some may already be stored.
 * - `uploaded`: Theorem stored every file and gave each an upload id.
 * - `sending`: the message was handed to the conversation's journal. If the
 *   app stops here, the journal sends it again under the same id.
 * - `admitted`: Theorem accepted the message into the conversation and
 *   started a run for it.
 * - `recorded`: the message Theorem stored carries every file as an
 *   attachment. This is the last thing Theorem confirms.
 * - `refused`: Theorem said no, and repeating the same request will not help.
 * - `failed`: something went wrong that trying again may fix.
 */
export type Stage =
  'queued' | 'uploading' | 'uploaded' | 'sending' | 'admitted' | 'recorded' | 'refused' | 'failed'

export type Delivery = {
  /** Also the conversation command id and the prefix of each upload's idempotency key. */
  id: string
  createdAtMs: number
  updatedAtMs: number
  receiver: Receiver
  instruction: string
  items: IntakeItem[]
  stage: Stage
  /** The stage a failed or refused delivery had reached, so a retry resumes there. */
  stoppedAt?: Exclude<Stage, 'refused' | 'failed'>
  error?: string
  /** From Theorem's answer to the send. */
  messageId?: string
  runId?: string
}

export const isSettled = (delivery: Delivery) => delivery.stage === 'recorded' || delivery.stage === 'refused'

/** Still owed work that the queue can do without the person. */
export const isPending = (delivery: Delivery) =>
  !isSettled(delivery) && delivery.stage !== 'failed' && delivery.stage !== 'admitted'

export const files = (delivery: Delivery) =>
  delivery.items.filter((item): item is FileItem => item.kind === 'file')

export function newDelivery(input: {
  id: string
  nowMs: number
  receiver: Receiver
  instruction: string
  items: IntakeItem[]
}): Delivery {
  if (!input.items.length && !input.instruction.trim()) throw new Error('There is nothing to send.')
  return {
    id: input.id,
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
    receiver: input.receiver,
    instruction: input.instruction.trim(),
    items: input.items,
    stage: 'queued',
  }
}

/**
 * The message text: the instruction, then each supplied link and passage.
 * Files travel as upload ids, not as text, so they are not described here.
 */
export function messageText(delivery: Delivery): string {
  const blocks = [delivery.instruction]
  for (const item of delivery.items) {
    if (item.kind === 'link') blocks.push(item.title ? `${item.title}\n${item.url}` : item.url)
    if (item.kind === 'text') blocks.push(item.text.trim().replace(/^/gm, '> '))
  }
  const text = blocks.filter((block) => block.trim()).join('\n\n')
  if (text) return text
  const count = files(delivery).length
  // Theorem's send takes text with uploads; a bare file still needs a sentence.
  return count === 1 ? 'Shared from my phone.' : `${count} items shared from my phone.`
}

type StoredMessage = { messageId?: string; parts?: { type: string; payload?: unknown }[] }

/** The upload ids a stored message carries as attachments. */
export function storedUploads(message: StoredMessage | undefined): string[] {
  return (message?.parts ?? []).flatMap((part) => {
    const uploadId = (part.payload as { uploadId?: unknown } | undefined)?.uploadId
    return part.type === 'attachment' && typeof uploadId === 'string' ? [uploadId] : []
  })
}

/**
 * What Theorem's answer to the send establishes. `recorded` needs every file
 * of the delivery among the stored message's attachments; an answer that
 * lacks one stays `admitted`, and the screen says which is missing.
 */
export function afterSend(
  delivery: Delivery,
  answer: { record?: StoredMessage; run?: { runId?: string } } | undefined,
  nowMs: number,
): Delivery {
  const stored = new Set(storedUploads(answer?.record))
  const wanted = files(delivery).map((file) => file.uploadId)
  const all = !!answer?.record && wanted.every((uploadId) => uploadId !== undefined && stored.has(uploadId))
  return {
    ...delivery,
    stage: all ? 'recorded' : 'admitted',
    stoppedAt: undefined,
    error: undefined,
    messageId: answer?.record?.messageId,
    runId: answer?.run?.runId,
    updatedAtMs: nowMs,
  }
}

/** Files Theorem's stored message does not show, for an `admitted` delivery. */
export function missingFromRecord(delivery: Delivery, message: StoredMessage | undefined): FileItem[] {
  const stored = new Set(storedUploads(message))
  return files(delivery).filter((file) => !file.uploadId || !stored.has(file.uploadId))
}

export type StageLine = { label: string; detail: string; tone: 'muted' | 'accent' | 'attention' | 'error' }

/** One honest sentence per stage. Status always travels with words (DESIGN.md). */
export function describeStage(delivery: Delivery): StageLine {
  const count = files(delivery).length
  const done = files(delivery).filter((file) => file.uploadId).length
  const thing = count === 1 ? 'the file' : `all ${count} files`
  switch (delivery.stage) {
    case 'queued':
      return { label: 'Queued', detail: 'Saved on this phone. Nothing has been sent yet.', tone: 'muted' }
    case 'uploading':
      return { label: 'Uploading', detail: `Theorem has stored ${done} of ${count}.`, tone: 'accent' }
    case 'uploaded':
      return {
        label: 'Uploaded',
        detail: `Theorem has stored ${thing}. The conversation has not received the message yet.`,
        tone: 'accent',
      }
    case 'sending':
      return {
        label: 'Sending',
        detail: 'The message is in the conversation’s journal. Theorem has not answered yet.',
        tone: 'accent',
      }
    case 'admitted':
      return {
        label: 'Accepted by Theorem',
        detail: count
          ? 'Theorem accepted the message and started a run, but its stored message does not show every file.'
          : 'Theorem accepted the message and started a run.',
        tone: count ? 'attention' : 'accent',
      }
    case 'recorded':
      return {
        label: 'In the conversation',
        detail: count
          ? `Theorem’s stored message carries ${thing}. Theorem does not report whether the model read ${count === 1 ? 'it' : 'them'}.`
          : 'Theorem stored the message and started a run.',
        tone: 'accent',
      }
    case 'refused':
      return { label: 'Refused', detail: delivery.error ?? 'Theorem refused this.', tone: 'error' }
    case 'failed':
      return {
        label: 'Not sent',
        detail: `${delivery.error ?? 'Something went wrong.'} It stopped while ${stoppedWords(delivery.stoppedAt)}.`,
        tone: 'error',
      }
  }
}

function stoppedWords(stage: Delivery['stoppedAt']): string {
  switch (stage) {
    case 'uploading':
    case 'queued':
    case undefined:
      return 'uploading'
    case 'uploaded':
    case 'sending':
      return 'sending the message'
    default:
      return 'confirming the message'
  }
}
