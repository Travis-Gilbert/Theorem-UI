// SOURCING: none — a committed fixture: the illustrative cost model as the
// marimo form an agent would send. The notebook's source is the .py beside
// this file; the recorded outputs are a real run of it, made by
// scripts/marimo-retained-outputs.ts.
import { RetainedOutputs } from '@/lib/notebooks/forms'
import type { MarimoNotebook } from '@/lib/notebooks/forms'
import run from './cpu-gpu-model.run.json?raw'
import source from './cpu-gpu-model.py?raw'

/**
 * The illustrative cost model as a browser marimo notebook: it needs nothing
 * Pyodide lacks, so it can run in the page. Its recorded outputs show at once
 * and stay in view while the runtime starts.
 */
export const cpuGpuModel: MarimoNotebook = {
  form: 'marimo',
  title: 'The cost model, in Python',
  source,
  runtime: 'pyodide',
  outputs: RetainedOutputs.parse(JSON.parse(run)),
}
