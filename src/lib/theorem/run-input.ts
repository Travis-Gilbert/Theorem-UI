/** Native run input keeps its own identity until delivery is confirmed. */
export type InputReceipt = {
  inputId: string
  text: string
  status: 'queued' | 'delivered' | 'not_delivered'
  reason?: string
  requestKey?: string
}

export function inputReceipt(value: unknown): InputReceipt | undefined {
  if (!value || typeof value !== 'object') return
  const part = value as Record<string, unknown>
  if (
    typeof part.inputId !== 'string' || typeof part.text !== 'string' ||
    !['queued', 'delivered', 'not_delivered'].includes(String(part.status))
  ) return
  return {
    inputId: part.inputId,
    text: part.text,
    status: part.status as InputReceipt['status'],
    ...(typeof part.reason === 'string' ? { reason: part.reason } : {}),
  }
}

/** Command identity belongs to the event envelope, not the user-authored text. */
export function runInputReceipt(event: { payload: Record<string, unknown>; idempotencyKey?: unknown }): InputReceipt | undefined {
  const part = event.payload.part
  if (!part || typeof part !== 'object' || !('type' in part) || part.type !== 'user_input') return
  const receipt = inputReceipt(part)
  if (!receipt) return
  const key = event.idempotencyKey
  return typeof key === 'string' && key.startsWith('chat-command:')
    ? { ...receipt, requestKey: key.slice('chat-command:'.length) }
    : receipt
}

export type PendingRunInput = {
  id: string
  text: string
  runId?: string
  inputId?: string
  state: 'waiting' | 'sending' | 'queued' | 'next' | 'failed'
  error?: string
  retryAsTurn?: boolean
  visible?: boolean
  notDelivered?: boolean
  stopped?: boolean
}

type RunInputSnapshot = {
  threadId?: string
  runId?: string
  isRunning: boolean
  isLoading: boolean
  inputs: readonly InputReceipt[]
}

export type RunInputHost = {
  snapshot: () => RunInputSnapshot
  refresh: () => Promise<{
    active: boolean
    runId?: string
    inputs: readonly InputReceipt[]
  }>
  send: (runId: string, text: string, key: string) => Promise<InputReceipt>
  receipts: (runId: string) => Promise<readonly InputReceipt[]>
  append: (text: string) => void
  changed: (items: readonly PendingRunInput[]) => void
  describeError: (error: unknown) => string
  /**
   * The local chat this queue was opened for. Input accepted before a durable
   * thread id exists stays with this attempt; a different chat can show it,
   * but only an explicit retry sends it there.
   */
  attemptId?: string
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
}

const storageKey = (threadId: string) => `theorem.run-input.${threadId}`
/**
 * Input accepted while a new chat is still being created. The record names
 * that chat. The same chat moves it to `storageKey` when its thread id
 * arrives; a later chat keeps the text for an explicit retry.
 */
const PENDING_KEY = 'theorem.run-input.pending:'
const TEMPORARY = 'temporary'
const recoveredElsewhere = 'This message was kept from a chat that was still being created. Retry sends it with the next response.'
const unknownDelivery = 'Could not confirm delivery. Retry checks this same message.'
const stoppedMessage = 'The response stopped before this message was delivered.'

function restoreItems(saved: string): PendingRunInput[] {
  let parsed: unknown
  try { parsed = JSON.parse(saved) } catch { return [] }
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.flatMap((row): PendingRunInput[] => {
    if (!row || typeof row !== 'object' || typeof row.text !== 'string' || !row.text.trim()) return []
    const id = typeof row.id === 'string' && row.id ? row.id : undefined
    const runId = typeof row.runId === 'string' && row.runId ? row.runId : undefined
    const validState = ['waiting', 'queued', 'next', 'failed'].includes(row.state)
    const missingIdentity = !id || (!runId && row.state !== 'waiting' && row.retryAsTurn !== true)
    return [{
      id: id ?? crypto.randomUUID(),
      text: row.text,
      ...(runId ? { runId } : {}),
      ...(typeof row.inputId === 'string' ? { inputId: row.inputId } : {}),
      state: !missingIdentity && validState ? row.state as PendingRunInput['state'] : 'failed',
      ...(typeof row.error === 'string' ? { error: row.error } : {}),
      ...(!validState ? { error: unknownDelivery } : {}),
      ...(missingIdentity ? { error: 'Recovered text has incomplete delivery identity. Check the conversation before retrying.', retryAsTurn: true } : {}),
      ...(row.retryAsTurn === true ? { retryAsTurn: true } : {}),
      ...(row.notDelivered === true ? { notDelivered: true } : {}),
      ...(row.stopped === true ? { stopped: true } : {}),
      visible: false,
    }]
  })
}

function errorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('body' in error)) return
  const body = error.body
  return body && typeof body === 'object' && 'code' in body ? body.code : undefined
}

/**
 * An inbox beside the active stream, never a second assistant-ui run. A refusal
 * or a not-delivered receipt may become the next turn only after both the local
 * observer and Theorem's authoritative thread have settled. An unknown outcome
 * keeps its original run, key and text for an explicit idempotent retry.
 */
export function createRunInputQueue(host: RunInputHost) {
  let items: readonly PendingRunInput[] = []
  let restoredFor: string | undefined
  /** The thread id once this queue has seen it, so a brief gap still has a slot. */
  let durableId: string | undefined
  let refreshing = false
  let disposed = false
  const inFlight = new Set<string>()
  const attemptId = host.attemptId ?? crypto.randomUUID()
  const activeId = () => {
    const threadId = host.snapshot().threadId
    if (threadId) durableId = threadId
    return durableId
  }
  const merge = (saved: string | null, current: readonly PendingRunInput[]) => {
    const restored = saved ? restoreItems(saved) : []
    return [
      ...restored.filter((item) => !current.some((existing) => existing.id === item.id)),
      ...current,
    ]
  }

  const readPending = (): { attemptId?: string; items: PendingRunInput[] } | undefined => {
    const raw = host.storage?.getItem(PENDING_KEY)
    if (!raw) return
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return }
    // A record with no attempt belongs to a chat we can no longer identify.
    if (Array.isArray(parsed)) return { items: restoreItems(raw) }
    if (!parsed || typeof parsed !== 'object' || !('items' in parsed)) return
    const record = parsed as { attemptId?: unknown; items?: unknown }
    return {
      ...(typeof record.attemptId === 'string' ? { attemptId: record.attemptId } : {}),
      items: restoreItems(JSON.stringify(record.items ?? [])),
    }
  }
  const keptForRetry = (item: PendingRunInput): PendingRunInput => ({
    ...item,
    state: 'failed',
    retryAsTurn: true,
    error: recoveredElsewhere,
    runId: undefined,
    stopped: false,
  })
  const publish = (next: readonly PendingRunInput[]) => {
    if (disposed) return
    const threadId = activeId()
    if (host.storage) {
      if (threadId) {
        if (next.length) host.storage.setItem(storageKey(threadId), JSON.stringify(next))
        else host.storage.removeItem(storageKey(threadId))
        // The temporary copy has moved; a later new chat must not adopt it too.
        if (restoredFor === TEMPORARY) host.storage.removeItem(PENDING_KEY)
      } else if (next.length) {
        host.storage.setItem(PENDING_KEY, JSON.stringify({ attemptId, items: next }))
      } else host.storage.removeItem(PENDING_KEY)
    }
    restoredFor = threadId ?? TEMPORARY
    items = next
    if (!disposed) host.changed(items)
  }
  const update = (id: string, patch: Partial<PendingRunInput>) =>
    publish(items.map((item) => item.id === id ? { ...item, ...patch } : item))

  const restore = () => {
    const threadId = activeId()
    const identity = threadId ?? TEMPORARY
    if (restoredFor === identity) return
    if (!threadId) {
      const pending = readPending()
      if (!pending?.items.length) {
        restoredFor = TEMPORARY
        if (items.length) publish(items)
        return
      }
      const restored = pending.attemptId === attemptId ? pending.items : pending.items.map(keptForRetry)
      publish([
        ...restored.filter((item) => !items.some((existing) => existing.id === item.id)),
        ...items,
      ])
      return
    }
    const saved = host.storage?.getItem(storageKey(threadId)) ?? null
    if (!saved && items.length === 0) {
      if (restoredFor === TEMPORARY) host.storage?.removeItem(PENDING_KEY)
      restoredFor = threadId
      return
    }
    publish(merge(saved, items))
  }

  const reconcile = (receipts: readonly InputReceipt[], visible = false) => {
    let changed = false
    const next = items.flatMap((item): PendingRunInput[] => {
      const receipt = receipts.find((part) => part.inputId === item.inputId || part.requestKey === item.id)
      if (!receipt) {
        if (visible && item.visible) { changed = true; return [{ ...item, visible: false }] }
        return [item]
      }
      if (receipt.status === 'delivered') {
        changed = true
        return []
      }
      if (receipt.status === 'not_delivered') {
        const retryRequested = item.state === 'next' && item.retryAsTurn && !item.stopped
        const cancelled = !retryRequested && (receipt.reason === 'run_cancelled' || item.stopped)
        // A person's Stop must not immediately launch another response.
        if (item.notDelivered && item.inputId === receipt.inputId &&
          item.state === (cancelled ? 'failed' : 'next') && (!visible || item.visible)) return [item]
        changed = true
        return [{
          ...item,
          inputId: receipt.inputId,
          state: cancelled ? 'failed' : 'next',
          retryAsTurn: cancelled || retryRequested,
          error: cancelled ? stoppedMessage : undefined,
          visible: visible || item.visible,
          notDelivered: true,
        }]
      }
      if ((visible && !item.visible) || item.inputId !== receipt.inputId || (item.state === 'next' && !item.notDelivered)) {
        changed = true
        return [{ ...item, inputId: receipt.inputId, visible: visible || item.visible, state: item.state === 'next' && !item.notDelivered ? 'queued' : item.state }]
      }
      return [item]
    })
    if (changed) publish(next)
  }

  const send = async (item: PendingRunInput, runId: string) => {
    if (inFlight.has(item.id) || disposed) return
    inFlight.add(item.id)
    // Persist the exact target and key before crossing the network boundary.
    update(item.id, { runId, state: 'sending', error: undefined })
    try {
      const receipt = await host.send(runId, item.text, item.id)
      if (disposed) return
      update(item.id, { inputId: receipt.inputId, state: 'queued' })
      reconcile([receipt])
      reconcile(host.snapshot().inputs, true)
    } catch (error) {
      if (disposed) return
      update(item.id, errorCode(error) === 'run_input_closed'
        ? items.find((current) => current.id === item.id)?.stopped
          ? { state: 'failed', error: stoppedMessage, retryAsTurn: true }
          : { state: 'next', error: undefined }
        : { state: 'failed', error: `${host.describeError(error)} ${unknownDelivery}` })
    } finally {
      inFlight.delete(item.id)
      observe()
    }
  }

  const refresh = async () => {
    if (refreshing || disposed || !host.snapshot().threadId) return
    refreshing = true
    try {
      const snapshot = await host.refresh()
      if (disposed) return
      reconcile(snapshot.inputs)
      if (snapshot.active) {
        if (snapshot.runId) {
          for (const item of items) {
            if (item.state === 'waiting') void send(item, snapshot.runId)
          }
        }
        return
      }
      if (host.snapshot().isRunning || host.snapshot().isLoading) return
      // A response can finish between accepting input and draining it. Consult
      // its durable receipts; absence of a delivered event is not a refusal.
      const runs = new Set(items.filter((item) => item.runId && (item.state === 'queued' || item.state === 'next')).map((item) => item.runId!))
      for (const runId of runs) {
        const receipts = await host.receipts(runId)
        if (disposed) return
        reconcile(receipts)
      }
      if (disposed || host.snapshot().isRunning || host.snapshot().isLoading) return
      const next = items.filter((item) => item.state === 'next' || item.state === 'waiting')
      if (!next.length) return
      const ids = new Set(next.map((item) => item.id))
      // append owns normal history, context, send recovery and model settings.
      // Remove only after it accepts the local message into that same runtime.
      host.append(next.map((item) => item.text).join('\n\n'))
      publish(items.filter((item) => !ids.has(item.id)))
    } catch {
      // A failed read cannot establish that it is safe to start a new turn.
    } finally {
      refreshing = false
    }
  }

  function observe() {
    if (disposed) return
    restore()
    const snapshot = host.snapshot()
    reconcile(snapshot.inputs, true)
    for (const item of items) {
      if (item.state === 'waiting' && snapshot.runId) void send(item, snapshot.runId)
    }
    if (items.some((item) => item.state === 'next' || item.state === 'queued' || item.state === 'waiting'))
      void refresh()
  }

  function stop() {
    if (disposed || items.every((item) => item.stopped)) return
    publish(items.map((item) => ({
      ...item,
      stopped: true,
      ...(item.state === 'waiting' || item.state === 'next'
        ? { state: 'failed' as const, error: stoppedMessage, retryAsTurn: true }
        : {}),
    })))
  }

  return {
    observe,
    stop,
    getSnapshot: () => items,
    submit(text: string) {
      if (disposed || !text.trim()) return false
      restore()
      publish([...items, { id: crypto.randomUUID(), text, state: 'waiting' }])
      observe()
      return true
    },
    retry(id: string) {
      const item = items.find((candidate) => candidate.id === id)
      if (!item || item.state !== 'failed' || disposed) return
      if (item.retryAsTurn) {
        const snapshot = host.snapshot()
        // A fresh chat has no thread for refresh to settle. append starts one.
        if (!snapshot.threadId && !durableId && !snapshot.isRunning && !snapshot.isLoading) {
          host.append(item.text)
          if (!disposed) publish(items.filter((current) => current.id !== id))
          return
        }
        update(id, { state: 'next', error: undefined, stopped: false })
        observe()
      } else if (item.runId) {
        void send(item, item.runId)
      }
    },
    dispose() { disposed = true },
  }
}

export type RunInputQueue = ReturnType<typeof createRunInputQueue>
