import { expect, test } from 'bun:test'
import { needsNativeHost, parseNotebookForm } from './forms'
import type { MarimoNotebook } from './forms'

test('an Observable notebook parses with its cells and data', () => {
  const form = parseNotebookForm({
    form: 'observable',
    title: 'Scale',
    cells: [
      { id: 'a', kind: 'md', source: '# Hi' },
      { id: 'b', kind: 'js', source: '1 + 1' },
    ],
    data: { n: 3 },
  })
  expect(form?.form).toBe('observable')
  expect(form?.form === 'observable' && form.cells.map((c) => c.kind)).toEqual(['md', 'js'])
})

test('a marimo notebook parses with its needs and recorded outputs', () => {
  const form = parseNotebookForm({
    form: 'marimo',
    title: 'GPU timings',
    source: 'import marimo',
    runtime: 'native',
    needs: { gpu: true, packages: ['torch'] },
    outputs: {
      revision: 'r1',
      inputs: {},
      cells: [{ id: 'Hbol', outputs: [{ mime: 'text/plain', data: '1' }] }],
      execution: { host: 'gpu-host', device: 'NVIDIA L4', startedAtMs: 0, finishedAtMs: 1 },
    },
  })
  expect(form?.form).toBe('marimo')
  expect(form?.form === 'marimo' && form.outputs?.execution.device).toBe('NVIDIA L4')
})

test('a stored marimo part names where its outputs are instead of carrying them', () => {
  const form = parseNotebookForm({
    form: 'marimo',
    title: 'GPU timings',
    source: 'import marimo',
    runtime: 'native',
    formVersion: 1,
    retainedOutputs: {
      sourceRevision: 'sha256:ab',
      href: '/api/artifacts/v1/documents/d1/outputs?revision=sha256:ab',
    },
  })
  expect(form?.form === 'marimo' && form.retainedOutputs?.href).toContain('/outputs?revision=')
  expect(form?.form === 'marimo' && form.outputs).toBeUndefined()
})

test('a form version newer than this build reads is not read as this one', () => {
  const observable = { form: 'observable', title: 'x', cells: [] }
  expect(parseNotebookForm({ ...observable, formVersion: 1 })?.form).toBe('observable')
  expect(parseNotebookForm({ ...observable, formVersion: 2 })).toBeUndefined()
})

test('a value that is not a notebook form parses to nothing', () => {
  expect(parseNotebookForm({ form: 'observable', title: 'x' })).toBeUndefined()
  expect(parseNotebookForm({ form: 'marimo', title: 'x', source: '', runtime: 'cuda' })).toBeUndefined()
  expect(parseNotebookForm('<html>')).toBeUndefined()
})

test('a notebook that needs a GPU or says native needs a native host', () => {
  const base: MarimoNotebook = { form: 'marimo', title: 't', source: '', runtime: 'pyodide' }
  expect(needsNativeHost(base)).toBe(false)
  expect(needsNativeHost({ ...base, needs: { gpu: true } })).toBe(true)
  expect(needsNativeHost({ ...base, runtime: 'native' })).toBe(true)
})
