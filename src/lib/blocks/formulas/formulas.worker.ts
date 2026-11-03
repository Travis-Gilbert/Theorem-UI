// SOURCING: quickjs-emscripten-core's newVariant, pointed at the wasm file
// Vite emits (`?url`), and json-rpc-2.0 over the worker's port (protocol.ts).
// Formulas run here, off the page's thread, as plan D9 asks.
import releaseSync from '@jitl/quickjs-wasmfile-release-sync'
import wasmLocation from '@jitl/quickjs-wasmfile-release-sync/wasm?url'
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
} from 'quickjs-emscripten-core'
import { rpcOver, serve } from '../sandbox/protocol'
import { runFormulaTask } from './engine'
import type { FormulaWorkerMethods } from './worker-client'

const quickjs = newQuickJSWASMModuleFromVariant(
  newVariant(releaseSync, { wasmLocation }),
)

serve<FormulaWorkerMethods, 'formulas.run'>(
  rpcOver(self),
  'formulas.run',
  async ({ task }) => runFormulaTask(await quickjs, task),
)
