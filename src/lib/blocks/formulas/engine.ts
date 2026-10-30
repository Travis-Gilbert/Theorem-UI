// SOURCING: quickjs-emscripten-core with the @jitl/quickjs-wasmfile-release-sync
// variant (QuickJS compiled to WebAssembly: formulas and query expressions run
// in their own interpreter, with a deadline, a memory limit and nothing of the
// page's in reach; plan D9), sucrase (strips runner.ts's types once) and
// Vite's `?raw` import (the runner's source).
import { shouldInterruptAfterDeadline } from 'quickjs-emscripten-core'
import type { QuickJSWASMModule } from 'quickjs-emscripten-core'
import { transform } from 'sucrase'
import runnerSource from './runner.ts?raw'
import type { FormulaOutput, FormulaTask } from './runner'

/** Evaluates formulas and filters; the page's handle on the QuickJS worker. */
export type FormulaEngine = <TTask extends FormulaTask>(
  task: TTask,
) => Promise<FormulaOutput<TTask>>

/** How long one task may run before QuickJS interrupts it. */
export const FORMULA_DEADLINE_MS = 2000
const MEMORY_LIMIT = 64 * 1024 * 1024
const STACK_LIMIT = 1024 * 1024

let runner: string | null = null

/** The runner as a script that leaves its `run` function as the result. */
function runnerScript(): string {
  runner ??= transform(runnerSource, {
    transforms: ['typescript', 'imports'],
    disableESTransforms: true,
  }).code
  return `(function () { var exports = {}; ${runner}\n; return exports.run; })()`
}

/** Runs one task in a fresh QuickJS context, so no task sees another's globals. */
export function runFormulaTask<TTask extends FormulaTask>(
  quickjs: QuickJSWASMModule,
  task: TTask,
): FormulaOutput<TTask> {
  const runtime = quickjs.newRuntime({
    memoryLimitBytes: MEMORY_LIMIT,
    maxStackSizeBytes: STACK_LIMIT,
    interruptHandler: shouldInterruptAfterDeadline(
      Date.now() + FORMULA_DEADLINE_MS,
    ),
  })
  const context = runtime.newContext()
  try {
    const run = context.unwrapResult(context.evalCode(runnerScript()))
    const input = context.newString(JSON.stringify(task))
    const result = context.callFunction(run, context.undefined, input)
    run.dispose()
    input.dispose()
    if (result.error) {
      const error = context.dump(result.error) as { message?: string } | null
      result.error.dispose()
      // An interrupt cannot be caught inside QuickJS, so it ends the task.
      throw new Error(
        error?.message === 'interrupted'
          ? `Formulas ran longer than ${FORMULA_DEADLINE_MS / 1000} seconds and were stopped`
          : `Formulas failed: ${error?.message ?? String(error)}`,
      )
    }
    const json = context.getString(result.value)
    result.value.dispose()
    return JSON.parse(json) as FormulaOutput<TTask>
  } finally {
    // Disposing the context frees every handle still alive in it.
    context.dispose()
    runtime.dispose()
  }
}

/** An engine that runs tasks on this thread: the worker, and tests. */
export const engineOver =
  (quickjs: QuickJSWASMModule): FormulaEngine =>
  (task) =>
    Promise.resolve().then(() => runFormulaTask(quickjs, task))
