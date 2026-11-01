// SOURCING: the workspace host's `search.query` (view `text`, with `regex`, `case_sensitive`,
// `whole_word`, and the file masks as `include` and `exclude`), `search.cancel` and
// `search.replacePreview` (for the one file previewed, as `path`), through the SDK's `ide.search`
// methods, answer OpenIDEA's Find in Files commands. The host matches with ripgrep's engine
// (`grep-regex`), applies the masks with the `ignore` crate's overrides, and reads an open
// document's session text in place of the file. Its columns, `ranges`, `text_offset` and the
// preview's `edits`, count Unicode scalars, which the SDK's `scalarToUtf16` turns into the UTF-16
// columns the frontend draws, and CodeMirror's `Text` turns offsets into lines as the editor counts
// them. What the host has no argument for (named and pattern scopes, the comments-and-strings
// filter, preserve case) and the writing half of Replace in Files answer as the unavailable state
// they are.

import { Text } from '@codemirror/state'
import { scalarToUtf16 } from '@theoremharness/sdk'
import type { FileMatches, LineMatch, Pos, ReplacePreview, SearchQuery, SearchSummary } from '@/bindings'
import { failure, unavailable, type HostChannel } from '../host'
import { arg, isBoolean, isChannel, isNumber, isString, type CommandContext, type CommandTable } from './context'

/** Files the host scans per `search.query` call. A cancel is seen between calls. */
export const FILES_PER_CALL = 200
/** `maxMatches: 0` means this many, as the desktop backend reads it. */
const DEFAULT_MAX_MATCHES = 10_000

type SearchEvent = { type: 'file'; file: FileMatches } | { type: 'done'; summary: SearchSummary }

/** A `search.query` text row: 1-based `line`, `ranges` in scalars within `text`, `text_offset` the scalars cut before it. */
interface TextRow {
  kind: 'text'
  path: string
  line: number
  text: string
  ranges: { start: number; end: number }[]
  text_offset: number
}

interface QueryAnswer {
  id: string
  complete: boolean
  cancelled: boolean
  results: (TextRow | { kind: string })[]
}

/** One run of touched lines; `edits` are scalar offsets into the whole text the host read (`source`). */
interface ReplacementRow {
  path: string
  line: number
  before: string
  edits: { start: number; end: number; text: string }[]
  source: 'session' | 'disk'
}

const isQuery = (v: unknown): v is SearchQuery => {
  const q = v as SearchQuery | null
  return typeof q === 'object' && q !== null && isString(q.pattern) && Array.isArray(q.include) && typeof q.scope === 'object'
}

const isPositions = (v: unknown): v is Pos[] | null =>
  v === null || (Array.isArray(v) && v.every((p: unknown) => typeof p === 'object' && p !== null && isNumber((p as Pos).line) && isNumber((p as Pos).col)))

const flags = (query: SearchQuery) => ({ regex: query.isRegex, case_sensitive: query.caseSensitive, whole_word: query.wholeWord })

/**
 * The frontend's file masks as the host takes them. The host splits an entry at its commas and
 * reads a leading `!` as a move to the other list, as OpenIDEA's own masks do, so they pass as typed.
 */
const masks = (query: SearchQuery) => ({ include: query.include, exclude: query.exclude })

/** What the host's search has no argument for: refused, never searched without. */
function refuseUnsupported(query: SearchQuery): void {
  if (query.context !== undefined && query.context !== 'any') {
    throw unavailable('Searching only in or outside comments and strings', 'the workspace host’s search does not know where they are')
  }
  if (query.scope.kind === 'fileSet' || query.scope.kind === 'pattern') {
    throw unavailable('Searching a named or custom scope', 'the workspace host has no project file sets or scope patterns')
  }
}

/** A row's line as the frontend's `LineMatch`. Exact in UTF-16 except `textOffset`, which see. */
function lineMatch(row: TextRow): LineMatch {
  return {
    line: row.line - 1,
    text: row.text,
    ranges: row.ranges.map(({ start, end }) => [scalarToUtf16(row.text, start), scalarToUtf16(row.text, end)]),
    // The host counts the scalars it cut from a line longer than 500 before the window. That is the
    // UTF-16 count unless the cut part holds characters outside the Basic Multilingual Plane, which
    // only the whole line would tell; such a match's column is short by one per such character.
    textOffset: row.text_offset,
  }
}

const count = (matches: LineMatch[]) => matches.reduce((sum, m) => sum + m.ranges.length, 0)

/** The first `room` matches of a file, cutting a line's ranges if the limit falls inside it. */
function within(matches: LineMatch[], room: number): LineMatch[] {
  const kept: LineMatch[] = []
  for (const match of matches) {
    if (room <= 0) break
    const ranges = match.ranges.slice(0, room)
    kept.push(ranges.length === match.ranges.length ? match : { ...match, ranges })
    room -= ranges.length
  }
  return kept
}

