import { createHash } from 'node:crypto'
import { expect, test } from 'bun:test'
import { toCell, transpile } from '@observablehq/notebook-kit'
import { marimoStatus } from '@/components/artifacts/notebook-artifact'
import { parseNotebookForm } from '@/lib/notebooks/forms'
import { cpuGpuModel } from './cpu-gpu-model'
import { cpuGpuTimingsAwaitingGpu, cpuGpuTimingsCpuOnly } from './cpu-gpu-timings'
import { cpuGpuTradeoff } from './cpu-gpu-tradeoff'
import { NOTEBOOK_DOCUMENTS, notebookPart } from './notebook-parts'

/** A run's revision: `sha256:` and the hex SHA-256 of the source, as Theorem computes it. */
const revisionOf = (source: string) =>
  `sha256:${createHash('sha256').update(source).digest('hex')}`

const outputsText = () =>
  cpuGpuTimingsCpuOnly.outputs!.cells
    .flatMap((cell) => cell.outputs.map((output) => String(output.data)))
    .join('\n')

test('the tradeoff notebook is a valid Observable form whose every cell compiles', () => {
  expect(parseNotebookForm(cpuGpuTradeoff)?.form).toBe('observable')
  for (const [index, cell] of cpuGpuTradeoff.cells.entries())
    expect(() =>
      transpile(toCell({ id: index, value: cell.source, mode: cell.kind }), {
        resolveImport: (specifier: string) => specifier,
      }),
    ).not.toThrow()
})

test('the tradeoff notebook says it is illustrative, lists its assumptions and draws only with theme colours', () => {
  const sources = cpuGpuTradeoff.cells.map((cell) => cell.source).join('\n')
  expect(cpuGpuTradeoff.cells[0]!.source).toContain('Illustrative model')
  expect(cpuGpuTradeoff.cells.some((cell) => cell.id === 'assumptions')).toBe(true)
  expect(sources).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
  // Colour belongs to the two subjects; everything else is ink.
  expect(sources).toContain('theme.series[i]')
  expect(sources).not.toMatch(/theme\.series\[[2-9]\]/)
})

test('the measured notebook as committed is awaiting a GPU host, with no outputs', () => {
  expect(parseNotebookForm(cpuGpuTimingsAwaitingGpu)?.form).toBe('marimo')
  expect(cpuGpuTimingsAwaitingGpu.outputs).toBeUndefined()
  expect(marimoStatus(cpuGpuTimingsAwaitingGpu, { connected: false })).toContain(
    'Awaiting a GPU host',
  )
})

test('the measured notebook times one operation with warm-up, CUDA events and synchronization', () => {
  const source = cpuGpuTimingsAwaitingGpu.source
  expect(source).toContain('torch.cuda.Event(enable_timing=True)')
  expect(source).toContain('torch.cuda.synchronize()')
  expect(source).toContain('WARMUP')
  expect(source).toContain('allow_tf32 = False')
  expect(source).toContain('mo.ui.run_button(label="Run experiment")')
})

test('the CPU-only run is labelled as such, belongs to this notebook text, and measures no GPU figure', () => {
  const run = cpuGpuTimingsCpuOnly.outputs!
  expect(run.revision).toBe(revisionOf(cpuGpuTimingsCpuOnly.source))
  expect(run.execution.device).toContain('no CUDA')
  expect(cpuGpuTimingsCpuOnly.title).toContain('CPU-only run')
  expect(marimoStatus(cpuGpuTimingsCpuOnly, { connected: false })).toContain(
    'needs a GPU host',
  )
  const text = outputsText()
  expect(text).toContain('not measured: no CUDA device')
  expect(text).toContain('data-entity-id="cpu-1024"')
  expect(text).not.toMatch(/data-entity-id="gpu/)
  expect(text).not.toMatch(/GPU (yes|\*\*no\*\*)/)
})

test('the Python model runs in the browser, says it measures nothing, and uses the D3 view assumptions', () => {
  expect(parseNotebookForm(cpuGpuModel)?.form).toBe('marimo')
  expect(cpuGpuModel.runtime).toBe('pyodide')
  expect(cpuGpuModel.needs?.gpu).toBeFalsy()
  const source = cpuGpuModel.source
  expect(source).toContain('Illustrative model')
  expect(source).not.toMatch(/import torch|cuda/i)
  const { cpu, gpu, link, bytesPerItem } = cpuGpuTradeoff.data!.assumptions as {
    cpu: Record<string, number>
    gpu: Record<string, number>
    link: { GBps: number }
    bytesPerItem: number
  }
  for (const value of [...Object.values(cpu), ...Object.values(gpu), link.GBps, bytesPerItem])
    expect(source).toContain(String(value))
  const run = cpuGpuModel.outputs!
  expect(run.revision).toBe(revisionOf(source))
  // A browser notebook's recorded outputs need no apology: it can run here.
  expect(marimoStatus(cpuGpuModel, { connected: false })).not.toContain('needs')
  expect(marimoStatus(cpuGpuModel, { running: true })).toContain('Pyodide')
  const text = run.cells.flatMap((cell) => cell.outputs.map((output) => String(output.data))).join('\n')
  expect(text).toContain('data-entity-id="crossover"')
  expect(text).not.toMatch(/#[0-9a-f]{6}\b/i)
})

test('each notebook story is a stored part whose revision is its own source, with no outputs carried', () => {
  for (const [id, { notebook, sourceRevision, runs }] of Object.entries(NOTEBOOK_DOCUMENTS)) {
    const { payload, artifactKind, rendererId } = notebookPart(id, notebook, { sourceRevision })
    expect(artifactKind).toBe(notebook.form)
    expect(rendererId).toBe(`theorem-${notebook.form}`)
    expect(payload.formVersion).toBe(1)
    expect('outputs' in payload).toBe(false)
    if (notebook.form !== 'marimo') continue
    const revision = revisionOf(notebook.source)
    expect(sourceRevision).toBe(revision)
    for (const run of runs) expect(run.revision).toBe(revision)
  }
})
