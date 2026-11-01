// FIXTURE (evidence grade: fixture). A fake of the product server's environment surface and the
// workspace host behind it: bootstrap, workspace open, an SSE live stream the test writes to, and
// the `workspace.files.*` and `search.*` operations over in-memory trees. It follows the shapes the
// I04 host answers (apps/theorem-ide-host over theorem-ide-runtime `services/files.rs`,
// `workspace.rs` and `text_search.rs`): a one-directory listing with `ignored`, `excluded`, sizes
// and link targets, directories first in natural order; stat with `probe`, `readonly` and `mode`;
// ranged reads capped at 1 MiB; base64 create; copy and setMode; `root: "state"` for the caller's
// own store; text search rows in Unicode scalars and replace previews as scalar edits of the whole
// text; and every typed refusal as HTTP 409 `{code, message, detail}`, an untyped failure as
// `ide_operation_failed`. Matching uses JavaScript's RegExp, not ripgrep's engine, and any NUL makes
// a file binary (the host also lets a BOM or a UTF-16 sniff call it text). It is not the host, and
// nothing proven here is proven against it.
// Documents follow what the page observed of the real host: the authority (revision, text, log) is
// durable, a session seated in the running process is not, and an edit sent to an unseated
// document is judged against revision 0 (`stale_revision`, `current_revision: 0`).

export interface Frame {
  kind: string
  cursor: string
  data: unknown
}

export const sse = ({ kind, cursor, data }: Frame) =>
  `id: ${cursor}\nevent: ${kind}\ndata: ${JSON.stringify({ cursor, kind, data })}\n\n`

export const hello = (cursor: string): Frame => ({
  kind: 'hello',
  cursor,
  data: { workspace_id: 'demo', epoch: cursor.split(':')[0], cursor, resumed: false },
})

export interface LiveHandle {
  headers: Headers
  push(frame: Frame): void
  end(): void
}

export type Entry = string | Uint8Array

/** A document as the host keeps it: a durable authority and, separately, a seat in the running process. */
export interface FakeDocument {
  id: string
  revision: number
  text: string
  seated: boolean
  log: { revision: number; operation_id: string; edits: { start: number; end: number; insert: string; removed: string }[] }[]
}

