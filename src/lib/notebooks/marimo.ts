// SOURCING: @lezer/python (the notebook's .py read as Python, so cells are
// split on the syntax tree marimo writes rather than on text patterns),
// culori (theme tokens as the hex colours Python plotting libraries take), the hosted
// App document and bridge (both frames), and @marimo-team/islands (marimo's
// own browser runtime on Pyodide, loaded from jsDelivr only when the person
// runs the notebook). No JavaScript library reads a marimo file or renders
// marimo's recorded outputs; the splitter and the output views are ours, and
// so is the small worker shim islands needs in an opaque-origin frame (see
// moduleWorkerShim).
import { parser } from '@lezer/python'
import { formatHex, parse } from 'culori'
import type * as Esbuild from 'esbuild-wasm'
import { hostedAppDocument } from '@/lib/blocks/hosted-app'
import { chartTheme } from '@/lib/blocks/sandbox/theme'
import type { ThemeState } from '@/lib/blocks/sandbox/theme'
import type { MarimoNotebook, RetainedOutput } from './forms'
import { escapeHtml, notebookPage, scriptJson } from './page'

type Bundler = Pick<typeof Esbuild, 'build'>
type SyntaxNode = ReturnType<typeof parser.parse>['topNode']

/** One cell of a marimo file, as marimo would run it. */
export interface MarimoCell {
  kind: 'setup' | 'cell' | 'function' | 'class' | 'unparsable'
  /** The function's name; `_` for an anonymous cell. */
  name?: string
  code: string
  hideCode: boolean
}

/**
 * Lines of a body as they read outside it: the first line's indentation is
 * taken off every line that has it, as marimo does when it loads a cell.
 */
function dedent(code: string): string {
  const lines = code.split('\n')
  const indent = /^[ \t]*/.exec(lines.find((l) => l.trim()) ?? '')![0]
  return lines
    .map((line) =>
      line.startsWith(indent) ? line.slice(indent.length) : line.trimStart(),
    )
    .join('\n')
    .trim()
}

const lineStart = (source: string, at: number) =>
  source.lastIndexOf('\n', at - 1) + 1

/** A body's statements, without the `return` marimo writes to name a cell's definitions. */
function bodyCode(source: string, body: SyntaxNode | null, dropReturn: boolean) {
  if (!body) return ''
  const statements: Array<SyntaxNode> = []
  for (let child = body.firstChild; child; child = child.nextSibling)
    if (child.name !== ':') statements.push(child)
  if (dropReturn && statements.at(-1)?.name === 'ReturnStatement')
    statements.pop()
  if (!statements.length) return ''
  return dedent(
    source.slice(lineStart(source, statements[0]!.from), statements.at(-1)!.to),
  )
}

