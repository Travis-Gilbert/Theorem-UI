// SOURCING: sucrase (TypeScript and JSX to JavaScript; it keeps every line
// where it was, so traced values land on the right line), acorn (the
// top-level statements to trace and the exports to unwrap), magic-string
// (splicing), and @observablehq/notebook-kit's transpileJavaScript (a cell's
// inputs, outputs and body, with imports turned into dynamic imports that the
// block document's import map resolves). SHA-256 is last-run.ts's, over Web Crypto.
import { transpileJavaScript } from '@observablehq/notebook-kit'
import { parse } from 'acorn'
import type { Node as AcornNode, Pattern, Statement } from 'acorn'
import MagicString from 'magic-string'
import { getVersion, transform } from 'sucrase'
import { parseCodeDeclarations } from './declarations'
import type { Capabilities } from './declarations'
import { sha256Hex } from './last-run'
import { importMapHash } from './vendor/manifest'

/**
 * The names the sandbox gives every cell. Any other free name a cell uses is
 * another block's `#id`.
 */
export const CELL_BUILTINS = [
  'display',
  'files',
  'state',
  'run',
  'invalidation',
  '__trace',
  '__render',
] as const

/** Bump when the compiled module's shape changes, so old cache entries miss. */
const CELL_FORMAT = 2
// The installed @observablehq/notebook-kit; compile.test.ts checks it.
export const NOTEBOOK_KIT_VERSION = '2.7.1'
export const COMPILER_VERSION = `cell@${CELL_FORMAT} sucrase@${getVersion()} notebook-kit@${NOTEBOOK_KIT_VERSION}`

/** A block compiled to the ES module its sandbox document imports. */
export interface CompiledCell {
  /** SHA-256 of the source, the compiler and the import map: the cache key. */
  key: string
  /** SHA-256 of the source alone: the key last-run values are kept under. */
  sourceHash: string
  /** The module: `inputs`, `outputs`, `autodisplay` and the body as default export. */
  code: string
  /** Other blocks it reads, by `#id`. */
  inputs: Array<string>
  /** Builtins it uses. */
  builtins: Array<string>
  /** Its top-level declarations. */
  outputs: Array<string>
  /** True for an expression, whose value is shown. */
  autodisplay: boolean
  capabilities: Capabilities
  /** Problems with its `// uses:` declarations. */
  declarationErrors: Array<string>
}

export class CompileError extends Error {
  constructor(
    message: string,
    readonly line: number | null,
  ) {
    super(message)
    this.name = 'CompileError'
  }
}

/** The compile cache key for a source. */
export const compileKey = (source: string) =>
  sha256Hex(`${COMPILER_VERSION}\n${importMapHash}\n${source}`)

function lineOf(error: unknown): number | null {
  const loc = (error as { loc?: { line?: number } }).loc
  if (typeof loc?.line === 'number') return loc.line
  const match = /\((\d+):\d+\)/.exec(String((error as Error).message))
  return match ? Number(match[1]) : null
}

function patternNames(pattern: Pattern | null, into: Array<string>): void {
  if (!pattern) return
  switch (pattern.type) {
    case 'Identifier':
      into.push(pattern.name)
      break
    case 'ObjectPattern':
      for (const property of pattern.properties)
        patternNames(
          property.type === 'RestElement' ? property.argument : property.value,
          into,
        )
      break
    case 'ArrayPattern':
      for (const element of pattern.elements) patternNames(element, into)
      break
    case 'RestElement':
      patternNames(pattern.argument, into)
      break
    case 'AssignmentPattern':
      patternNames(pattern.left, into)
      break
    default:
      break
  }
}

const isDisplayCall = (statement: Statement) =>
  statement.type === 'ExpressionStatement' &&
  statement.expression.type === 'CallExpression' &&
  statement.expression.callee.type === 'Identifier' &&
  statement.expression.callee.name === 'display'

