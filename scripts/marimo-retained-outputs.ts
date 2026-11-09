// Records a marimo notebook's outputs as the RetainedOutputs a marimo
// notebook artifact carries. marimo runs the notebook itself (`marimo export
// session --sandbox`, in the environment its PEP 723 header names) and writes
// a session snapshot in its documented, backwards-compatible schema
// (marimo/_schemas/session.py); this maps that snapshot to the wire shape and
// adds where and when it ran, which the snapshot does not record.
//
//   bun scripts/marimo-retained-outputs.ts <notebook.py> <out.json> \
//     --host "<processor, system>" --device "<device>" [-- <notebook args>]
//
// The host names the processor and system, never the machine's hostname.
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { RetainedOutputs } from '../src/lib/notebooks/forms'

const MARIMO = 'marimo@0.23.16'

type SessionOutput =
  | { type: 'data'; data: Record<string, unknown> }
  | { type: 'error'; ename: string; evalue: string; traceback: Array<string> }
type Session = { cells: Array<{ id: string; outputs: Array<SessionOutput> }> }

const split = process.argv.indexOf('--')
const notebookArgs = split === -1 ? [] : process.argv.slice(split + 1)
const { positionals, values } = parseArgs({
  args: process.argv.slice(2, split === -1 ? undefined : split),
  allowPositionals: true,
  options: { host: { type: 'string' }, device: { type: 'string' } },
})
const [notebook, out] = positionals
if (!notebook || !out || !values.host)
  throw new Error(
    'usage: marimo-retained-outputs.ts <notebook.py> <out.json> --host <host> [--device <device>] [-- args]',
  )

// The source is read once: the bytes that run are the bytes the revision
// names, whatever happens to the file meanwhile.
const source = await readFile(notebook)
// marimo writes the snapshot beside the notebook, so it runs on a copy.
const dir = await mkdtemp(path.join(tmpdir(), 'marimo-run-'))
const name = path.basename(notebook)
let session: Session
let startedAtMs: number
let finishedAtMs: number
try {
  await writeFile(path.join(dir, name), source)
  startedAtMs = Date.now()
  const run = Bun.spawnSync(
    ['uvx', MARIMO, 'export', 'session', '--sandbox', name, '--', ...notebookArgs],
    { cwd: dir, stdout: 'inherit', stderr: 'inherit' },
  )
  finishedAtMs = Date.now()
  if (run.exitCode !== 0) throw new Error(`marimo exited with ${run.exitCode}`)
  session = JSON.parse(
    await readFile(path.join(dir, '__marimo__', 'session', `${name}.json`), 'utf8'),
  ) as Session
} finally {
  await rm(dir, { recursive: true, force: true })
}

const retained = RetainedOutputs.parse({
  // The outputs belong to this text of the notebook and no other.
  revision: `sha256:${createHash('sha256').update(source).digest('hex')}`,
  inputs: { args: notebookArgs },
  cells: session.cells.map((cell) => ({
    id: cell.id,
    outputs: cell.outputs.map((output) =>
      output.type === 'error'
        ? {
            mime: 'application/vnd.marimo+error',
            data: { ename: output.ename, evalue: output.evalue, traceback: output.traceback },
          }
        : // A bundle names its preferred media type first, as marimo shows it.
          (([mime, data]) => ({ mime, data }))(Object.entries(output.data)[0] ?? ['text/plain', '']),
    ),
  })),
  execution: { host: values.host, device: values.device, startedAtMs, finishedAtMs },
})
await writeFile(out, `${JSON.stringify(retained, null, 2)}\n`)
console.log(`Recorded ${retained.cells.length} cells to ${out}`)
