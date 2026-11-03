// The formula engine on the test's own thread: the same QuickJS build and
// runner the worker uses, without the worker.
import releaseSync from '@jitl/quickjs-wasmfile-release-sync'
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core'
import { engineOver } from '@/lib/blocks/formulas/engine'
import type { FormulaEngine } from '@/lib/blocks/formulas/engine'

let engine: Promise<FormulaEngine> | null = null

export function testFormulaEngine(): Promise<FormulaEngine> {
  engine ??= newQuickJSWASMModuleFromVariant(releaseSync).then(engineOver)
  return engine
}
