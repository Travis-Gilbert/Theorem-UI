// SOURCING: the DOM's own parser (a page's inert scripts). The form is this
// app's: a TypeScript App is an HTML App whose page carries its source files,
// so it stays one document with one revision history.

/** The `type` of a script that holds a source file. A browser does not run it. */
export const SOURCE_TYPE = 'text/theorem-source'

/** What a problem with an App came from: building it, checking it, or running it. */
export type AppProblemKind = 'build' | 'type' | 'runtime'

/** One thing wrong with an App, where it is, in the form a person or an agent can act on. */
export interface AppProblem {
  kind: AppProblemKind
  message: string
  /** The source file, as the App names it. */
  file?: string
  /** One-based. */
  line?: number
  /** One-based. */
  column?: number
  /** The checker's code, such as `TS2339`. */
  code?: string
}

/** An App's source files, by path, and the one it starts from. */
export interface AppSources {
  files: Record<string, string>
  entry: string
}

/** An App that cannot be built, with what is wrong. */
export class AppBuildError extends Error {
  constructor(readonly problems: Array<AppProblem>) {
    super(problems.map(problemText).join('\n'))
    this.name = 'AppBuildError'
  }
}

/** A problem on one line: `main.tsx:3:7 TS2339 Property 'x' does not exist`. */
export function problemText(problem: AppProblem): string {
  const where = problem.file
    ? `${problem.file}${problem.line ? `:${problem.line}${problem.column ? `:${problem.column}` : ''}` : ''} `
    : ''
  return `${where}${problem.code ? `${problem.code} ` : ''}${problem.message}`
}

/** Forward slashes, no leading slash, no `.` or `..`, and a kind esbuild is told how to load. */
const SOURCE_PATH =
  /^(?:[\w@-][\w.@-]*\/)*[\w@-][\w.@-]*\.(?:tsx?|jsx?|css|json)$/
const ENTRIES = ['main.tsx', 'main.ts', 'main.jsx', 'main.js']

/** The most source one App carries, in characters. */
export const MAX_SOURCE = 2 * 1024 * 1024

const sourceScripts = (page: Document) =>
  [...page.querySelectorAll('script')].filter(
    (script) => script.getAttribute('type') === SOURCE_TYPE,
  )

/**
 * The source files a page carries, or null when it carries none and is a
 * plain HTML App:
 *
 *     <script type="text/theorem-source" data-path="main.tsx">…</script>
 *     <script type="text/theorem-source" data-path="OrgTable.tsx">…</script>
 *
 * The App starts from the file marked `data-entry`, or from `main.tsx`.
 */
export function readAppSources(page: Document): AppSources | null {
  const scripts = sourceScripts(page)
  if (!scripts.length) return null
  const problems: Array<AppProblem> = []
  const say = (message: string, file?: string) =>
    problems.push({ kind: 'build', message, file })
  const files: Record<string, string> = {}
  const entries: Array<string> = []
  let size = 0
  for (const script of scripts) {
    const path = script.getAttribute('data-path') ?? ''
    if (!SOURCE_PATH.test(path) || path.split('/').includes('..')) {
      say(
        `"${path}" is not a source path; use a relative path such as main.tsx or components/Table.tsx`,
      )
      continue
    }
    if (Object.hasOwn(files, path)) {
      say('This file appears twice', path)
      continue
    }
    files[path] = script.textContent
    size += script.textContent.length
    if (script.hasAttribute('data-entry')) entries.push(path)
  }
  if (size > MAX_SOURCE)
    say(
      `The App's source is ${Math.round(size / 1024)} KB; an App carries at most ${MAX_SOURCE / 1024} KB`,
    )
  if (entries.length > 1)
    say(`Only one file may be the entry; ${entries.join(', ')} are marked`)
  const entry = entries[0] ?? ENTRIES.find((path) => Object.hasOwn(files, path))
  if (!entry && !problems.length)
    say('No file to start from: name one main.tsx, or mark one data-entry')
  if (problems.length || !entry) throw new AppBuildError(problems)
  return { files, entry }
}

/** The source files in an App's HTML, or null for a plain HTML App. */
export function appSourcesOf(html: string): AppSources | null {
  return readAppSources(new DOMParser().parseFromString(html, 'text/html'))
}

/** Takes the source scripts out of a page: a built App runs its bundle, not these. */
export function removeAppSources(page: Document): void {
  for (const script of sourceScripts(page)) script.remove()
}