/**
 * Unwraps exports, so a tool file can `export default` its component, and
 * records each top-level value with `__trace(line, …)` for last-run values.
 */
function instrument(js: string): string {
  const program = parse(js, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
    locations: true,
  })
  const out = new MagicString(js)
  let rendered: string | null = null
  for (const node of program.body) {
    const line = node.loc!.start.line
    if (node.type === 'ExportDefaultDeclaration') {
      const declaration = node.declaration as AcornNode & {
        id?: { name: string } | null
      }
      if (
        (declaration.type === 'FunctionDeclaration' ||
          declaration.type === 'ClassDeclaration') &&
        declaration.id
      ) {
        out.remove(node.start, declaration.start)
        rendered = declaration.id.name
      } else {
        out.overwrite(node.start, declaration.start, 'const __default = ')
        rendered = '__default'
      }
      continue
    }
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) out.remove(node.start, node.declaration.start)
      else out.remove(node.start, node.end)
      continue
    }
    if (node.type === 'VariableDeclaration') {
      const names: Array<string> = []
      for (const declarator of node.declarations)
        patternNames(declarator.id, names)
      if (names.length)
        out.appendLeft(node.end, `;__trace(${line}, {${names.join(', ')}});`)
      continue
    }
    if (node.type === 'ExpressionStatement' && !isDisplayCall(node)) {
      out.prependRight(node.expression.start, `__trace(${line}, null, (`)
      out.appendLeft(node.expression.end, '))')
    }
  }
  if (rendered) out.append(`\n;__render(${rendered})`)
  return out.toString()
}

/** Compiles a block's TypeScript or JSX source to its cell module. */
export async function compileCell(source: string): Promise<CompiledCell> {
  const declarations = parseCodeDeclarations(source)
  let transpiled: ReturnType<typeof transpileJavaScript>
  try {
    const { code } = transform(source, {
      transforms: ['typescript', 'jsx'],
      jsxRuntime: 'automatic',
      production: true,
      disableESTransforms: true,
    })
    transpiled = transpileJavaScript(instrument(code), {
      resolveImport: (specifier: string) => specifier,
    })
  } catch (error) {
    throw new CompileError(
      (error as Error).message.replace(/\s*\(\d+:\d+\)$/, ''),
      lineOf(error),
    )
  }
  const builtins = new Set<string>(CELL_BUILTINS)
  const allInputs = transpiled.inputs ?? []
  const outputs = (transpiled.outputs ?? []).filter(
    (name) => !name.startsWith('__'),
  )
  const code = [
    `export const inputs = ${JSON.stringify(allInputs)};`,
    `export const outputs = ${JSON.stringify(transpiled.outputs ?? [])};`,
    `export const autodisplay = ${transpiled.autodisplay === true};`,
    `export default ${transpiled.body};`,
    '',
  ].join('\n')
  return {
    key: await compileKey(source),
    sourceHash: await sha256Hex(source),
    code,
    inputs: allInputs.filter((name) => !builtins.has(name)),
    builtins: allInputs.filter((name) => builtins.has(name)),
    outputs,
    autodisplay: transpiled.autodisplay === true,
    capabilities: declarations.capabilities,
    declarationErrors: declarations.errors,
  }
}

/** A compile that failed, as it crosses from the worker. */
export interface CompileFailure {
  message: string
  line: number | null
}

export type CompileResult =
  { ok: true; cell: CompiledCell } | { ok: false; error: CompileFailure }

export interface WorkerMethods {
  compile: { params: { source: string }; result: CompileResult }
}

/** Compiles a source, reporting failure as a value. */
export async function compileResult(source: string): Promise<CompileResult> {
  try {
    return { ok: true, cell: await compileCell(source) }
  } catch (error) {
    return {
      ok: false,
      error: {
        message: (error as Error).message,
        line: error instanceof CompileError ? error.line : null,
      },
    }
  }
}
