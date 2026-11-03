// `@tauri-apps/api/event` over the browser host's named-event bus.
import { currentHost } from './host'

export type UnlistenFn = () => void
export type EventCallback<T> = (event: { event: string; id: number; payload: T }) => void

let nextId = 1

export async function listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  return currentHost().listen(event, (payload) => handler({ event, id: nextId++, payload: payload as T }))
}

export async function once<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  const off = await listen<T>(event, (e) => {
    off()
    handler(e)
  })
  return off
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  currentHost().emitTo(event, payload)
}

export async function emitTo(_target: unknown, event: string, payload?: unknown): Promise<void> {
  currentHost().emitTo(event, payload)
}
