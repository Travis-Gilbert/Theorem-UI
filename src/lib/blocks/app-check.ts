// SOURCING: tsrs (@tsrs/wasm), the Rust port of the TypeScript compiler, run
// over files in memory. Which files it is given, and the problems its
// diagnostics become, are this app's. The build (export.ts) erases types
// without checking them; this checks them without building.
import type { Diagnostic, TscOptions, TscResult } from '@tsrs/wasm'
import type { AppProblem, AppSources } from './app-source'
import { importMap } from './vendor/manifest'

/** tsrs's `tsc`, the Node build in tests and the browser build in the worker. */
export type Tsc = (
  args: Array<string>,
  options?: TscOptions,
) => Promise<TscResult>

/**
 * The declarations an App is checked against, by absolute path: React's, and
 * `@theorem/app`'s for `window.theorem` (app-check-library.ts).
 */
export type CheckLibrary = Record<string, string>

/** What a check found, and what it cost. */
export interface CheckResult {
  problems: Array<AppProblem>
  durationMs: number
  /** The compiler's peak memory, in bytes. */
  memoryBytes: number
}

/** Where the App's files are put for the compiler. */
const SOURCE_ROOT = '/app/src/'

const CONFIG = {
  compilerOptions: {
    target: 'es2022',
    module: 'esnext',
    moduleResolution: 'bundler',
    jsx: 'react-jsx',
    lib: ['es2022', 'dom', 'dom.iterable'],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    // Nothing is ambient but what is named below.
    types: [],
  },
  files: ['/node_modules/@theorem/app/index.d.ts', '/app/modules.d.ts'],
  include: [`${SOURCE_ROOT}**/*`],
}

/** Modules of the import map that have declarations in the library. */
const TYPED = new Set(['react', 'react/jsx-runtime', 'react-dom/client'])

/**
 * The import map's other modules, importable and untyped: an App may use d3
 * or Plot, and what it does with them is not checked. Styles import as nothing.
 */
const UNTYPED_MODULES = [
  ...Object.keys(importMap.imports)
    .filter((specifier) => !TYPED.has(specifier))
    .map((specifier) => `declare module '${specifier}'`),
  `declare module '*.css' {}`,
  '',
].join('\n')

const text = (diagnostic: Diagnostic): string =>
  [diagnostic.text, ...(diagnostic.messageChain ?? []).map(text)].join(' ')

function problem(diagnostic: Diagnostic): AppProblem {
  const file = diagnostic.fileName?.startsWith(SOURCE_ROOT)
    ? diagnostic.fileName.slice(SOURCE_ROOT.length)
    : undefined
  return {
    kind: 'type',
    message: text(diagnostic),
    code: `TS${diagnostic.code}`,
    file,
    line:
      file && diagnostic.startPosition
        ? diagnostic.startPosition.line + 1
        : undefined,
    column:
      file && diagnostic.startPosition
        ? diagnostic.startPosition.character + 1
        : undefined,
  }
}

/**
 * Type-checks an App's files as the build takes them: strict, React's JSX,
 * the import map's modules, and `window.theorem` as the bridge gives it.
 * Errors only: a suggestion is not a problem.
 */
export async function checkAppSources(
  sources: AppSources,
  tsc: Tsc,
  library: CheckLibrary,
  options: Pick<TscOptions, 'url' | 'module'> = {},
): Promise<CheckResult> {
  const started = performance.now()
  const files: Record<string, string> = {
    ...library,
    '/app/tsconfig.json': JSON.stringify(CONFIG),
    '/app/modules.d.ts': UNTYPED_MODULES,
  }
  for (const [path, source] of Object.entries(sources.files))
    files[SOURCE_ROOT + path] = source
  const result = await tsc(['-p', '/app/tsconfig.json'], {
    ...options,
    cwd: '/app',
    files,
    diagnostics: 'json',
  })
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === 1,
  )
  // A compiler that stopped without saying why still stopped.
  if (result.exitCode !== 0 && !errors.length)
    throw new Error(
      `The type checker stopped with code ${result.exitCode}${result.stderr ? `: ${result.stderr.slice(0, 500)}` : ''}`,
    )
  return {
    problems: errors.map(problem),
    durationMs: performance.now() - started,
    memoryBytes: result.memoryBytes,
  }
}

/** The check as it crosses from the worker: a failure of the checker is a value. */
export type CheckOutcome =
  { ok: true; result: CheckResult } | { ok: false; message: string }

export interface CheckWorkerMethods {
  check: { params: { sources: AppSources }; result: CheckOutcome }
}