/** The text of a Python string literal, without its prefix and quotes. */
const stringText = (literal: string) =>
  /^[rRbBuUfF]*("""|'''|"|')([\s\S]*)\1$/.exec(literal)?.[2] ?? literal

/**
 * The cells of a marimo notebook file, in order: the setup block, each
 * `@app.cell` body without its trailing `return`, each `@app.function` and
 * `@app.class_definition` whole, and any cell marimo kept unparsed.
 */
export function marimoCells(source: string): Array<MarimoCell> {
  const text = (node: SyntaxNode) => source.slice(node.from, node.to)
  const cells: Array<MarimoCell> = []
  const top = parser.parse(source).topNode
  for (let node = top.firstChild; node; node = node.nextSibling) {
    if (node.name === 'WithStatement') {
      const target = node.firstChild?.nextSibling
      if (target && /^app\.setup\b/.test(text(target)))
        cells.push({
          kind: 'setup',
          code: bodyCode(source, node.getChild('Body'), false),
          hideCode: /hide_code\s*=\s*True/.test(text(target)),
        })
    } else if (node.name === 'DecoratedStatement') {
      const decorators = node.getChildren('Decorator')
      const marimo = decorators.find((d) => /^@app\./.test(text(d)))
      const kind = marimo
        ? /^@app\.(cell|function|class_definition)\b/.exec(text(marimo))?.[1]
        : undefined
      const definition =
        node.getChild('FunctionDefinition') ?? node.getChild('ClassDefinition')
      if (!marimo || !kind || !definition) continue
      const hideCode = /hide_code\s*=\s*True/.test(text(marimo))
      const name = definition.getChild('VariableName')
      if (kind === 'cell') {
        cells.push({
          kind: 'cell',
          name: name ? text(name) : '_',
          code: bodyCode(source, definition.getChild('Body'), true),
          hideCode,
        })
        continue
      }
      // A function or class cell is its definition, with any decorators of its own.
      const own = decorators.filter((d) => d !== marimo)
      cells.push({
        kind: kind === 'function' ? 'function' : 'class',
        ...(name && { name: text(name) }),
        code: dedent(source.slice(own[0]?.from ?? definition.from, definition.to)),
        hideCode,
      })
    } else if (
      node.name === 'ExpressionStatement' &&
      /^app\._unparsable_cell\(/.test(text(node))
    ) {
      const literal = node.firstChild?.getChild('ArgList')?.getChild('String')
      cells.push({
        kind: 'unparsable',
        code: literal ? dedent(stringText(text(literal))) : '',
        hideCode: false,
      })
    }
  }
  return cells
}

/** The page a recorded `image/*` output points at. */
const imageSource = (mime: string, data: string) =>
  data.startsWith('data:') ? data : `data:${mime};base64,${data.replace(/\s/g, '')}`

function errorText(data: unknown): string {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return data.map(errorText).join('\n')
  const error = (data ?? {}) as Record<string, unknown>
  if (typeof error.msg === 'string') return error.msg
  if (typeof error.evalue === 'string')
    return [
      `${String(error.ename ?? 'Error')}: ${error.evalue}`,
      ...(Array.isArray(error.traceback) ? error.traceback.map(String) : []),
    ].join('\n')
  return JSON.stringify(data, null, 2)
}

/**
 * One recorded output as markup, by the media type it was recorded with. The
 * frame it lands in is the boundary; nothing here screens what the notebook
 * produced. marimo records `mo.md` as text/markdown holding the HTML it already
 * rendered, and its own frontend shows text/markdown and text/latex as HTML, so
 * they are shown the same way here.
 */
export function outputHtml({ mime, data }: RetainedOutput): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  if (['text/html', 'image/svg+xml', 'text/markdown', 'text/latex'].includes(mime))
    return text
  if (mime.startsWith('image/'))
    return `<img alt="" src="${escapeHtml(imageSource(mime, text))}">`
  if (mime === 'application/vnd.marimo+error')
    return `<pre class="output-error">${escapeHtml(errorText(data))}</pre>`
  if (mime === 'text/plain' || mime === 'application/json' || mime.endsWith('+json'))
    return `<pre class="output-text">${escapeHtml(text)}</pre>`
  return `<p class="output-unshown">An output recorded as ${escapeHtml(mime)} has no view here.</p>`
}

/** An output with nothing in it, as marimo records a cell that displays nothing. */
const shows = (output: RetainedOutput) => output.data !== '' && output.data != null

/** A recorded cell's outputs, each in its own block. */
const cellOutputsHtml = (outputs: Array<RetainedOutput>) =>
  outputs
    .filter(shows)
    .map(
      (output) =>
        `<div class="output" data-mime="${escapeHtml(output.mime)}">${outputHtml(output)}</div>`,
    )
    .join('')

/**
 * The hosted document that shows a notebook's recorded outputs, one section
 * per cell that produced any. It runs no Python and reaches no network.
 */
export function retainedOutputsDocument(
  notebook: MarimoNotebook,
  theme: ThemeState,
  esbuild?: Bundler,
): Promise<string> {
  const main = (notebook.outputs?.cells ?? [])
    .filter((cell) => cell.outputs.some(shows))
    .map(
      (cell) =>
        `<section class="cell" data-cell-id="${escapeHtml(cell.id)}">${cellOutputsHtml(cell.outputs)}</section>`,
    )
    .join('\n')
  return hostedAppDocument(
    notebookPage({ title: notebook.title, form: 'marimo', theme, main }),
    esbuild,
    { net: [] },
  )
}

export const ISLANDS_VERSION = '0.23.16'
const ISLANDS = `https://cdn.jsdelivr.net/npm/@marimo-team/islands@${ISLANDS_VERSION}/dist`

/**
 * What a browser run reaches, and only after the person starts it: marimo's
 * islands runtime and Pyodide from jsDelivr, the Pyodide lock file marimo
 * publishes for its version, and marimo's own wheel and the notebook's
 * pure-Python packages from PyPI.
 */
export const BROWSER_RUN_HOSTS = [
  'cdn.jsdelivr.net',
  'wasm.marimo.app',
  'pypi.org',
  'files.pythonhosted.org',
]

/** A token as `#rrggbb`, or undefined when it does not resolve to a colour. */
const hex = (value: string) => {
  const colour = parse(value)
  return colour ? formatHex(colour) : undefined
}

const imports = (source: string, module: string) =>
  new RegExp(`^\\s*(?:import|from)\\s+${module}\\b`, 'm').test(source)

/**
 * The hidden first cell of a browser run: the notebook's packages, then
 * plotting defaults from the page's theme for matplotlib (rcParams, through
 * MATPLOTLIBRC so it holds whenever matplotlib is first imported), Altair and
 * Plotly (only when the notebook imports them, so nothing extra installs).
 * Every name it binds is cell-local (`_`), so it can clash with no cell.
 */
export function themeCell(
  theme: ThemeState,
  source: string,
  packages: Array<string> = [],
): string {
  const chart = chartTheme(theme)
  const colours = {
    ink: hex(chart.ink),
    muted: hex(chart.inkMuted),
    line: hex(chart.line),
    series: chart.series.map(hex).filter(Boolean),
  }
  const json = JSON.stringify({ ...colours, sans: chart.font.sans })
  const lines = [
    '# Theorem: packages and plotting defaults for this run, from the page theme.',
    'import json as _json, os as _os, sys as _sys, tempfile as _tempfile',
    `_t = _json.loads(${JSON.stringify(json)})`,
  ]
  if (packages.length)
    lines.push(
      'import micropip as _micropip',
      `await _micropip.install(${JSON.stringify(packages)})`,
    )
  lines.push(
    '_rc = {"figure.facecolor": "none", "axes.facecolor": "none", "savefig.transparent": True,',
    '       "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False}',
    'for _key, _name in [("text.color", "ink"), ("axes.labelcolor", "ink"), ("axes.titlecolor", "ink"),',
    '                    ("axes.edgecolor", "line"), ("grid.color", "line"),',
    '                    ("xtick.color", "muted"), ("ytick.color", "muted")]:',
    '    if _t.get(_name): _rc[_key] = _t[_name]',
    '_dir = _tempfile.mkdtemp()',
    'with open(_os.path.join(_dir, "matplotlibrc"), "w") as _f:',
    '    for _key, _value in _rc.items(): _f.write(f"{_key}: {str(_value).lstrip(\'#\')}\\n")',
    '    if _t["series"]: _f.write("axes.prop_cycle: cycler(\'color\', [%s])\\n" % ", ".join(repr(_c.lstrip("#")) for _c in _t["series"]))',
    '_os.environ["MATPLOTLIBRC"] = _dir',
    'if "matplotlib" in _sys.modules:',
    '    _mpl = _sys.modules["matplotlib"]',
    '    _mpl.rcParams.update(_rc)',
    '    if _t["series"]: _mpl.rcParams["axes.prop_cycle"] = _mpl.cycler(color=_t["series"])',
  )
  if (imports(source, 'altair'))
    lines.push(
      'import altair as _alt',
      'def _altair_theme():',
      '    _axis = {"labelColor": _t["muted"], "titleColor": _t["ink"], "domainColor": _t["line"], "gridColor": _t["line"], "tickColor": _t["line"]}',
      '    return {"config": {"background": "transparent", "view": {"stroke": "transparent"}, "font": _t["sans"], "axis": _axis,',
      '            "legend": {"labelColor": _t["ink"], "titleColor": _t["ink"]}, "title": {"color": _t["ink"]},',
      '            "range": {"category": _t["series"]}, "mark": {"color": (_t["series"] or [None])[0]}}}',
      'try:',
      '    _alt.theme.register("theorem", enable=True)(_altair_theme)',
      'except AttributeError:',
      '    _alt.themes.register("theorem", _altair_theme)',
      '    _alt.themes.enable("theorem")',
    )
  if (imports(source, 'plotly'))
    lines.push(
      'import plotly.io as _pio',
      '_plotly_axis = {"gridcolor": _t["line"], "linecolor": _t["line"], "zerolinecolor": _t["line"]}',
      '_pio.templates["theorem"] = {"layout": {"paper_bgcolor": "rgba(0,0,0,0)", "plot_bgcolor": "rgba(0,0,0,0)",',
      '    "font": {"color": _t["ink"], "family": _t["sans"]}, "colorway": _t["series"], "xaxis": _plotly_axis, "yaxis": _plotly_axis}}',
      '_pio.templates.default = "theorem"',
    )
  return lines.join('\n')
}

const APP_ID = 'theorem-notebook'

/**
 * Runs in the browser-run frame before islands. Chromium refuses a module
 * worker started from a blob: URL in an opaque-origin document, which this
 * frame is (its sandbox has no allow-same-origin), and islands always starts
 * Pyodide's worker that way: a blob holding `import "<worker url>"`. Such a
 * worker becomes a classic worker that imports the same module, holding any
 * message that arrives before the module listens. islands offers no hook for
 * its worker (its factory is internal), and nothing upstream models this, so
 * the shim is ours. Every other worker is left as it is.
 */
export function moduleWorkerShim() {
  const texts = new WeakMap<object, string>()
  const NativeBlob = window.Blob
  window.Blob = new Proxy(NativeBlob, {
    construct(target, args, newTarget) {
      const blob = Reflect.construct(target, args, newTarget) as Blob
      const parts: unknown = args[0]
      if (Array.isArray(parts) && parts.every((part) => typeof part === 'string'))
        texts.set(blob, parts.join(''))
      return blob
    },
  })
  const sources = new Map<string, string>()
  const createObjectURL = URL.createObjectURL.bind(URL)
  URL.createObjectURL = (object: Blob | MediaSource) => {
    const url = createObjectURL(object)
    const text = texts.get(object)
    if (text !== undefined) sources.set(url, text)
    return url
  }
  window.Worker = new Proxy(window.Worker, {
    construct(target, args, newTarget) {
      const [url, options] = args as [string | URL, WorkerOptions | undefined]
      const entry =
        options?.type === 'module'
          ? /^import\s*("[^"]*")\s*;?\s*$/.exec(sources.get(String(url)) ?? '')
          : null
      if (!entry) return Reflect.construct(target, args, newTarget) as Worker
      const bootstrap = `const held=[];const hold=(e)=>held.push(e);addEventListener('message',hold);import(${entry[1]}).then(()=>{removeEventListener('message',hold);for(const e of held)dispatchEvent(new MessageEvent('message',{data:e.data,ports:[...e.ports]}))},(error)=>setTimeout(()=>{throw error}))`
      const classic = createObjectURL(
        new NativeBlob([bootstrap], { type: 'text/javascript' }),
      )
      return Reflect.construct(target, [classic, { name: options?.name }], newTarget) as Worker
    },
  })
}

/**
 * marimo's controls in the page's theme. A control renders in a shadow root
 * the page's rules do not reach, and islands copies into it only sheets from
 * marimo or titled "marimo…". marimo sets its colours, and `color-scheme:
 * light`, in cascade layers, so these unlayered rules win: its colours become
 * the page's tokens, the names it shares with the tokens take the page's value
 * back, and the colour scheme follows the page, live theme changes included.
 */
const ISLANDS_THEME = [
  'color-scheme:inherit',
  '--background:var(--surface-artifact)',
  '--foreground:var(--ink)',
  '--muted:var(--surface-hover)',
  '--muted-foreground:var(--ink-muted)',
  '--popover:var(--surface-raised)',
  '--popover-foreground:var(--ink)',
  '--card:var(--surface-raised)',
  '--card-foreground:var(--ink)',
  '--border:var(--line-separator)',
  '--input:var(--line-control)',
  '--primary:var(--redwood)',
  '--primary-foreground:var(--surface-artifact)',
  '--secondary:var(--surface-hover)',
  '--secondary-foreground:var(--ink)',
  '--accent:var(--surface-selected)',
  '--accent-foreground:var(--ink)',
  '--ring:var(--focus)',
  // The slider draws in Tailwind's blue and white: its dark variant matches
  // only under a `.dark` ancestor, which a shadow root never has.
  '--color-blue-500:var(--redwood)',
  '--color-blue-300:var(--redwood-container)',
  '--color-white:var(--surface-raised)',
  '--link:inherit',
  '--font-sans:inherit',
  '--font-mono:inherit',
  '--text-font:var(--font-sans)',
  '--heading-font:var(--font-sans)',
  '--monospace-font:var(--font-mono)',
].join(';')

/**
 * The hosted document for a browser run: marimo's islands runtime starts
 * Pyodide in a worker and runs the cells. Recorded outputs are already in
 * each island's markup, so they show at once and stay in view while the
 * runtime starts. Code is hidden; outputs show. The frame reaches
 * BROWSER_RUN_HOSTS and nothing else.
 */
export function islandsDocument(
  notebook: MarimoNotebook,
  theme: ThemeState,
  esbuild?: Bundler,
): Promise<string> {
  const cells = marimoCells(notebook.source)
  const recorded = notebook.outputs?.cells ?? []
  // Recorded outputs line up with the file's cells when the run recorded every cell.
  const aligned = recorded.length === cells.length
  const islands = cells.map((cell, index) => ({
    cellId: aligned ? recorded[index]!.id : `cell-${index}`,
    code: cell.code,
    outputHtml: aligned ? cellOutputsHtml(recorded[index]!.outputs) : '',
    outputMimetype: 'text/html',
    reactive: true,
    displayCode: false,
    displayOutput: true,
  }))
  const theming = {
    cellId: 'theorem-theme',
    code: themeCell(theme, notebook.source, notebook.needs?.packages),
    outputHtml: '',
    outputMimetype: 'text/html',
    reactive: true,
    displayCode: false,
    displayOutput: false,
  }
  // islands fills each island's output element from the payload; written here
  // too, the recorded output paints before islands has loaded.
  const island = (id: string, output = '') =>
    `<marimo-island data-app-id="${APP_ID}" data-cell-id="${escapeHtml(id)}">${output && `<marimo-cell-output>${output}</marimo-cell-output>`}</marimo-island>`
  const main = [
    `<div hidden>${island(theming.cellId)}</div>`,
    ...islands.map(
      (cell) =>
        `<section class="cell" data-cell-id="${escapeHtml(cell.cellId)}">${island(cell.cellId, cell.outputHtml)}</section>`,
    ),
  ].join('\n')
  const payload = { schemaVersion: 1, appId: APP_ID, cells: [theming, ...islands] }
  return hostedAppDocument(
    notebookPage({
      title: notebook.title,
      form: 'marimo',
      theme,
      head: `<style title="marimo-theorem">.marimo{${ISLANDS_THEME}}</style>`,
      main,
      scripts: [
        // islands copies this sheet's rules into each control's shadow root,
        // which it can read only from a sheet fetched with CORS. In the body,
        // it holds islands back without holding the recorded outputs' paint.
        `<link rel="stylesheet" href="${ISLANDS}/style.css" crossorigin="anonymous">`,
        `<script>(${moduleWorkerShim.toString()})()</script>`,
        `<script type="application/vnd.marimo.islands+json">${scriptJson(payload)}</script>`,
        `<script type="module" src="${ISLANDS}/main.js"></script>`,
      ].join('\n'),
    }),
    esbuild,
    { net: BROWSER_RUN_HOSTS, loads: ['cdn.jsdelivr.net'] },
  )
}
