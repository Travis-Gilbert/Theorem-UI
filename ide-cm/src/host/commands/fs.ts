// SOURCING: the SDK's generated `workspace.files.*` operations (list, stat, read, create, delete,
// rename) answer OpenIDEA's `fs_*` commands, with the arguments the vendored 0.5.0 schema does not
// name yet (`root`, `probe`, `offset`, `length`, `encoding`) passed through its own
// `additionalBodyParameters`; `workspace.files.copy` and `workspace.files.setMode`, which 0.5.0 has
// no method for, go through `WorkspaceConnection.operate`. The host lists one directory in natural
// order with `ignored`, `excluded`, sizes and link targets, reads a byte range, probes a file's
// head, writes bytes and copies trees, so nothing here approximates any of them. The live stream's
// `file.changed` events become the `fsChanged` events the file tree listens to. A path under the
// connection's state root goes to the caller's own store (`root: "state"`).

import type { ByteRange, EntryKind, FileEntry, FileProbe } from '@/bindings'
import type { FileRoot, Located } from '../connection'
import { failure, unavailable } from '../host'
import { arg, isBoolean, isNumber, isString, type CommandContext, type CommandTable } from './context'

/** The text editor opens a file larger than this read-only, as the desktop backend does. */
export const TOO_LARGE = 2_000_000

/** One row of `workspace.files.list` with a `path`: a single directory, directories first, natural order. */
interface DirectoryEntry {
  name: string
  path: string
  kind: 'file' | 'directory' | 'symlink'
  /** `null` for a directory. */
  size: number | null
  mtime_ms: number | null
  ignored: boolean
  excluded: boolean
  hidden: boolean
  /** For a symlink: the kind it resolves to, `null` when dangling. */
  target?: 'file' | 'directory' | null
}

/** `workspace.files.stat`; `binary` only with `probe: true`, and `null` when the head could not be read. */
interface Stat {
  type: 'file' | 'directory' | 'missing'
  size?: number
  mtime_ms?: number
  readonly?: boolean
  binary?: boolean | null
}

/** `workspace.files.read`: UTF-8 text as text, anything else (NUL, invalid UTF-8) as base64. */
interface Contents {
  encoding: 'utf8' | 'base64'
  contents: string
}

/** A ranged `workspace.files.read`: always base64, `length` capped by the host at 1 MiB. */
interface Range {
  encoding: 'base64'
  contents: string
  offset: number
  total: number
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
}

const KINDS: Record<DirectoryEntry['kind'], EntryKind> = { file: 'file', directory: 'dir', symlink: 'symlink' }

