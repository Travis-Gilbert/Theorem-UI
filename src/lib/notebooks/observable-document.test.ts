import { afterEach, expect, test } from 'bun:test'
import type * as D3Array from 'd3-array'
import * as esbuild from 'esbuild-wasm'
import { bundleNotebookRuntime } from '@/lib/blocks/export'
import { THEME_EVENT, applyTheme } from '@/lib/blocks/sandbox/theme'
import { importMap } from '@/lib/blocks/vendor/manifest'
import { waitFor } from '../../../test/blocks/render'
import type { ObservableNotebook } from './forms'
import {
  notebookCellsScript,
  observableDocument,
  observableSource,
} from './observable-document'

declare global {
  interface Window {
    __theoremImport?: (specifier: string) => Promise<unknown>
    __theoremNotebook?: unknown
  }
}

const LIGHT = {
  mode: 'light' as const,
  tokens: { '--ink': 'rgb(1, 2, 3)', '--redwood': 'rgb(10, 20, 30)' },
}

let runtime: Promise<string> | undefined
/** The frame's runtime, bundled once with Bun's esbuild and run in this window. */
async function loadRuntime() {
  runtime ??= bundleNotebookRuntime(esbuild)
  ;(0, eval)(await runtime)
}

/** Runs a notebook's cells script the way its frame does. */
async function run(notebook: ObservableNotebook) {
  await loadRuntime()
  document.body.innerHTML = '<main></main>'
  ;(0, eval)(notebookCellsScript(notebook))
  return document.querySelector('main')!
}

afterEach(() => {
  document.body.innerHTML = ''
})

test('the sandbox import map carries the d3 bundle and the notebook runtime', () => {
  expect(importMap.imports.d3).toMatch(/^\/vendor\/d3@7\.9\.0\//)
  expect(importMap.imports['@observablehq/notebook-kit/runtime']).toBeDefined()
})

test('d3 resolves inside the sandbox runtime, from the bundle and not the network', async () => {
  await run({ form: 'observable', title: 'Empty', cells: [] })
  const d3 = (await window.__theoremImport!('d3')) as typeof D3Array & {
    scaleLinear: () => { domain: (d: number[]) => { range: (r: number[]) => (x: number) => number } }
  }
  expect(d3.scaleLinear().domain([0, 10]).range([0, 100])(5)).toBe(50)
  expect(d3.max([3, 9, 4])).toBe(9)
  await expect(window.__theoremImport!('lodash')).rejects.toThrow(
    /not in the sandbox's import map/,
  )
})

test('cells run reactively: an import in one cell feeds an expression in the next', async () => {
  const main = await run({
    form: 'observable',
    title: 'Scale',
    cells: [
      { id: 'title', kind: 'md', source: '# Half of ${total}' },
      { id: 'lib', kind: 'js', source: 'import * as d3 from "d3"' },
      { id: 'total', kind: 'js', source: 'const total = data.total' },
      {
        id: 'scaled',
        kind: 'js',
        source: 'd3.scaleLinear().domain([0, total]).range([0, 100])(total / 2)',
      },
    ],
    data: { total: 40 },
  })
  const scaled = main.querySelector('[data-cell-id="scaled"]')!
  await waitFor(() => scaled.textContent.includes('50'))
  await waitFor(() => main.querySelector('h1')?.textContent.includes('Half of 40'))
  expect(
    [...main.querySelectorAll<HTMLElement>('.cell')].map((s) => s.dataset.cellId),
  ).toEqual(['title', 'lib', 'total', 'scaled'])
})

test('a cell that does not parse shows its error and the others still run', async () => {
  const main = await run({
    form: 'observable',
    title: 'Broken',
    cells: [
      { id: 'bad', kind: 'js', source: 'const = 1' },
      { id: 'good', kind: 'js', source: '1 + 1' },
    ],
  })
  await waitFor(() => main.querySelector('[data-cell-id="good"]')!.textContent.includes('2'))
  await waitFor(() =>
    main.querySelector('[data-cell-id="bad"]')!.textContent.includes('SyntaxError'),
  )
})

test('cells read the theme as a reactive value that follows a change', async () => {
  applyTheme(LIGHT)
  const main = await run({
    form: 'observable',
    title: 'Theme',
    cells: [{ id: 'ink', kind: 'js', source: 'theme.mode + " " + theme.series[0]' }],
  })
  const cell = main.querySelector('[data-cell-id="ink"]')!
  await waitFor(() => cell.textContent.includes('light rgb(10, 20, 30)'))
  applyTheme({ mode: 'dark', tokens: { '--redwood': 'rgb(200, 100, 50)' } })
  window.dispatchEvent(new Event(THEME_EVENT))
  await waitFor(() => cell.textContent.includes('dark rgb(200, 100, 50)'))
})

test('the document loads nothing: no network, its theme baked in for the first paint', async () => {
  const html = await observableDocument(
    { form: 'observable', title: 'Doc', cells: [{ id: 'a', kind: 'js', source: '1' }] },
    LIGHT,
    esbuild,
  )
  expect(html).toContain("connect-src 'none'")
  expect(html).toContain('--redwood:rgb(10, 20, 30)')
  expect(html).toContain('__theoremNotebook.start')
  expect(html).not.toMatch(/cdn\.jsdelivr\.net\/npm\/d3/)
})

test("the frame lets d3 build its row readers, which d3.csvParse does from a string, and still reaches nothing", async () => {
  const html = await observableDocument(
    { form: 'observable', title: 'Rows', cells: [] },
    LIGHT,
    esbuild,
  )
  const policy = /Content-Security-Policy" content="([^"]+)"/.exec(html)![1]!
  expect(policy).toMatch(/script-src [^;]*'unsafe-eval'/)
  expect(policy).toContain("connect-src 'none'")
  expect(policy).not.toMatch(/script-src [^;]*https:/)
})

test('a downloaded notebook carries its data and the theme it was drawn in, so it runs on its own', () => {
  const kit = observableSource(
    {
      form: 'observable',
      title: 'Theme',
      cells: [{ id: 'ink', kind: 'js', source: 'theme.series[0]' }],
      data: { n: 1 },
    },
    LIGHT,
  )
  expect(kit).toContain('const data =')
  expect(kit).toContain('const theme =')
  expect(kit).toContain('rgb(10, 20, 30)')
  expect(kit.indexOf('const theme =')).toBeLessThan(kit.indexOf('theme.series[0]'))
})
