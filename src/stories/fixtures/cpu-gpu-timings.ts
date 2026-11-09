// SOURCING: none — committed fixtures: the measured CPU vs GPU notebook as the
// marimo form an agent would send. The notebook's source is the .py beside
// this file; the recorded outputs are a real run of it on a machine with no
// CUDA device, made by scripts/marimo-retained-outputs.ts.
import { RetainedOutputs } from '@/lib/notebooks/forms'
import type { MarimoNotebook } from '@/lib/notebooks/forms'
import cpuRun from './cpu-gpu-timings.cpu-run.json?raw'
import source from './cpu-gpu-timings.py?raw'

/** The notebook as committed: it needs a CUDA GPU host and has never run on one. */
export const cpuGpuTimingsAwaitingGpu: MarimoNotebook = {
  form: 'marimo',
  title: 'Measured: CPU and GPU matrix multiply',
  source,
  runtime: 'native',
  needs: { gpu: true, packages: ['torch', 'numpy', 'matplotlib'] },
}

/** The same notebook with the outputs of a CPU-only run: no GPU figure in it is measured. */
export const cpuGpuTimingsCpuOnly: MarimoNotebook = {
  ...cpuGpuTimingsAwaitingGpu,
  title: 'Measured: CPU and GPU matrix multiply (CPU-only run)',
  outputs: RetainedOutputs.parse(JSON.parse(cpuRun)),
}
