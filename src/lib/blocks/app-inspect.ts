// SOURCING: the pieces an App on screen uses, without a screen: the hosted
// page and its build (hosted-app.ts), the type check (app-checker.ts), the
// block sandbox and its bridge (executor.ts), and the trace of what a frame
// throws (app-trace.ts). What a check of an App reports, and that it runs the
// App where it can change nothing, is this app's.
import { documentAppDatabases, openInMemory } from './app-db'
import * as checker from './app-checker'
import { AppBuildError, appSourcesOf } from './app-source'
import type { AppProblem } from './app-source'
import { traceFrameError } from './app-trace'
import { parseHtmlDeclarations } from './declarations'
import { pinnedAppHost, pinnedAppState } from './document-app'
import { BLOCK_SANDBOX, FrameConnection } from './executor'
import * as hosted from './hosted-app'
import type { FrameError } from './sandbox/protocol'

/** What a check of an App found. Everything in it is JSON. */
export interface AppInspection {
  /** Whether the App's page could be made: false when its source does not build. */
  built: boolean
  /** The App's source files, when it is built from source. */
  files: Array<string>
  /** Build, type and runtime problems, in that order. */
  problems: Array<AppProblem>
  /** Problems found and not listed, past the most a check reports. */
  omitted: number
  /** Whether the types were checked: only an App built from source has any. */
  typesChecked: boolean
  /** Why the types were not checked, when they should have been. */
  typeCheckError?: string
  /** How long the App ran, in milliseconds; zero when it was not run. */
  ranMs: number
  /** What the App showed once it settled: its text, and how many elements. */
  rendered?: { text: string; elements: number }
}

export interface InspectOptions {
  /** How long to run the App and listen for what it throws. Zero does not run it. */
  runMs?: number
}

/** How long an App runs unless told otherwise, and the longest it may. */
export const DEFAULT_RUN_MS = 1500
export const MAX_RUN_MS = 5000
/** How long the App's page has to connect before the run is given up. */
const CONNECT_MS = 10_000
/** The most problems one check reports, and the most text of the rendered page. */
export const MAX_PROBLEMS = 40
const MAX_MESSAGE = 400
const MAX_RENDERED_TEXT = 2000

const declarationsOf = (html: string) =>
  parseHtmlDeclarations(
    [
      ...new DOMParser()
        .parseFromString(html, 'text/html')
        .querySelectorAll('meta[name="theorem:uses"]'),
    ].map((meta) => meta.getAttribute('content') ?? ''),
  )

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Elements that start a new line when a page is read as text. */
const LINE = new Set(
  'address article aside blockquote br dd div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tr ul'.split(
    ' ',
  ),
)

/**
 * A snapshot's text, as a person would read it down the page: a line for
 * each block and table row, and a space between the things on a line.
 */
function renderedOf(snapshot: string): AppInspection['rendered'] {
  const page = new DOMParser().parseFromString(snapshot, 'text/html')
  for (const hidden of page.body.querySelectorAll('script, style, template'))
    hidden.remove()
  const elements = [...page.body.querySelectorAll('*')]
  // textContent runs neighbours together: a table's cells, a list's items.
  for (const element of elements)
    element.after(page.createTextNode(LINE.has(element.localName) ? '\n' : ' '))
  const text = page.body.textContent
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  return { text: text.slice(0, MAX_RENDERED_TEXT), elements: elements.length }
}

/**
 * Runs an App's page where nobody sees it and nothing it does lasts: off
 * screen, with no network, its state kept in the frame and its databases in
 * memory. Returns what it threw and what it showed.
 */
async function run(
  html: string,
  page: string,
  runMs: number,
): Promise<{
  problems: Array<AppProblem>
  ranMs: number
  rendered?: AppInspection['rendered']
}> {
  const problems: Array<AppProblem> = []
  let snapshot: string | undefined
  const build = hosted.hostedBuild(page)
  const state = pinnedAppState(null)
  await state.ready
  // A name no App has, so the run can never open an App's own records.
  const databases = documentAppDatabases(`check-${crypto.randomUUID()}`, {
    open: openInMemory,
  })
  const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }))
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', BLOCK_SANDBOX)
  frame.referrerPolicy = 'no-referrer'
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  // Laid out at a real size, so the App measures what it would on screen.
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:1024px;height:768px;visibility:hidden;pointer-events:none;border:0'
  const connection = new FrameConnection(frame, {
    ...pinnedAppHost(
      html,
      'check',
      declarationsOf(html).capabilities,
      state.state,
      databases,
    ),
    onError: (error: FrameError) => {
      problems.push(traceFrameError(error, build))
    },
    onSnapshot: (copy: string) => {
      snapshot = copy
    },
  })
  frame.src = url
  document.body.append(frame)
  const started = performance.now()
  try {
    const connected = await Promise.race([
      connection.connected.then(
        () => true,
        () => false,
      ),
      wait(CONNECT_MS).then(() => false),
    ])
    if (!connected)
      problems.push({
        kind: 'runtime',
        message: 'The App did not start: its page never connected to Theorem.',
      })
    else await wait(runMs)
  } finally {
    connection.dispose()
    databases.dispose()
    state.dispose()
    frame.remove()
    URL.revokeObjectURL(url)
  }
  return {
    problems,
    ranMs: Math.round(performance.now() - started),
    rendered: snapshot === undefined ? undefined : renderedOf(snapshot),
  }
}

/**
 * Checks an App the way opening it would, and reports instead of showing: it
 * is built, its types are checked when it is built from source, and it is run
 * off screen for a moment. A draft and a published revision are checked alike;
 * the check reads nothing but the HTML it is given.
 */
export async function inspectApp(
  html: string,
  options: InspectOptions = {},
): Promise<AppInspection> {
  const runMs = Math.min(
    Math.max(options.runMs ?? DEFAULT_RUN_MS, 0),
    MAX_RUN_MS,
  )
  const found: Array<AppProblem> = []
  const inspection: AppInspection = {
    built: false,
    files: [],
    problems: [],
    omitted: 0,
    typesChecked: false,
    ranMs: 0,
  }
  const finish = (): AppInspection => {
    const unique = found.filter(
      (problem, index) =>
        found.findIndex(
          (other) =>
            other.kind === problem.kind &&
            other.message === problem.message &&
            other.file === problem.file &&
            other.line === problem.line,
        ) === index,
    )
    inspection.problems = unique.slice(0, MAX_PROBLEMS).map((problem) => ({
      ...problem,
      message: problem.message.slice(0, MAX_MESSAGE),
    }))
    inspection.omitted = unique.length - inspection.problems.length
    return inspection
  }

  let page: string
  try {
    const declarations = declarationsOf(html)
    if (declarations.errors.length)
      throw new AppBuildError(
        declarations.errors.map((message) => ({ kind: 'build', message })),
      )
    // A check reaches no network, whatever the App declares.
    page = await hosted.hostedAppDocument(html, undefined, { net: [] })
  } catch (error) {
    if (!(error instanceof AppBuildError)) throw error
    found.push(...error.problems)
    return finish()
  }
  inspection.built = true

  const sources = appSourcesOf(html)
  if (sources) {
    inspection.files = Object.keys(sources.files)
    try {
      found.push(...(await checker.checkInWorker(sources)).problems)
      inspection.typesChecked = true
    } catch (error) {
      inspection.typeCheckError =
        error instanceof Error ? error.message : String(error)
    }
  }

  if (runMs > 0) {
    const ran = await run(html, page, runMs)
    found.push(...ran.problems)
    inspection.ranMs = ran.ranMs
    inspection.rendered = ran.rendered
  }
  return finish()
}
