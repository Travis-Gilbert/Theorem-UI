// SOURCING: the check in app-check.ts, served to the page over json-rpc-2.0
// (protocol.ts) from a module Web Worker, with tsrs's browser build. tsrs
// makes a new compiler for each call and keeps only the compiled module.
import { tsc } from '@tsrs/wasm'
import wasm from '@tsrs/wasm/tsrs.wasm?url'
import { checkAppSources } from './app-check'
import type { CheckWorkerMethods } from './app-check'
import { checkLibrary } from './app-check-library'
import { rpcOver, serve } from './sandbox/protocol'

const rpc = rpcOver(self)
serve<CheckWorkerMethods, 'check'>(rpc, 'check', async ({ sources }) => {
  try {
    return {
      ok: true,
      result: await checkAppSources(sources, tsc, await checkLibrary(), {
        url: wasm,
      }),
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
})