export class WorkspaceSearch {
  /** Searches in flight, by the frontend's request id. */
  private readonly running = new Map<number, { cancelled: boolean }>()

  constructor(
    private readonly context: CommandContext,
    /** The text of the document open on this page for an absolute path, unsaved edits included. */
    private readonly openText: (path: string) => string | undefined,
  ) {}

  private get api() {
    return this.context.connection.client.ide.search
  }

  private async query(body: Record<string, unknown>): Promise<QueryAnswer> {
    return (await this.api.query({ ...(await this.context.connection.headers()), body })) as QueryAnswer
  }

  /** Drop the host's job. Nothing waits on it: the search it belonged to has its answer already. */
  private dropJob(id: string): void {
    void this.context.connection
      .headers()
      .then((headers) => this.api.cancel({ ...headers, body: { id } }))
      .catch((error) => console.warn(`[ide-cm] search.cancel ${id} failed`, error))
  }

  /** A path in the checkout, which is all the host searches. */
  private relativeOf(path: string): string {
    const located = this.context.connection.locate(path)
    if (!located) throw failure('permissionDenied', `${path} is outside the workspace ${this.context.connection.root}`)
    if (located.root !== 'workspace') throw unavailable(`Searching ${path}`, 'Find in Files searches the checkout, not your IDE state')
    return located.relative
  }

  private scopeFilter(query: SearchQuery): (relative: string) => boolean {
    const { scope } = query
    if (scope.kind === 'directory') {
      const dir = this.relativeOf(scope.path)
      return dir === '' ? () => true : (relative) => relative.startsWith(`${dir}/`)
    }
    if (scope.kind === 'files') {
      // Open Files may include a scratch; the host has nothing of it to search, so it is not asked.
      const wanted = new Set(
        scope.paths.flatMap((path) => {
          const located = this.context.connection.locate(path)
          return located?.root === 'workspace' ? [located.relative] : []
        }),
      )
      return (relative) => wanted.has(relative)
    }
    return () => true
  }

  /**
   * Find in Files. Every file's matches and the closing `done` are sent before this resolves: the
   * frontend stops listening shortly after the command returns.
   */
  async start(request: number, query: SearchQuery, events: HostChannel<SearchEvent>): Promise<null> {
    const started = Date.now()
    refuseUnsupported(query)
    const inScope = this.scopeFilter(query)
    const max = query.maxMatches > 0 ? query.maxMatches : DEFAULT_MAX_MATCHES
    const summary: SearchSummary = { files: 0, matches: 0, limitHit: false, cancelled: false, elapsedMs: 0 }
    const run = { cancelled: false }
    this.running.set(request, run)
    try {
      if (query.pattern !== '') {
        let answer = await this.query({ query: query.pattern, view: 'text', ...flags(query), ...masks(query), limit: FILES_PER_CALL })
        for (;;) {
          for (const file of this.files(answer.results, inScope)) {
            // A match beyond the limit exists: the search stops here and says so.
            if (summary.matches >= max) {
              summary.limitHit = true
              break
            }
            const matches = within(file.matches, max - summary.matches)
            events.send({ type: 'file', file: { ...file, matches } })
            summary.files += 1
            summary.matches += count(matches)
            if (count(matches) < count(file.matches)) {
              summary.limitHit = true
              break
            }
          }
          if (answer.complete || answer.cancelled || run.cancelled || summary.limitHit) break
          answer = await this.query({ id: answer.id, limit: FILES_PER_CALL })
        }
        if (!answer.complete) this.dropJob(answer.id)
        summary.cancelled = run.cancelled || answer.cancelled
      }
    } finally {
      this.running.delete(request)
    }
    summary.elapsedMs = Date.now() - started
    events.send({ type: 'done', summary })
    return null
  }

  /** The text rows of one answer as files, in the host's order. A file's rows all come in one answer. */
  private files(results: QueryAnswer['results'], inScope: (relative: string) => boolean): FileMatches[] {
    const byPath = new Map<string, LineMatch[]>()
    for (const row of results) {
      if (row.kind !== 'text') continue
      const text = row as TextRow
      if (!inScope(text.path)) continue
      const matches = byPath.get(text.path) ?? []
      matches.push(lineMatch(text))
      byPath.set(text.path, matches)
    }
    return [...byPath].map(([relPath, matches]) => ({ path: this.context.connection.toAbsolute(relPath), relPath, matches }))
  }

  /** `cancel_request`: a search in flight stops before its next call to the host; any other request has nothing to stop. */
  cancel(request: number): null {
    const run = this.running.get(request)
    if (run) run.cancelled = true
    return null
  }

