// SOURCING: a module Web Worker (Vite bundles `new Worker(new URL(…))`) and
// json-rpc-2.0 over its port (protocol.ts): the page's side of the formula
// worker.
import { call, rpcOver } from '../sandbox/protocol'
import type { FormulaEngine } from './engine'
import type { FormulaOutput, FormulaTask } from './runner'

export interface FormulaWorkerMethods {
  'formulas.run': {
    params: { task: FormulaTask }
    result: FormulaOutput<FormulaTask>
  }
}

let engine: FormulaEngine | null = null

/** The formula engine in its shared worker, started on first use. */
export function formulaEngine(): FormulaEngine {
  if (!engine) {
    const rpc = rpcOver(
      new Worker(new URL('./formulas.worker.ts', import.meta.url), {
        type: 'module',
        name: 'theorem-formulas',
      }),
    )
    engine = (task) =>
      call<FormulaWorkerMethods, 'formulas.run'>(rpc, 'formulas.run', {
        task,
      }) as Promise<FormulaOutput<typeof task>>
  }
  return engine
}