/** A shell session as the host keeps it: a byte log with absolute offsets. */
export interface FakeTerminal {
  id: string
  /** The retained log; bytes before `start` have been dropped, as a bounded buffer drops them. */
  log: Uint8Array
  start: number
  inputs: string[]
  size: { cols: number; rows: number }
  attachments: number
  closed: boolean
  /** The host process that ran this shell is gone: shells do not survive it. */
  dead: boolean
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

/** A path through one of these is excluded, and so ignored, as the host's defaults have it. */
const DEFAULT_EXCLUDES = ['.git', 'target', 'node_modules', 'dist']
/** The host's cap on one ranged read. */
export const MAX_RANGE = 1 << 20
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/**
 * A typed refusal, as the host sends every one: its `message` is the runtime error's display,
 * which repeats the code (`refused [not_found]: x does not exist`; observed live-local).
 */
const refuse = (code: string, message: string, detail: unknown = null) =>
  Response.json({ code, message: `refused [${code}]: ${message}`, detail }, { status: 409 })
/** What the host sends for a failure it has no code for: the runtime's sentence alone. */
const failed = (message: string) => Response.json({ code: 'ide_operation_failed', message, detail: null }, { status: 409 })

const bytesOf = (entry: Entry) => (typeof entry === 'string' ? new TextEncoder().encode(entry) : entry)

/** The entry as text the way the host reads it: UTF-8 with no NUL, else none. */
function textOf(entry: Entry): string | undefined {
  if (typeof entry === 'string') return entry.includes('\0') ? undefined : entry
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(entry)
    return text.includes('\0') ? undefined : text
  } catch {
    return undefined
  }
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
/** The number of scalars in the first `utf16` units of `text`. */
const scalarsIn = (text: string, utf16: number) => [...text.slice(0, utf16)].length

export function fakeServer(initial: Record<string, Entry | null> = {}) {
  /** Files by workspace-relative path; a `null` entry is a directory. */
  const tree = new Map<string, Entry | null>(Object.entries(initial))
  /** The caller's own store (`root: "state"`), by path under it; the product server names the caller. */
  const state = new Map<string, Entry | null>()
  /** What the tree alone cannot say. */
  const files = {
    /** Workspace paths the ignore files hide (a directory hides what is under it). */
    ignored: new Set<string>(),
    /** Workspace symlinks, by path: the kind each resolves to, `null` when dangling. */
    links: new Map<string, 'file' | 'directory' | null>(),
    /** Permission bits by `<root>:<path>`; a file without one is 0o644, a directory 0o755. */
    modes: new Map<string, number>(),
    /** Files whose head cannot be read, so a probe cannot tell text from binary. */
    unreadable: new Set<string>(),
    /** False: the host has no state store bound (`state_unavailable`). */
    stateBound: true,
  }
  /** Search jobs by id. The host keeps them too, complete or cancelled, until it exits. */
  const searches = new Map<string, { remaining: string[]; cancelled: boolean; pattern: RegExp | undefined; view: string }>()
  let searchIds = 0
  const lives: LiveHandle[] = []
  const opens: Headers[] = []
  const operations: { name: string; body: any; csrf: string | null }[] = []
  const terminals: FakeTerminal[] = []
  const encoder = new TextEncoder()
  let sequence = 1000
  const documents = new Map<string, FakeDocument>()
  /** More edits than this means a client is retrying without end: refuse for good so it stops. */
  let editsSeen = 0
  const EDIT_STORM = 200
  /** False from a host restart until the workspace is asked for again. */
  let workspaceOpen = true
  let csrfToken = 'csrf-9'
  const emit = (kind: string, data: unknown) => {
    const cursor = `ep1:${(sequence += 1)}`
    for (const live of lives) live.push({ kind, cursor, data })
  }

  const parents = (path: string) => {
    const out: string[] = []
    for (let i = path.indexOf('/'); i >= 0; i = path.indexOf('/', i + 1)) out.push(path.slice(0, i))
    return out
  }
  const listing = () => {
    const directories = new Set<string>()
    for (const [path, entry] of tree) {
      for (const parent of parents(path)) directories.add(parent)
      if (entry === null) directories.add(path)
    }
    return {
      roots: ['.'],
      files: [...tree].filter(([, e]) => e !== null).map(([path]) => ({ path, kind: 'file', mtime: 1000 })),
      directories: [...directories].map((path) => ({ path, kind: 'directory' })),
      revealed: [],
      excludes: [],
      root: 'workspace',
    }
  }
  const isDirectoryIn = (map: Map<string, Entry | null>, path: string) =>
    path === '' || map.get(path) === null || [...map.keys()].some((p) => p.startsWith(`${path}/`))
  const existsIn = (map: Map<string, Entry | null>, path: string) => map.has(path) || isDirectoryIn(map, path)

  type Root = { name: 'workspace' | 'state'; map: Map<string, Entry | null> }
  /** The tree `root` selects; a refusal is thrown as its response. */
  const rootOf = (body: any): Root => {
    if (body.root === undefined || body.root === null || body.root === 'workspace') return { name: 'workspace', map: tree }
    if (body.root !== 'state') throw refuse('unknown_root', 'root is "workspace" or "state"', { root: body.root })
    if (!files.stateBound) {
      throw refuse('state_unavailable', 'no per-user state store is bound; the environment host binds one', { root: 'state' })
    }
    return { name: 'state', map: state }
  }
  const modeOf = (root: Root, path: string, directory: boolean) => files.modes.get(`${root.name}:${path}`) ?? (directory ? 0o755 : 0o644)
  const statOf = (root: Root, path: string, probe: boolean) => {
    if (!existsIn(root.map, path)) return { path, type: 'missing', root: root.name }
    const entry = root.map.get(path)
    const directory = entry === null || entry === undefined
    const mode = modeOf(root, path, directory)
    const stat: Record<string, unknown> = {
      path,
      type: directory ? 'directory' : 'file',
      size: directory ? 0 : bytesOf(entry).length,
      mtime_ms: 1000,
      readonly: (mode & 0o200) === 0,
      mode,
      root: root.name,
    }
    if (probe && !directory) stat.binary = files.unreadable.has(path) ? null : textOf(entry) === undefined
    return stat
  }
  const excludedPath = (path: string) => path.split('/').some((part) => DEFAULT_EXCLUDES.includes(part))
  const ignoredPath = (path: string) => excludedPath(path) || [path, ...parents(path)].some((p) => files.ignored.has(p))

  /** One directory level, directories first, each half in natural order. */
  const listDirectory = (root: Root, dir: string) => {
    if (!isDirectoryIn(root.map, dir)) {
      return root.map.has(dir)
        ? refuse('not_a_directory', `${dir} is not a directory`, { path: dir })
        : refuse('not_found', `${dir} does not exist`, { path: dir })
    }
    const prefix = dir === '' ? '' : `${dir}/`
    const children = new Map<string, boolean>()
    for (const [path, entry] of root.map) {
      if (!path.startsWith(prefix) || path === dir) continue
      const rest = path.slice(prefix.length)
      const slash = rest.indexOf('/')
      const name = slash < 0 ? rest : rest.slice(0, slash)
      children.set(name, children.get(name) === true || slash >= 0 || entry === null)
    }
    const workspace = root.name === 'workspace'
    const rows = [...children].map(([name, directory]) => {
      const path = prefix + name
      const mode = modeOf(root, path, directory)
      return {
        name,
        path,
        kind: directory ? 'directory' : 'file',
        size: directory ? null : bytesOf(root.map.get(path)!).length,
        mtime_ms: 1000,
        ignored: workspace && ignoredPath(path),
        excluded: workspace && excludedPath(path),
        hidden: name.startsWith('.'),
        readonly: (mode & 0o200) === 0,
        mode,
      } as Record<string, unknown>
    })
    if (workspace) {
      for (const [path, target] of files.links) {
        const name = path.slice(prefix.length)
        if (!path.startsWith(prefix) || name.includes('/')) continue
        rows.push({ name, path, kind: 'symlink', size: 0, mtime_ms: 1000, ignored: ignoredPath(path), excluded: excludedPath(path), hidden: name.startsWith('.'), readonly: false, mode: 0o777, target })
      }
    }
    const isDir = (row: Record<string, unknown>) => row.kind === 'directory' || row.target === 'directory'
    rows.sort((a, b) => Number(isDir(b)) - Number(isDir(a)) || natural.compare(a.name as string, b.name as string))
    return Response.json({ path: dir, root: root.name, entries: rows })
  }

  const readFile = (root: Root, body: any) => {
    const entry = root.map.get(body.path)
    if (entry === undefined || entry === null) return failed(`${body.path} is not a file`)
    const bytes = bytesOf(entry)
    if (body.offset == null && body.length == null) {
      const text = textOf(entry)
      return Response.json({
        path: body.path,
        ...(text === undefined ? { encoding: 'base64', contents: base64(bytes) } : { encoding: 'utf8', contents: text }),
        size: bytes.length,
        mtime_ms: 1000,
        root: root.name,
      })
    }
    for (const key of ['offset', 'length']) {
      const value = body[key]
      if (value != null && !(Number.isInteger(value) && value >= 0)) {
        return refuse('invalid_range', `${key} is a non-negative byte count`, { [key]: value })
      }
    }
    const offset: number = body.offset ?? 0
    const range = bytes.subarray(offset, offset + Math.min(body.length ?? MAX_RANGE, MAX_RANGE))
    return Response.json({
      path: body.path,
      encoding: 'base64',
      contents: base64(range),
      offset,
      length: range.length,
      total: bytes.length,
      eof: offset + range.length >= bytes.length,
      mtime_ms: 1000,
      root: root.name,
    })
  }

  const createFile = (root: Root, body: any) => {
    if (body.directory) {
      root.map.set(body.path, null)
    } else if (body.encoding === 'base64') {
      let bytes: Uint8Array
      try {
        bytes = Uint8Array.from(atob(body.contents ?? ''), (c) => c.charCodeAt(0))
      } catch (error) {
        return refuse('invalid_contents', `contents is not base64: ${(error as Error).message}`, { encoding: 'base64' })
      }
      root.map.set(body.path, bytes)
    } else if (body.encoding === undefined || body.encoding === 'utf8') {
      root.map.set(body.path, body.contents ?? '')
    } else {
      return refuse('unknown_encoding', 'encoding is "utf8" or "base64"', { encoding: body.encoding })
    }
    if (body.mode != null) files.modes.set(`${root.name}:${body.path}`, body.mode)
    return Response.json({ created: true, path: body.path, root: root.name })
  }

  const copyEntry = (root: Root, body: any) => {
    const { from, to } = body as { from: string; to: string }
    if (!existsIn(root.map, from)) return refuse('not_found', `${from} does not exist`, { from })
    if (existsIn(root.map, to)) return refuse('already_exists', `${to} already exists`, { to })
    if (to.startsWith(`${from}/`)) return refuse('copy_into_itself', `${to} is inside ${from}`, { from, to })
    for (const [path, entry] of [...root.map]) {
      if (path === from || path.startsWith(`${from}/`)) root.map.set(to + path.slice(from.length), entry instanceof Uint8Array ? entry.slice() : entry)
    }
    return Response.json({ copied: true, from, to, directory: isDirectoryIn(root.map, to), root: root.name })
  }

  /** Exactly one of `mode` or `writable`; IDEA's read-only toggle clears or sets the write bits. */
  const setMode = (root: Root, body: any) => {
    const { path } = body as { path: string }
    const mode = body.mode
    if (mode != null && !(Number.isInteger(mode) && mode >= 0 && mode <= 0o777)) {
      return refuse('invalid_mode', 'mode is permission bits from 0 to 0o777 (511)', { mode })
    }
    if (!existsIn(root.map, path)) return refuse('not_found', `${path} does not exist`, { path })
    const writable = typeof body.writable === 'boolean' ? (body.writable as boolean) : undefined
    if ((mode == null) === (writable === undefined)) return refuse('invalid_mode', 'setMode takes exactly one of mode or writable', { path })
    const directory = root.map.get(path) == null
    const current = modeOf(root, path, directory)
    files.modes.set(`${root.name}:${path}`, mode ?? (writable ? current | 0o200 : current & ~0o222))
    return Response.json(statOf(root, path, false))
  }

  /** The text the host searches for a workspace file: an open session's, else the file's if it is text. */
  const sessionText = (path: string) => {
    const d = documents.get(path)
    return d?.seated ? d.text : undefined
  }
  const searchText = (path: string) => {
    const entry = tree.get(path)
    return sessionText(path) ?? (entry == null ? undefined : textOf(entry))
  }
  const searchPaths = () =>
    [...tree]
      .filter(([path, entry]) => entry !== null && !excludedPath(path))
      .map(([path]) => path)
      .sort()
  /** The query compiled as the host would (`regex`, `case_sensitive` default true, `whole_word`); a bad one is thrown refused. */
  const compile = (body: any): RegExp | undefined => {
    if (body.query === '') return undefined
    const source = body.regex ? body.query : escapeRegExp(body.query)
    try {
      return new RegExp(body.whole_word ? `\\b(?:${source})\\b` : source, `gu${body.case_sensitive === false ? 'i' : ''}`)
    } catch (error) {
      // The engine's own reason, without the prefix JavaScript gives it (the host words its sentence itself).
      const reason = (error as Error).message.replace(/^Invalid regular expression: (?:\/.*\/[a-z]*: )?/, '')
      const message = body.regex ? `Invalid regular expression: ${reason}` : `Invalid search string: ${reason}`
      throw refuse('invalid_pattern', message, { pattern: body.query, regex: Boolean(body.regex), reason })
    }
  }
  /** One row per matched line; ranges are scalars within `text`. A line over 500 scalars is windowed from 100 before its first match. */
  const textRows = (path: string, text: string, pattern: RegExp) =>
    text.split('\n').flatMap((raw, index) => {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      const spans = [...line.matchAll(pattern)].filter((m) => m[0] !== '').map((m) => [scalarsIn(line, m.index), scalarsIn(line, m.index + m[0].length)] as const)
      if (spans.length === 0) return []
      const scalars = [...line]
      const offset = scalars.length > 500 ? Math.max(0, spans[0]![0] - 100) : 0
      const window = offset === 0 && scalars.length <= 500 ? line : scalars.slice(offset, offset + 500).join('')
      const ranges = spans
        .filter(([start, end]) => start >= offset && end <= offset + 500)
        .map(([start, end]) => ({ start: start - offset, end: end - offset, unit: 'scalar' }))
      return [{ key: `text:${path}:${index + 1}`, kind: 'text', label: `${path}:${index + 1}:${window}`, path, line: index + 1, text: window, ranges, text_offset: offset }]
    })
  const search = (body: any) => {
    const limit: number = typeof body.limit === 'number' ? body.limit : Number.POSITIVE_INFINITY
    let id: string | undefined = body.id
    let job = id === undefined ? undefined : searches.get(id)
    if (id !== undefined) {
      if (!job) return failed(`unknown search id ${id}`)
      if (job.cancelled) return Response.json({ id, complete: true, cancelled: true, view: job.view, results: [] })
    } else {
      if (typeof body.query !== 'string') return failed('query required')
      id = `search:${(searchIds += 1)}`
      job = { remaining: searchPaths(), cancelled: false, pattern: compile(body), view: body.view ?? 'all' }
      searches.set(id, job)
    }
    const { remaining, pattern, view } = job
    const results: unknown[] = []
    for (let scanned = 0; scanned < limit && remaining.length > 0; scanned++) {
      const path = remaining.shift()!
      const text = searchText(path)
      if (text !== undefined && pattern) results.push(...textRows(path, text, pattern))
    }
    return Response.json({ id, complete: remaining.length === 0, cancelled: false, view, results })
  }
  /** The host's replace preview: rows of touched lines, `edits` as scalar offsets into the whole text. */
  const previewRows = (path: string, text: string, pattern: RegExp, template: string, regex: boolean) => {
    const edits = [...text.matchAll(pattern)]
      .filter((m) => m[0] !== '')
      .map((m) => ({ start: m.index, end: m.index + m[0].length, text: regex ? template.replace(/\$(\d+)/g, (_, n) => m[Number(n)] ?? '') : template }))
    const starts = [0]
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1)
    const lineOf = (offset: number) => starts.filter((start) => start <= offset).length - 1
    const contentEnd = (line: number) => {
      let end = line + 1 < starts.length ? starts[line + 1]! - 1 : text.length
      if (end > starts[line]! && text[end - 1] === '\r') end -= 1
      return end
    }
    const lastLine = (edit: { start: number; end: number }) => lineOf(Math.max(edit.start, edit.end - 1))
    const rows = []
    for (let index = 0; index < edits.length; ) {
      const first = lineOf(edits[index]!.start)
      let last = lastLine(edits[index]!)
      let groupEnd = index + 1
      while (groupEnd < edits.length && lineOf(edits[groupEnd]!.start) <= last) last = Math.max(last, lastLine(edits[groupEnd++]!))
      const group = edits.slice(index, groupEnd)
      const spanStart = starts[first]!
      const spanEnd = Math.max(contentEnd(last), ...group.map((e) => e.end))
      let after = ''
      let copied = spanStart
      for (const edit of group) {
        after += text.slice(copied, edit.start) + edit.text
        copied = edit.end
      }
      after += text.slice(copied, spanEnd)
      rows.push({
        path,
        line: first + 1,
        end_line: last + 1,
        before: text.slice(spanStart, spanEnd),
        after,
        edits: group.map((e) => ({ start: scalarsIn(text, e.start), end: scalarsIn(text, e.end), unit: 'scalar', text: e.text })),
        source: sessionText(path) !== undefined ? 'session' : 'disk',
      })
      index = groupEnd
    }
    return rows
  }
  const replacePreview = (body: any) => {
    if (typeof body.query !== 'string') return failed('query required')
    const pattern = compile(body)
    const replacements = pattern
      ? searchPaths().flatMap((path) => {
          const text = searchText(path)
          return text === undefined ? [] : previewRows(path, text, pattern, body.replace ?? '', Boolean(body.regex))
        })
      : []
    return Response.json({ written: false, replacements })
  }

