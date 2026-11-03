// SOURCING: the compile in compile.ts, served to the page over json-rpc-2.0
// (protocol.ts) from a module Web Worker.
import { compileResult } from './compile'
import type { WorkerMethods } from './compile'
import { rpcOver, serve } from './sandbox/protocol'

const rpc = rpcOver(self)
serve<WorkerMethods, 'compile'>(rpc, 'compile', ({ source }) =>
  compileResult(source),
)
