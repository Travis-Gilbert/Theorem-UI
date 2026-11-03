// Run by no-tauri.test.ts in a bun process of its own, so its module graph starts with no host
// installed: no other test can have installed one first. It plants a Tauri global before the
// frontend's IPC modules load, reports what they answer with no host, then installs a host with
// the global still planted and reports again. It prints one JSON line and asserts nothing; the
// test asserts.
import '../happy-dom'

type Outcome = { kind: 'resolved'; value: unknown } | { kind: 'rejected'; message: string } | { kind: 'threw'; message: string }

const message = (e: unknown) => String((e as { message?: unknown })?.message ?? e)

/** How a call ended: a resolved or rejected promise, or a synchronous throw. */
function attempt(run: () => unknown): Promise<Outcome> {
  try {
    return Promise.resolve(run()).then(
      (value) => ({ kind: 'resolved', value }),
      (e) => ({ kind: 'rejected', message: message(e) }),
    )
  } catch (e) {
    return Promise.resolve({ kind: 'threw', message: message(e) })
  }
}

const planted: string[] = []
;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke: (command: string) => (planted.push(command), Promise.resolve('answered by the planted global')),
}

const core = await import('@tauri-apps/api/core')
const ipc = await import('@/platform/ipc')
const hostModule = await import('../../src/host/host')
const { BrowserHostImpl } = await import('../../src/host/browser-host')

const observe = async () => ({
  hostAvailable: hostModule.hostAvailable(),
  ipcIsTauri: ipc.isTauri(),
  coreIsTauri: core.isTauri(),
  invoke: await attempt(() => core.invoke('app_info')),
  planted: [...planted],
})

const withoutHost = await observe()

const served: string[] = []
const host = new BrowserHostImpl({
  description: 'no-host probe host',
  commands: new Map([['app_info', () => (served.push('app_info'), { name: 'ide-cm' })]]),
  pick: async () => null,
  save: async () => null,
})
hostModule.installHost(host)
const withHost = {
  ...(await observe()),
  served: [...served],
  refusedCommand: await attempt(() => core.invoke('plugin:window|minimize')),
  refusedCount: host.refused.get('plugin:window|minimize')?.count ?? 0,
  globalStillPlanted: '__TAURI_INTERNALS__' in window,
}

console.log(JSON.stringify({ withoutHost, withHost }))