  const docOf = (path: string): FakeDocument => {
    let held = documents.get(path)
    if (!held) {
      const entry = tree.get(path)
      held = { id: `doc_${path}`, revision: 0, text: typeof entry === 'string' ? entry : '', seated: true, log: [] }
      documents.set(path, held)
    }
    return held
  }
  const head = (d: FakeDocument) => ({
    document_id: d.id,
    revision: d.revision,
    text: d.text,
    content_hash: `h${d.revision}`,
    can_undo: false,
    can_redo: false,
  })
  const apply = (d: FakeDocument, edits: { start: number; end: number; insert: string }[], operationId: string) => {
    const scalars = [...d.text]
    const log = edits.map((e) => ({ ...e, removed: scalars.slice(e.start, e.end).join('') }))
    for (const e of [...edits].sort((a, b) => b.start - a.start)) scalars.splice(e.start, e.end - e.start, ...e.insert)
    d.text = scalars.join('')
    d.revision += 1
    d.log.push({ revision: d.revision, operation_id: operationId, edits: log })
  }

  const operate = (name: string, body: any, csrf: string | null): Response => {
    operations.push({ name, body, csrf })
    try {
      return answer(name, body)
    } catch (thrown) {
      if (thrown instanceof Response) return thrown
      throw thrown
    }
  }

