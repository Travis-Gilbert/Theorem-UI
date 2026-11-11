import { create } from 'zustand'
import type { PendingRunInput, RunInputQueue } from './run-input'

const queues = new Map<string, RunInputQueue>()
export const useRunInputs = create<Partial<Record<string, readonly PendingRunInput[]>>>(() => ({}))

/** assistant-ui's local thread identity exists before its durable id does. */
export function registerRunInputQueue(threadKey: string, queue: RunInputQueue) {
  queues.set(threadKey, queue)
  useRunInputs.setState({ [threadKey]: queue.getSnapshot() })
  return () => {
    if (queues.get(threadKey) !== queue) return
    queues.delete(threadKey)
    useRunInputs.setState({ [threadKey]: undefined })
    queue.dispose()
  }
}

export const submitRunInput = (threadKey: string, text: string) =>
  queues.get(threadKey)?.submit(text) ?? false

export const retryRunInput = (threadKey: string, id: string) =>
  queues.get(threadKey)?.retry(id)

export const stopRunInputs = (threadKey: string) => queues.get(threadKey)?.stop()