  /**
   * The query as the host would take it. A regular expression and the file masks are compiled by
   * the host (a zero-file search), so the reason shown is ripgrep's or the glob parser's; a literal
   * is escaped before it is compiled and cannot be refused for its syntax, so with no masks it
   * costs no request.
   */
  async validate(query: SearchQuery): Promise<null> {
    refuseUnsupported(query)
    this.scopeFilter(query)
    const masked = query.include.length > 0 || query.exclude.length > 0
    if (!masked && (!query.isRegex || query.pattern === '')) return null
    const answer = await this.query({ query: query.pattern, view: 'text', ...flags(query), ...masks(query), limit: 0 })
    this.dropJob(answer.id)
    return null
  }

  /**
   * Replace › Preview for one file: its whole text before, the text after, and each replacement as
   * a UTF-16 line and column range. `only` keeps the replacements starting at those positions.
   */
  async replacePreview(query: SearchQuery, replacement: string, preserveCase: boolean, path: string, only: Pos[] | null): Promise<ReplacePreview> {
    if (preserveCase) throw unavailable('Replacing with Preserve case', 'the workspace host inserts the replacement as written')
    refuseUnsupported(query)
    const relative = this.relativeOf(path)
    const answer = (await this.api.replacePreview({
      ...(await this.context.connection.headers()),
      body: { query: query.pattern, replace: replacement, ...flags(query), path: relative },
    })) as { replacements: ReplacementRow[] }
    const rows = answer.replacements.filter((row) => row.path === relative)
    const text = await this.textOf(path, relative, rows)
    const doc = Text.of(text.split('\n'))
    for (const row of rows) {
      const from = row.line >= 1 && row.line <= doc.lines ? doc.line(row.line).from : -1
      if (from < 0 || text.slice(from, from + row.before.length) !== row.before) {
        throw failure('outOfSync', `${path} changed after the host found its replacements; preview again`)
      }
    }
    // Scalar offsets to UTF-16 in one pass: the edits do not overlap, and a scalar is at most two
    // UTF-16 units, so each step converts only the slice between one offset and the next.
    let scalar = 0
    let utf16 = 0
    const toUtf16 = (target: number) => {
      utf16 += scalarToUtf16(text.slice(utf16, utf16 + 2 * (target - scalar)), target - scalar)
      scalar = target
      return utf16
    }
    const pos = (offset: number): Pos => {
      const line = doc.lineAt(offset)
      return { line: line.number - 1, col: offset - line.from }
    }
    const wanted = only && new Set(only.map((p) => `${p.line}:${p.col}`))
    const edits = rows
      .flatMap((row) => row.edits)
      .sort((a, b) => a.start - b.start)
      .map((edit) => ({ from: toUtf16(edit.start), to: toUtf16(edit.end), text: edit.text }))
      .filter((edit) => !wanted || wanted.has(`${pos(edit.from).line}:${pos(edit.from).col}`))
    let after = text
    for (const edit of [...edits].reverse()) after = after.slice(0, edit.from) + edit.text + after.slice(edit.to)
    return {
      before: text,
      after,
      edits: edits.map((edit) => ({ range: { start: pos(edit.from), end: pos(edit.to) }, new_text: edit.text })),
    }
  }

  /**
   * The text the host computed the replacements from: this page's open document if there is one
   * (the frontend waits for its edits to reach the host first), another page's session if the host
   * read one, else the file.
   */
  private async textOf(path: string, relative: string, rows: ReplacementRow[]): Promise<string> {
    const open = this.openText(path)
    if (open !== undefined) return open
    const { connection } = this.context
    if (rows.some((row) => row.source === 'session')) {
      const lease = await connection.acquire(relative)
      try {
        return lease.session.text
      } finally {
        lease.release()
      }
    }
    const file = (await connection.client.ide.workspace.filesRead({ ...(await connection.headers()), body: { path: relative } })) as {
      encoding: 'utf8' | 'base64'
      contents: string
    }
    if (file.encoding !== 'utf8') throw failure('invalidInput', `${path} is not a text file`)
    return file.contents
  }
}

export function searchCommands(search: WorkspaceSearch): CommandTable {
  return {
    search_start: (args) =>
      search.start(arg(args, 'request', isNumber), arg(args, 'query', isQuery), arg(args, 'onEvent', isChannel<SearchEvent>)),
    search_validate: (args) => search.validate(arg(args, 'query', isQuery)),
    replace_preview: (args) =>
      search.replacePreview(
        arg(args, 'query', isQuery),
        arg(args, 'replacement', isString),
        arg(args, 'preserveCase', isBoolean),
        arg(args, 'path', isString),
        arg(args, 'only', isPositions),
      ),
    replace_in_files: () => {
      throw unavailable('Replace in Files', 'this page previews a replace but does not apply one yet, and the host’s replace only previews')
    },
    cancel_request: (args) => search.cancel(arg(args, 'id', isNumber)),
  }
}
