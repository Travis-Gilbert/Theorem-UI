// SOURCING: @observablehq/notebook-kit's transpile (each cell's inputs,
// outputs and body, as Notebook Kit compiles them) and serialize (the
// notebook as a Notebook Kit file, for Copy and Download), acorn and magic-string (a
// cell's dynamic imports pointed at the frame's bundled modules), the hosted
// App document and bridge (the frame), notebook-kit's inspector and highlight
// styles and Inputs' stylesheet. No library builds a notebook into an
// opaque frame that loads nothing.
import { serialize, toCell, toNotebook, transpile } from '@observablehq/notebook-kit'
import highlightStyle from '@observablehq/notebook-kit/highlight.css?raw'
import inspectorStyle from '@observablehq/notebook-kit/inspector.css?raw'
import inputsStyle from '@observablehq/inputs/dist/index.css?raw'
import { parseExpressionAt } from 'acorn'
import type { Node as AcornNode } from 'acorn'
import { simple } from 'acorn-walk'
import MagicString from 'magic-string'
import type * as Esbuild from 'esbuild-wasm'
import { bundleNotebookRuntime } from '@/lib/blocks/export'
import { hostedAppDocument } from '@/lib/blocks/hosted-app'
import { chartTheme } from '@/lib/blocks/sandbox/theme'
import type { ThemeState } from '@/lib/blocks/sandbox/theme'
import type { ObservableCell, ObservableNotebook } from './forms'
import { inlineCode, notebookPage, scriptJson } from './page'

type Bundler = Pick<typeof Esbuild, 'build'>

/** notebook-kit's and Inputs' styles, under the notebook surface page.ts adds. */
const OBSERVABLE_STYLE = [inputsStyle, inspectorStyle, highlightStyle].join('\n')

/**
 * A cell's `import("d3")` as the frame resolves it. The frame has no network
 * and no import map URL to fetch from; its bundle holds the import map's
 * modules and answers by specifier.
 */
function pointImports(body: string): string {
  const out = new MagicString(body)
  simple(parseExpressionAt(body, 0, { ecmaVersion: 'latest' }), {
    ImportExpression(node) {
      const { source } = node as AcornNode & { source: AcornNode }
      out.overwrite(node.start, source.start, '__theoremImport(')
    },
  })
  return out.toString()
}

/** One cell's definition, as the source of an object literal. */
function compileCell(cell: ObservableCell, index: number): string {
  const meta = { id: cell.id, kind: cell.kind }
  try {
    const compiled = transpile(
      toCell({ id: index, value: cell.source, mode: cell.kind }),
      { resolveImport: (specifier: string) => specifier },
    )
    const definition = {
      ...meta,
      inputs: compiled.inputs ?? [],
      outputs: compiled.outputs ?? [],
      output: compiled.output,
      autodisplay: compiled.autodisplay === true,
      autoview: compiled.autoview === true,
      automutable: compiled.automutable === true,
    }
    return `{...${scriptJson(definition)}, body: ${pointImports(compiled.body)}}`
  } catch (error) {
    // A cell that does not parse shows its error where it stands; the rest run.
    const message = (error as Error).message
    return `{...${scriptJson({ ...meta, inputs: [], outputs: [], autodisplay: true })}, body: () => { throw new SyntaxError(${scriptJson(message)}) }}`
  }
}

/** The script that defines the notebook's cells into the frame. */
export function notebookCellsScript(notebook: ObservableNotebook): string {
  const cells = notebook.cells.map(compileCell).join(',\n')
  return inlineCode(
    `window.__theoremNotebook.start([\n${cells}\n], { data: ${scriptJson(notebook.data ?? {})} })`,
  )
}

let runtime: Promise<string> | undefined

/**
 * The hosted document an Observable notebook runs in: the App bridge, the
 * notebook runtime with the import map's modules, the cells, and the theme it
 * opened with. It reaches no network.
 */
export async function observableDocument(
  notebook: ObservableNotebook,
  theme: ThemeState,
  esbuild?: Bundler,
): Promise<string> {
  const script = esbuild
    ? await bundleNotebookRuntime(esbuild)
    : await (runtime ??= bundleNotebookRuntime().catch((error) => {
        runtime = undefined
        throw error
      }))
  const html = notebookPage({
    title: notebook.title,
    form: 'observable',
    theme,
    style: OBSERVABLE_STYLE,
    main: '',
    scripts: `<script>${script}</script>\n<script>${notebookCellsScript(notebook)}</script>`,
  })
  // d3's delimited-text parsers build their row readers from strings.
  return hostedAppDocument(html, esbuild, { net: [], evaluates: true })
}

/**
 * The notebook as a Notebook Kit file, which Observable Desktop and
 * `notebooks preview` open. Its data and the theme it was drawn in, builtins
 * in the frame, become its first cells so the file runs on its own; the theme
 * is the page's at export, as fixed values.
 */
export function observableSource(
  notebook: ObservableNotebook,
  theme: ThemeState,
): string {
  const constant = (name: string, value: unknown) => ({
    kind: 'js' as const,
    source: `const ${name} = ${JSON.stringify(value, null, 2)}`,
  })
  const sources = [
    ...(notebook.data ? [constant('data', notebook.data)] : []),
    constant('theme', chartTheme(theme)),
    ...notebook.cells,
  ]
  return serialize(
    toNotebook({
      title: notebook.title,
      cells: sources.map((cell, index) =>
        toCell({ id: index + 1, value: cell.source, mode: cell.kind }),
      ),
    }),
  )
}
