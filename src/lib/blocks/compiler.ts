// SOURCING: a module Web Worker (Vite bundles `new Worker(new URL(…))`) so
// Sucrase and notebook-kit never hold up typing, and the local server's
// content-addressed compile store (docs/desktop/workspace-routes.md), so a
// source compiled once is never compiled again.
import type { WorkspaceId } from '@/lib/workspace/types'
import { CompileError, compileKey } from './compile'
import type { CompileResult, CompiledCell, WorkerMethods } from './compile'
import { call, rpcOver } from './sandbox/protocol'

export type Compiler = (source: string) => Promise<CompiledCell>

const unwrap = (result: CompileResult): CompiledCell => {
  if (result.ok) return result.cell
  throw new CompileError(result.error.message, result.error.line)
}

let worker: Promise<Compiler> | null = null

/** Compiles in a shared module worker. */
export function compileInWorker(): Promise<Compiler> {
  worker ??= Promise.resolve().then(() => {
    const rpc = rpcOver(
      new Worker(new URL('./compile.worker.ts', import.meta.url), {
        type: 'module',
        name: 'theorem-block-compiler',
      }),
    )
    return async (source: string) =>
      unwrap(await call<WorkerMethods, 'compile'>(rpc, 'compile', { source }))
  })
  return worker
}

/**
 * A compiler that asks the workspace's compile store first and saves what it
 * compiles there, where the block listener serves it from.
 */
export function cachedCompiler(id: WorkspaceId, compile: Compiler): Compiler {
  const base = `/desktop/workspace/${encodeURIComponent(id)}/compiled`
  return async (source) => {
    const key = await compileKey(source)
    const cached = await fetch(`${base}?key=${key}`)
    if (cached.ok) return (await cached.json()) as CompiledCell
    const cell = await compile(source)
    const saved = await fetch(`${base}?key=${key}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cell),
    })
    if (!saved.ok)
      throw new Error(`Saving the compiled block answered ${saved.status}`)
    return cell
  }
}
