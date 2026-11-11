// SOURCING: a module Web Worker (Vite bundles `new Worker(new URL(…))`), so
// the checker and its declarations load only when an App with TypeScript
// source is first checked, and a check never holds up the page.
import type { CheckResult, CheckWorkerMethods } from './app-check'
import type { AppSources } from './app-source'
import { call, rpcOver } from './sandbox/protocol'
import type { Rpc } from './sandbox/protocol'

export type AppChecker = (sources: AppSources) => Promise<CheckResult>

let worker: Rpc | undefined
/** The one check the worker runs at a time; the compiler is single-threaded. */
let running: Promise<unknown> = Promise.resolve()

/**
 * Checks an App's files in the one checker worker every App on the page
 * shares. Checks run one after another.
 */
export const checkInWorker: AppChecker = (sources) => {
  worker ??= rpcOver(
    new Worker(new URL('./app-check.worker.ts', import.meta.url), {
      type: 'module',
      name: 'theorem-app-checker',
    }),
  )
  const rpc = worker
  const check = running.then(async () => {
    const outcome = await call<CheckWorkerMethods, 'check'>(rpc, 'check', {
      sources,
    })
    if (!outcome.ok) throw new Error(outcome.message)
    return outcome.result
  })
  running = check.catch(() => {})
  return check
}
