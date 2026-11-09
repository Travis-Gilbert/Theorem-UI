import { expect, test } from 'bun:test'
import * as esbuild from 'esbuild-wasm'
import type { MarimoNotebook } from './forms'
import {
  BROWSER_RUN_HOSTS,
  islandsDocument,
  marimoCells,
  moduleWorkerShim,
  outputHtml,
  retainedOutputsDocument,
  themeCell,
} from './marimo'

const SOURCE = `import marimo

__generated_with = "0.23.16"
app = marimo.App(width="medium")

with app.setup:
    import numpy as np


@app.cell
def _():
    import marimo as mo
    return (mo,)


@app.cell(hide_code=True)
def _(mo):
    mo.md("""
    # Title
    """)
    return


@app.cell
async def sizes(mo, np):
    # sizes to time
    x = np.arange(3)
    if x.sum():
        y = x * 2
    x
    return (x,)


@app.function
@cache
def helper(x):
    return x


@app.class_definition
class Point:
    x: int


if __name__ == "__main__":
    app.run()
`

const THEME = {
  mode: 'light' as const,
  tokens: {
    '--ink': 'rgb(10, 10, 10)',
    '--ink-muted': 'rgb(90, 90, 90)',
    '--line-separator': 'rgb(220, 220, 220)',
    '--redwood': 'rgb(160, 40, 30)',
    '--teal': 'rgb(20, 120, 120)',
  },
}

const recorded = (cells: MarimoNotebook['outputs']) =>
  ({
    form: 'marimo',
    title: 'Timings',
    source: SOURCE,
    runtime: 'pyodide',
    outputs: cells,
  }) satisfies MarimoNotebook

const RUN = {
  revision: 'r1',
  inputs: { run: true },
  execution: {
    host: 'Apple M1 Max (macOS)',
    device: 'CPU',
    startedAtMs: 0,
    finishedAtMs: 1000,
  },
}

test('a marimo file splits into the cells marimo runs', () => {
  expect(marimoCells(SOURCE)).toEqual([
    { kind: 'setup', code: 'import numpy as np', hideCode: false },
    { kind: 'cell', name: '_', code: 'import marimo as mo', hideCode: false },
    {
      kind: 'cell',
      name: '_',
      code: 'mo.md("""\n# Title\n""")',
      hideCode: true,
    },
    {
      kind: 'cell',
      name: 'sizes',
      code: '# sizes to time\nx = np.arange(3)\nif x.sum():\n    y = x * 2\nx',
      hideCode: false,
    },
    {
      kind: 'function',
      name: 'helper',
      code: '@cache\ndef helper(x):\n    return x',
      hideCode: false,
    },
    { kind: 'class', name: 'Point', code: 'class Point:\n    x: int', hideCode: false },
  ])
})

test('a cell marimo could not parse is kept as its text', () => {
  const cells = marimoCells(`import marimo
app = marimo.App()

app._unparsable_cell(
    r"""
    x = (
    """,
    name="_"
)
`)
  expect(cells).toEqual([{ kind: 'unparsable', code: 'x = (', hideCode: false }])
})

test('recorded outputs render by media type', () => {
  expect(outputHtml({ mime: 'text/html', data: '<b>bold</b>' })).toBe('<b>bold</b>')
  // marimo records mo.md as text/markdown that already holds HTML.
  expect(
    outputHtml({ mime: 'text/markdown', data: '<span class="markdown"><h1>T</h1></span>' }),
  ).toBe('<span class="markdown"><h1>T</h1></span>')
  expect(outputHtml({ mime: 'image/png', data: 'iVBO\nRw0=' })).toBe(
    '<img alt="" src="data:image/png;base64,iVBORw0=">',
  )
  expect(outputHtml({ mime: 'text/plain', data: 'a < b' })).toBe(
    '<pre class="output-text">a &lt; b</pre>',
  )
  expect(
    outputHtml({
      mime: 'application/vnd.marimo+error',
      data: { ename: 'ValueError', evalue: 'bad', traceback: [] },
    }),
  ).toContain('ValueError: bad')
  expect(outputHtml({ mime: 'application/x-unknown', data: 1 })).toContain(
    'has no view here',
  )
})

test('recorded outputs render without a runtime: no Python, no network', async () => {
  const html = await retainedOutputsDocument(
    recorded({
      ...RUN,
      cells: [
        { id: 'Hbol', outputs: [] },
        { id: 'bkHC', outputs: [{ mime: 'text/plain', data: '' }] },
        { id: 'MJUe', outputs: [{ mime: 'text/html', data: '<h1>Title</h1>' }] },
        { id: 'vblA', outputs: [{ mime: 'image/svg+xml', data: '<svg id="plot"></svg>' }] },
      ],
    }),
    THEME,
    esbuild,
  )
  expect(html).toContain("connect-src 'none'")
  expect(html).not.toContain('marimo-team/islands')
  expect(html).not.toContain('<marimo-island')
  expect(html).toContain('<section class="cell" data-cell-id="MJUe">')
  expect(html).toContain('<h1>Title</h1>')
  expect(html).toContain('<svg id="plot"></svg>')
  expect(html).not.toContain('data-cell-id="Hbol"')
  expect(html).not.toContain('data-cell-id="bkHC"')
  expect(html).toContain('--redwood:rgb(160, 40, 30)')
})

