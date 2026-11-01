// FIXTURE (evidence grade: fixture). A fake of the product server's environment surface and the
// workspace host behind it: bootstrap, workspace open, an SSE live stream the test writes to, and
// the `workspace.files.*` operations over an in-memory tree. It follows the host's documented
// shapes (apps/theorem-ide-host: list `{files, directories}`, stat `{type, size, mtime_ms}`, read
// `{encoding, contents}`); it is not the host, and nothing proven here is proven against it.
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
}

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

export function fakeServer(initial: Record<string, Entry | null> = {}) {
  /** Files by workspace-relative path; a `null` entry is a directory. */
  const tree = new Map<string, Entry | null>(Object.entries(initial))
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
    }
  }
  const isDirectory = (path: string) => tree.get(path) === null || [...tree.keys()].some((p) => p.startsWith(`${path}/`))

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
    switch (name) {
      case 'workspace.files.list':
        return Response.json(listing())
      case 'workspace.files.stat': {
        const entry = tree.get(body.path)
        if (entry === undefined) {
          return Response.json(isDirectory(body.path) ? { type: 'directory', mtime_ms: 1000 } : { type: 'missing' })
        }
        if (entry === null) return Response.json({ type: 'directory', mtime_ms: 1000 })
        return Response.json({ type: 'file', size: typeof entry === 'string' ? encoder.encode(entry).length : entry.length, mtime_ms: 1000 })
      }
      case 'workspace.files.read': {
        const entry = tree.get(body.path)
        if (entry === undefined || entry === null) return Response.json({ code: 'not_found' }, { status: 404 })
        return Response.json(typeof entry === 'string' ? { encoding: 'utf8', contents: entry } : { encoding: 'base64', contents: base64(entry) })
      }
      case 'workspace.files.create':
        tree.set(body.path, body.directory ? null : (body.contents ?? ''))
        return Response.json({})
      case 'workspace.files.delete':
        for (const path of [...tree.keys()]) if (path === body.path || path.startsWith(`${body.path}/`)) tree.delete(path)
        return Response.json({})
      case 'workspace.files.rename': {
        for (const [path, entry] of [...tree]) {
          if (path === body.from || path.startsWith(`${body.from}/`)) {
            tree.delete(path)
            tree.set(body.to + path.slice(body.from.length), entry)
          }
        }
        return Response.json({})
      }
      case 'terminal.open': {
        const terminal: FakeTerminal = {
          id: `pty-${terminals.length + 1}`,
          log: new Uint8Array(),
          start: 0,
          inputs: [],
          size: { cols: body.cols, rows: body.rows },
          attachments: 1,
          closed: false,
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
        if (!terminal) return Response.json({ code: 'not_found' }, { status: 404 })
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

  return { fetchImpl, lives, opens, tree, operations, shell, restartHost, documents, foreignEdit, rollBack, unseat }
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