function bytesOf(file: Contents): Uint8Array {
  return file.encoding === 'base64'
    ? Uint8Array.from(atob(file.contents), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(file.contents)
}

function base64Of(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export class WorkspaceFiles {
  private pending: { created: Set<string>; modified: Set<string>; removed: Set<string> } | undefined

  constructor(
    private readonly context: CommandContext,
    /** The text of the document open on this page for an absolute path, which is newer than the stored file's. */
    private readonly openText: (path: string) => string | undefined,
  ) {
    const { live } = context.connection
    live.on('file.changed', ({ data }) => {
      if (data.path === '.') return this.refreshed(this.context.connection.root)
      const path = this.context.connection.toAbsolute(data.path)
      this.record(data.change === 'created' ? 'created' : data.change === 'deleted' ? 'removed' : 'modified', path)
    })
    // A cursor the host cannot continue from: any change the tree was told about may be wrong.
    // Re-read from the root.
    live.onResync(() => this.refreshed(this.context.connection.root))
  }

  /** Batch changes arriving together into one `fsChanged`. */
  private record(kind: 'created' | 'modified' | 'removed', path: string): void {
    if (!this.pending) {
      this.pending = { created: new Set(), modified: new Set(), removed: new Set() }
      setTimeout(() => this.flush(), 50)
    }
    this.pending[kind].add(path)
  }

  private flush(): void {
    const pending = this.pending
    this.pending = undefined
    if (!pending) return
    this.context.emit({
      type: 'fsChanged',
      created: [...pending.created],
      modified: [...pending.modified],
      removed: [...pending.removed],
    })
  }

  /** Tell the tree to re-read `path` (its directory) because events were lost. */
  private refreshed(path: string): void {
    this.record('modified', path)
  }

  private locate(path: string): Located {
    const located = this.context.connection.locate(path)
    if (!located) {
      throw failure('permissionDenied', `${path} is outside the workspace ${this.context.connection.root}`)
    }
    return located
  }

  /** A file or directory below its root: the root itself cannot be created, renamed or removed. */
  private entryOf(path: string): Located {
    const located = this.locate(path)
    if (located.relative === '') throw failure('invalidInput', `${path} is the root of its tree`)
    return located
  }

  private headers() {
    return this.context.connection.headers()
  }

  private get workspace() {
    return this.context.connection.client.ide.workspace
  }

  private async stat({ root, relative }: Located, probe = false): Promise<Stat> {
    return (await this.workspace.filesStat(
      { ...(await this.headers()), body: { path: relative } },
      { additionalBodyParameters: { root, ...(probe ? { probe: true } : {}) } },
    )) as Stat
  }

  private async read({ root, relative }: Located): Promise<Contents> {
    return (await this.workspace.filesRead(
      { ...(await this.headers()), body: { path: relative } },
      { additionalBodyParameters: { root } },
    )) as Contents
  }

  private async create({ root, relative }: Located, fields: Record<string, unknown>): Promise<void> {
    await this.workspace.filesCreate({ ...(await this.headers()), body: { path: relative, root, ...fields } })
  }

  async readDir(path: string): Promise<FileEntry[]> {
    const { root, relative } = this.locate(path)
    const listing = (await this.workspace.filesList({ ...(await this.headers()), body: { path: relative, root } })) as {
      entries: DirectoryEntry[]
    }
    return listing.entries.map((entry) => this.entry(root, entry))
  }

  private entry(root: FileRoot, entry: DirectoryEntry): FileEntry {
    return {
      name: entry.name,
      path: this.context.connection.pathIn(root, entry.path),
      kind: KINDS[entry.kind],
      size: entry.size ?? 0,
      mtimeMs: entry.mtime_ms,
      ignored: entry.ignored,
      excluded: entry.excluded,
      hidden: entry.hidden,
      targetKind: entry.kind === 'symlink' && entry.target ? KINDS[entry.target] : null,
    }
  }

  /** Size and text or binary from the host's look at the file's head: the file is not read here. */
  async probe(path: string): Promise<FileProbe> {
    const stat = await this.stat(this.locate(path), true)
    if (stat.type === 'missing') throw failure('notFound', `${path} does not exist`)
    if (stat.type === 'directory') throw failure('invalidInput', `${path} is a directory`)
    if (typeof stat.binary !== 'boolean') throw failure('io', `${path} could not be read to tell text from binary`)
    const size = stat.size ?? 0
    return { size, binary: stat.binary, tooLarge: size > TOO_LARGE }
  }

  /** Up to `len` bytes from `offset`; the host caps one call at 1 MiB and the caller reads on. */
  async readRange(path: string, offset: number, len: number): Promise<ByteRange> {
    const { root, relative } = this.locate(path)
    const range = (await this.workspace.filesRead(
      { ...(await this.headers()), body: { path: relative } },
      { additionalBodyParameters: { root, offset, length: len } },
    )) as Range
    return { offset: range.offset, data: range.contents, total: range.total }
  }

  async readImage(path: string): Promise<string> {
    const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    const mime = MIME[extension]
    if (!mime) throw failure('invalidInput', `${path} is not an image type this host knows`)
    return `data:${mime};base64,${base64Of(bytesOf(await this.read(this.locate(path))))}`
  }

  async readText(path: string): Promise<string> {
    // An open document's text is what the user sees; the stored file may be behind it.
    const open = this.openText(path)
    if (open !== undefined) return open
    const file = await this.read(this.locate(path))
    if (file.encoding === 'base64') throw failure('invalidInput', `${path} is not a text file`)
    return file.contents
  }

  /** `workspace.files.create` replaces a file that exists; the frontend's create must not. */
  private async requireMissing(located: Located, path: string): Promise<void> {
    if ((await this.stat(located)).type !== 'missing') throw failure('alreadyExists', `${path} already exists`)
  }

  async createFile(path: string): Promise<null> {
    const located = this.entryOf(path)
    await this.requireMissing(located, path)
    await this.create(located, { contents: '' })
    return null
  }

  async createFileBytes(path: string, data: number[]): Promise<null> {
    const located = this.entryOf(path)
    await this.requireMissing(located, path)
    await this.create(located, { contents: base64Of(Uint8Array.from(data)), encoding: 'base64' })
    return null
  }

  async createDir(path: string): Promise<null> {
    const located = this.entryOf(path)
    await this.requireMissing(located, path)
    await this.create(located, { directory: true })
    return null
  }

  /** Both ends in one root: the host moves and copies within a root, never between them. */
  private pair(from: string, to: string, what: string): { root: FileRoot; source: string; target: string } {
    const source = this.entryOf(from)
    const target = this.entryOf(to)
    if (source.root !== target.root) {
      throw unavailable(what, 'the workspace host keeps the checkout and your IDE state apart and moves nothing between them')
    }
    return { root: source.root, source: source.relative, target: target.relative }
  }

  async rename(from: string, to: string): Promise<null> {
    const { root, source, target } = this.pair(from, to, `Moving ${from} to ${to}`)
    if ((await this.stat({ root, relative: source })).type === 'missing') throw failure('notFound', `${from} does not exist`)
    await this.requireMissing({ root, relative: target }, to)
    await this.workspace.filesRename({ ...(await this.headers()), body: { from: source, to: target, root } })
    return null
  }

  async delete(path: string): Promise<null> {
    const { root, relative } = this.entryOf(path)
    await this.workspace.filesDelete({ ...(await this.headers()), body: { path: relative, root } })
    return null
  }

  /** A file, link or tree, bytes and all. The host refuses an existing destination (`already_exists`). */
  async copy(from: string, to: string): Promise<null> {
    const { root, source, target } = this.pair(from, to, `Copying ${from} to ${to}`)
    await this.context.connection.operate('workspace.files.copy', { from: source, to: target, root })
    return null
  }

  /** Toggle Read-only Attribute. Returns whether the file is read-only now, from the host's stat afterwards. */
  async setWritable(path: string, writable: boolean): Promise<boolean> {
    const { root, relative } = this.entryOf(path)
    const stat = await this.context.connection.operate<Stat>('workspace.files.setMode', { path: relative, root, writable })
    if (typeof stat.readonly !== 'boolean') throw failure('protocol', `workspace.files.setMode answered no read-only state for ${path}`)
    return stat.readonly
  }
}

export function fsCommands(files: WorkspaceFiles): CommandTable {
  return {
    fs_read_dir: (args) => files.readDir(arg(args, 'path', isString)),
    fs_probe: (args) => files.probe(arg(args, 'path', isString)),
    fs_read_range: (args) =>
      files.readRange(arg(args, 'path', isString), arg(args, 'offset', isNumber), arg(args, 'len', isNumber)),
    fs_read_image: (args) => files.readImage(arg(args, 'path', isString)),
    fs_read_text: (args) => files.readText(arg(args, 'path', isString)),
    fs_create_file: (args) => files.createFile(arg(args, 'path', isString)),
    fs_create_file_bytes: (args) =>
      files.createFileBytes(arg(args, 'path', isString), arg(args, 'data', (v): v is number[] => Array.isArray(v))),
    fs_create_dir: (args) => files.createDir(arg(args, 'path', isString)),
    fs_rename: (args) => files.rename(arg(args, 'from', isString), arg(args, 'to', isString)),
    fs_delete: (args) => files.delete(arg(args, 'path', isString)),
    fs_copy: (args) => files.copy(arg(args, 'from', isString), arg(args, 'to', isString)),
    fs_set_writable: (args) => files.setWritable(arg(args, 'path', isString), arg(args, 'writable', isBoolean)),
    // A reference written in a document that points at another file: no resolver in the host yet.
    fs_resolve_reference: async () => null,
    // A browser clipboard cannot carry a list of files; the tree pastes through fs_copy.
    clipboard_file_list: async () => [],
    clipboard_has_files: async () => false,
    clipboard_set_file_list: async () => false,
  }
}