test('a browser run carries the recorded outputs into its islands and names what it reaches', async () => {
  const cells = marimoCells(SOURCE).map((_, index) => ({
    id: `c${index}`,
    outputs: index === 2 ? [{ mime: 'text/html', data: '<h1>Recorded</h1>' }] : [],
  }))
  const html = await islandsDocument(recorded({ ...RUN, cells }), THEME, esbuild)
  const policy = /Content-Security-Policy" content="([^"]+)"/.exec(html)![1]!
  for (const host of BROWSER_RUN_HOSTS)
    expect(policy).toContain(`https://${host}`)
  // islands 0.23.16 reads Pyodide's lock file from wasm.marimo.app before anything runs.
  expect(policy).toMatch(/connect-src[^;]*https:\/\/wasm\.marimo\.app/)
  expect(policy).toContain("'wasm-unsafe-eval'")
  expect(policy).toContain('worker-src blob: https://cdn.jsdelivr.net')
  // islands copies its stylesheet's rules into each control's shadow root; a
  // cross-origin sheet's rules are readable only when it was fetched with CORS.
  expect(html).toMatch(/<link rel="stylesheet" href="[^"]+\/style\.css" crossorigin="anonymous">/)
  // That sheet loads after the recorded outputs, so it does not hold their first paint.
  expect(html.indexOf('/style.css')).toBeGreaterThan(html.indexOf('<main'))
  expect(html.indexOf('/style.css')).toBeLessThan(html.indexOf('islands@0.23.16/dist/main.js'))
  // The recorded outputs are in the islands' markup, so they show before islands loads.
  expect(html).toMatch(
    /<marimo-island [^>]*data-cell-id="c2"><marimo-cell-output><div class="output" data-mime="text\/html"><h1>Recorded<\/h1><\/div><\/marimo-cell-output><\/marimo-island>/,
  )
  // marimo's controls take the page's tokens: islands copies a sheet titled
  // "marimo…" into each control's shadow root, and unlayered it wins over
  // marimo's layered defaults, colour scheme included.
  const controls = /<style title="(marimo[^"]*)">([^<]*)<\/style>/.exec(html)!
  expect(controls[2]).toContain('color-scheme:inherit')
  expect(controls[2]).toContain('--foreground:var(--ink)')
  expect(controls[2]).toContain('--link:inherit')
  expect(controls[2]).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  const payload = JSON.parse(
    /<script type="application\/vnd\.marimo\.islands\+json">([\s\S]*?)<\/script>/
      .exec(html)![1]!
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&'),
  ) as { cells: Array<{ cellId: string; code: string; outputHtml: string; displayCode: boolean }> }
  expect(payload.cells[0]!.cellId).toBe('theorem-theme')
  expect(payload.cells.slice(1).map((c) => c.cellId)).toEqual(cells.map((c) => c.id))
  expect(payload.cells[3]!.outputHtml).toContain('<h1>Recorded</h1>')
  expect(payload.cells.every((c) => !c.displayCode)).toBe(true)
  expect(html).toContain('<section class="cell" data-cell-id="c2">')
  // The worker shim is in place before islands starts its worker.
  const shim = html.indexOf('held.push')
  expect(shim).toBeGreaterThan(-1)
  expect(shim).toBeLessThan(html.indexOf('islands@0.23.16/dist/main.js'))
})

test('a module worker started from a blob runs as a classic worker that imports the same module', () => {
  // Chromium refuses module workers from blob: URLs in an opaque-origin frame.
  const sources = new Map<string, string>()
  let count = 0
  class FakeBlob {
    constructor(readonly parts: Array<string>) {}
  }
  const url = {
    createObjectURL: (blob: FakeBlob) => {
      const href = `blob:null/${count++}`
      sources.set(href, blob.parts.join(''))
      return href
    },
  }
  const created: Array<{ url: string; options?: WorkerOptions; source?: string }> = []
  class FakeWorker {
    constructor(href: string, options?: WorkerOptions) {
      created.push({ url: href, options, source: sources.get(href) })
    }
  }
  const window = { Blob: FakeBlob, Worker: FakeWorker }
  // Run as the frame runs it: the function's own text, in a scope of its own.
  new Function('window', 'URL', `(${moduleWorkerShim.toString()})()`)(window, url)

  const entry = url.createObjectURL(new window.Blob(['import "https://cdn.example/worker.js"']))
  new window.Worker(entry, { type: 'module', name: '0.23.16' })
  expect(created[0]!.options).toEqual({ name: '0.23.16' })
  expect(created[0]!.source).toContain('import("https://cdn.example/worker.js")')
  // Messages sent before the module has listeners are held, then delivered.
  expect(created[0]!.source).toContain("addEventListener('message',hold)")

  new window.Worker('https://cdn.example/other.js', { type: 'module' })
  expect(created[1]).toEqual({ url: 'https://cdn.example/other.js', options: { type: 'module' }, source: undefined })
})

test('the theme cell sets plotting defaults from tokens, and only for libraries the notebook imports', () => {
  const plain = themeCell(THEME, 'import matplotlib.pyplot as plt')
  expect(plain).toContain('#a0281e')
  expect(plain).toContain('MATPLOTLIBRC')
  expect(plain).not.toContain('import altair')
  expect(plain).not.toContain('plotly')
  expect(plain).not.toContain('micropip')
  const rich = themeCell(THEME, 'import altair as alt\nimport plotly.express as px', ['vega_datasets'])
  expect(rich).toContain('import altair as _alt')
  expect(rich).toContain('_pio.templates.default = "theorem"')
  expect(rich).toContain('await _micropip.install(["vega_datasets"])')
  // Every binding is cell-local, so no notebook cell can collide with it.
  const bindings = [...rich.matchAll(/^(?:import [\w.]+ as |def )?(\w+)\s*(?:=|\()/gm)].map(
    (m) => m[1]!,
  )
  expect(bindings.filter((name) => !name.startsWith('_') && name !== 'for' && name !== 'if' && name !== 'try'))
    .toEqual([])
})
