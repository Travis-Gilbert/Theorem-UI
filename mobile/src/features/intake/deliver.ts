// SOURCING: none. The order of a delivery's steps; every effect is a dependency, so the order is tested without a phone (deliver.test.ts).
//
// One delivery, driven as far as it will go. Each step is saved before the
// next begins, so a phone that stops anywhere resumes from what was confirmed:
// - an upload repeats under the same idempotency key (`<delivery>:<item>`);
// - the message is the conversation command `<delivery>`, journaled by the
//   SDK, so a lost answer is reconciled instead of sent twice;
// - a delivery found in `sending` first looks for its message in the thread,
//   and sends only if it is not there.
import { afterSend, files, isSettled, messageText, type Delivery, type FileItem, type Stage } from './model'

export type SendAnswer = {
  record?: { messageId?: string; parts?: { type: string; payload?: unknown }[] }
  run?: { runId?: string }
}

export type DeliverDeps = {
  now(): number
  /** Persists the record and tells whoever is watching. Resolves after it is durable. */
  save(delivery: Delivery): Promise<void>
  /** Stores one file with Theorem. `key` is stable for this file of this delivery. */
  upload(delivery: Delivery, file: FileItem, key: string): Promise<{ uploadId: string }>
  /** Admits the message as command `delivery.id`. */
  send(delivery: Delivery, text: string, uploadIds: string[]): Promise<SendAnswer | undefined>
  /** The thread's stored message for this delivery, if Theorem already has it. */
  findStored(delivery: Delivery, text: string, uploadIds: string[]): Promise<SendAnswer | undefined>
  /** Theorem answered no, and the same request cannot become a yes. */
  isRefusal(error: unknown): boolean
  describe(error: unknown): string
}

export async function deliver(start: Delivery, deps: DeliverDeps): Promise<Delivery> {
  if (isSettled(start) || start.stage === 'admitted') return start
  let delivery = start
  const put = async (patch: Partial<Delivery>) => {
    delivery = { ...delivery, ...patch, updatedAtMs: deps.now() }
    await deps.save(delivery)
  }
  const stop = async (error: unknown, at: Exclude<Stage, 'refused' | 'failed'>) => {
    await put({
      stage: deps.isRefusal(error) ? 'refused' : 'failed',
      stoppedAt: at,
      error: deps.describe(error),
    })
    return delivery
  }

  // A retry picks up where the failure left it.
  const from = delivery.stage === 'failed' ? (delivery.stoppedAt ?? 'queued') : delivery.stage
  const wasSending = from === 'sending'

  if (files(delivery).some((file) => !file.uploadId)) {
    await put({ stage: 'uploading', stoppedAt: undefined, error: undefined })
    for (const file of files(delivery)) {
      if (file.uploadId) continue
      try {
        const { uploadId } = await deps.upload(delivery, file, `${delivery.id}:${file.id}`)
        await put({
          items: delivery.items.map((item) => (item.id === file.id ? { ...file, uploadId } : item)),
        })
      } catch (error) {
        return stop(error, 'uploading')
      }
    }
  }
  const text = messageText(delivery)
  const uploadIds = files(delivery).map((file) => file.uploadId!)
  if (!wasSending) await put({ stage: 'uploaded', stoppedAt: undefined, error: undefined })

  try {
    let answer: SendAnswer | undefined
    // The app stopped after handing the message over: Theorem may already hold it.
    if (wasSending) answer = await deps.findStored(delivery, text, uploadIds)
    if (!answer) {
      await put({ stage: 'sending', stoppedAt: undefined, error: undefined })
      answer =
        (await deps.send(delivery, text, uploadIds)) ?? (await deps.findStored(delivery, text, uploadIds))
      // No answer and no stored message: nothing confirms the send, so it is not called accepted.
      if (!answer) throw new Error('Theorem did not confirm the message.')
    }
    delivery = afterSend(delivery, answer, deps.now())
    await deps.save(delivery)
    return delivery
  } catch (error) {
    return stop(error, 'sending')
  }
}