  const answer = (name: string, body: any): Response => {
    switch (name) {
      case 'workspace.files.list': {
        const root = rootOf(body)
        return body.path === undefined && root.name === 'workspace' ? Response.json(listing()) : listDirectory(root, body.path ?? '')
      }
      case 'workspace.files.stat':
        return Response.json(statOf(rootOf(body), body.path, body.probe === true))
      case 'workspace.files.read':
        return readFile(rootOf(body), body)
      case 'workspace.files.create':
        return createFile(rootOf(body), body)
      case 'workspace.files.delete': {
        const { map, name: root } = rootOf(body)
        if (root === 'state' && !existsIn(map, body.path)) return refuse('not_found', `${body.path} does not exist`, { path: body.path, root })
        for (const path of [...map.keys()]) if (path === body.path || path.startsWith(`${body.path}/`)) map.delete(path)
        return Response.json({ deleted: true, path: body.path, root })
      }
      case 'workspace.files.rename': {
        const { map, name: root } = rootOf(body)
        for (const [path, entry] of [...map]) {
          if (path === body.from || path.startsWith(`${body.from}/`)) {
            map.delete(path)
            map.set(body.to + path.slice(body.from.length), entry)
          }
        }
        return Response.json({ renamed: true, from: body.from, to: body.to, root })
      }
      case 'workspace.files.copy':
        return copyEntry(rootOf(body), body)
      case 'workspace.files.setMode':
        return setMode(rootOf(body), body)
      case 'search.query':
        return search(body)
      case 'search.cancel': {
        const job = searches.get(body.id)
        if (job) Object.assign(job, { cancelled: true, remaining: [] })
        return Response.json({ cancelled: true, id: body.id ?? null, complete: true })
      }
      case 'search.replacePreview':
        return replacePreview(body)
      case 'terminal.open': {
        const terminal: FakeTerminal = {
          id: `pty-${terminals.length + 1}`,
          log: new Uint8Array(),
          start: 0,
          inputs: [],
          size: { cols: body.cols, rows: body.rows },
          attachments: 1,
          closed: false,
          dead: false,
        }
        terminal.log = encoder.encode(shell.banner)
        terminals.push(terminal)
        return Response.json({ session: terminal.id })
      }
      case 'terminal.input': {
        const terminal = terminals.find((t) => t.id === body.session)
        if (!terminal) return Response.json({ code: 'not_found' }, { status: 404 })
        terminal.inputs.push(body.bytes)
        return Response.json({ session: terminal.id, accepted: true })
      }
      case 'terminal.resize': {
        const terminal = terminals.find((t) => t.id === body.session)
        if (!terminal) return Response.json({ code: 'not_found' }, { status: 404 })
        terminal.size = { cols: body.cols, rows: body.rows }
        return Response.json({ session: terminal.id })
      }
      case 'terminal.attach': {
        const terminal = terminals.find((t) => t.id === body.session)
        // What the live host answered for a session it does not have (observed 2026-11-01, I02): a
        // generic operation failure, not a typed not-found.
        if (!terminal || terminal.dead) {
          return Response.json({ code: 'host_operation_failed', detail: null, message: 'pty session not found' }, { status: 409 })
        }
        const from = body.from_offset ?? 0
        const end = terminal.start + terminal.log.length
        const truncated = from < terminal.start
        const data = truncated ? terminal.log : terminal.log.subarray(from - terminal.start)
        return Response.json({
          session: terminal.id,
          attached: true,
          resync: true,
          formatted: truncated ? 'SCREEN' : '',
          offset_start: truncated ? terminal.start : from,
          offset_end: end,
          data: base64(data),
          truncated,
        })
      }
      case 'terminal.close': {
        const terminal = terminals.find((t) => t.id === body.session)
        if (!terminal) return Response.json({ code: 'not_found' }, { status: 404 })
        terminal.attachments -= 1
        terminal.closed = true
        return Response.json({ session: terminal.id, attachment_closed: true, process_killed: false, session_live: true })
      }
      case 'documents.open': {
        const d = docOf(body.resource_id)
        d.seated = true
        return Response.json(head(d))
      }
      case 'documents.head': {
        const d = [...documents.values()].find((x) => x.id === body.document_id)
        return d ? Response.json(head(d)) : Response.json({ code: 'not_found' }, { status: 404 })
      }
      case 'documents.history': {
        const d = [...documents.values()].find((x) => x.id === body.document_id)
        if (!d) return Response.json({ code: 'not_found' }, { status: 404 })
        return Response.json({ document_id: d.id, revisions: d.log.filter((r) => r.revision >= body.from_revision) })
      }
      case 'documents.edit': {
        if ((editsSeen += 1) > EDIT_STORM) return Response.json({ code: 'edit_storm' }, { status: 500 })
        const d = docOf(body.resource_id)
        const current = d.seated ? d.revision : 0
        if (body.base_revision !== current || (!d.seated && d.revision !== 0)) {
          return Response.json(
            {
              code: 'stale_revision',
              detail: { base_revision: body.base_revision, current_revision: current, resource_id: body.resource_id },
              message: `refused [stale_revision]: stale revision ${body.base_revision}, current ${current}`,
            },
            { status: 409 },
          )
        }
        apply(d, body.edits, body.operation_id)
        return Response.json(head(d))
      }
      default:
        return Response.json({ code: 'unknown_operation', name }, { status: 404 })
    }
  }

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const { pathname } = new URL(request.url)
    if (pathname.endsWith('/bootstrap')) {
      return Response.json({ schema: 'theorem-environment/1', tenantId: 't', principalId: 'p', csrfToken })
    }
    const notOpen = () =>
      Response.json({ code: 'workspace_not_open', message: 'Open the workspace before using it' }, { status: 404 })
    if (pathname.endsWith('/live')) {
      if (!workspaceOpen) return notOpen()
      let controller!: ReadableStreamDefaultController<Uint8Array>
      const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) })
      request.signal.addEventListener('abort', () => {
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
      lives.push({
        headers: request.headers,
        push: (frame) => controller.enqueue(encoder.encode(sse(frame))),
        end: () => controller.close(),
      })
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    }
    const operation = /\/operations\/([\w.]+)$/.exec(pathname)
    if (operation && request.method === 'POST') {
      if (!workspaceOpen) return notOpen()
      return operate(operation[1]!, await request.json(), request.headers.get('x-csrf-token'))
    }
    if (pathname.endsWith('/workspaces') && request.method === 'POST') {
      workspaceOpen = true
      opens.push(request.headers)
      return Response.json({ workspace_id: 'demo' })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch

  /** The shell writes: appended to the log and announced on the live stream, as the host does. */
  const shell = {
    sessions: terminals,
    /** What a new shell has already printed (its prompt) by the time `terminal.open` is answered. */
    banner: '',
    write(terminal: FakeTerminal, bytes: Uint8Array | string, announce = true) {
      const chunk = typeof bytes === 'string' ? encoder.encode(bytes) : bytes
      const offset = terminal.start + terminal.log.length
      terminal.log = Uint8Array.from([...terminal.log, ...chunk])
      if (announce) emit('terminal.output', { session: terminal.id, offset, data: base64(chunk) })
    },
    /** The bounded buffer drops everything before `offset`. */
    truncate(terminal: FakeTerminal, offset: number) {
      terminal.log = terminal.log.subarray(offset - terminal.start)
      terminal.start = offset
    },
    exit(terminal: FakeTerminal, code: number | null) {
      emit('terminal.exited', { session: terminal.id, exit_code: code })
    },
  }

  /**
   * The host process restarts: every live stream ends, and the workspace stays on disk but is not
   * open again until the page asks. `csrf` is the token the product server hands out afterwards.
   */
  const restartHost = (csrf = csrfToken) => {
    workspaceOpen = false
    csrfToken = csrf
    for (const d of documents.values()) d.seated = false
    for (const t of terminals) t.dead = true
    for (const live of lives) live.end()
  }

  /** Another writer's edit, accepted by the authority (ASCII, at `at`). */
  const foreignEdit = (path: string, at: number, insert: string) => apply(docOf(path), [{ start: at, end: at, insert }], `foreign-${sequence++}`)
  /** The authority lost its history while the process kept running: it is back to the checkout's text at revision 0. */
  const rollBack = (path: string) => {
    const d = docOf(path)
    const entry = tree.get(path)
    Object.assign(d, { revision: 0, text: typeof entry === 'string' ? entry : '', log: [] })
  }
  /** The process forgot the session (and only that): the authority keeps its revision. */
  const unseat = (path: string) => void (docOf(path).seated = false)

  return { fetchImpl, lives, opens, tree, state, files, searches, operations, shell, restartHost, documents, foreignEdit, rollBack, unseat }
}

export const memoryStorage = () => {
  const held = new Map<string, string>()
  return {
    held,
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
    removeItem: (k: string) => void held.delete(k),
  }
}

export const until = async (check: () => boolean, what = 'condition') => {
  for (let i = 0; i < 400 && !check(); i++) await new Promise((r) => setTimeout(r, 5))
  if (!check()) throw new Error(`timed out waiting for ${what}`)
}
