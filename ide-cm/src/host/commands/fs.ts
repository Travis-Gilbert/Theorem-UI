// SOURCING: the SDK's generated `workspace.files.*` operations (list, stat, read, create, delete,
// rename) answer OpenIDEA's `fs_*` commands; the live stream's `file.changed` events become the
// `fsChanged` events the file tree listens to. The workspace is text-first and has no ranged read,
// no binary create and no per-file size in its listing — each of those is reported as the
// unavailable state it is rather than approximated. See FORK.md and lanes/I02.md ("I01 gaps").

import type { ByteRange, FileEntry, FileProbe } from '@/bindings'
import type { DocumentSession } from '@theoremharness/sdk'
import { failure, unavailable } from '../host'
import { arg, isNumber, isString, type CommandContext, type CommandTable } from './context'

/** The text editor opens a file larger than this read-only, as the desktop backend does. */
export const TOO_LARGE = 2_000_000

/** `workspace.files.list`: every file and directory under the primary root, host-excluded entries omitted. */
interface Listing {
  files?: { path: string; mtime?: number }[]
  directories?: { path: string }[]
}

/** `workspace.files.stat`. */
interface Stat {
  type: 'file' | 'directory' | 'missing'
  size?: number
  mtime_ms?: number
}

/** `workspace.files.read`: UTF-8 text as text, anything else (NUL, invalid UTF-8) as base64. */
interface Contents {
  encoding: 'utf8' | 'base64'
  contents: string
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

const parentOf = (relative: string) => relative.slice(0, Math.max(0, relative.lastIndexOf('/')))
const baseOf = (relative: string) => relative.slice(relative.lastIndexOf('/') + 1)

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
  private listing: Promise<Listing> | undefined
  private pending: { created: Set<string>; modified: Set<string>; removed: Set<string> } | undefined

  constructor(
    private readonly context: CommandContext,
    /** The open document session for an absolute path, whose text is newer than the checkout's. */
    private readonly openSession: (path: string) => DocumentSession | undefined,
  ) {
    const { live } = context.connection
    live.on('file.changed', ({ data }) => {
      this.listing = undefined
      if (data.path === '.') return this.refreshed(this.context.connection.root)
      const path = this.context.connection.toAbsolute(data.path)
      this.record(data.change === 'created' ? 'created' : data.change === 'deleted' ? 'removed' : 'modified', path)
    })
    // A cursor the host cannot continue from: whatever was listed may be wrong, and so may any
    // change the tree was told about. Re-list from the root.
    live.onResync(() => {
      this.listing = undefined
      this.refreshed(this.context.connection.root)
    })
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

  private list(): Promise<Listing> {
    this.listing ??= this.context.connection
      .headers()
      .then((headers) => this.context.connection.client.ide.workspace.filesList({ ...headers, body: {} }) as Promise<Listing>)
      .catch((error) => {
        this.listing = undefined
        throw error
      })
    return this.listing
  }

  private relative(path: string): string {
    const relative = this.context.connection.toRelative(path)
    if (relative === undefined) {
      throw failure('permissionDenied', `${path} is outside the workspace ${this.context.connection.root}`)
    }
    return relative
  }

  private absolute(relative: string): string {
    return this.context.connection.toAbsolute(relative)
  }

  async readDir(path: string): Promise<FileEntry[]> {
    const relative = this.relative(path)
    const listing = await this.list()
    const entries: FileEntry[] = []
    const at = (child: string) => parentOf(child) === relative && child !== ''
    for (const { path: child } of listing.directories ?? []) {
      if (at(child)) entries.push(this.entry(baseOf(child), child, 'dir', 0, null))
    }
    for (const { path: child, mtime } of listing.files ?? []) {
      if (at(child)) entries.push(this.entry(baseOf(child), child, 'file', 0, mtime ?? null))
    }
    if (entries.length === 0 && relative !== '') {
      const stat = await this.stat(relative)
      if (stat.type === 'missing') throw failure('notFound', `${path} does not exist`)
      if (stat.type === 'file') throw failure('invalidInput', `${path} is not a directory`)
    }
    return entries
  }

  private entry(name: string, relative: string, kind: 'file' | 'dir', size: number, mtimeMs: number | null): FileEntry {
    return {
      name,
      path: this.absolute(relative),
      kind,
      size,
      mtimeMs,
      // The host applies no .gitignore and returns the entries it excludes nowhere, so neither flag is ever set.
      ignored: false,
      excluded: false,
      hidden: name.startsWith('.'),
      targetKind: null,
    }
  }

  private async call<T>(request: (headers: Awaited<ReturnType<CommandContext['connection']['headers']>>) => Promise<T>): Promise<T> {
    return request(await this.context.connection.headers())
  }

  private stat(relative: string): Promise<Stat> {
    return this.call(
      (headers) => this.context.connection.client.ide.workspace.filesStat({ ...headers, body: { path: relative } }) as Promise<Stat>,
    )
  }

  private async read(relative: string): Promise<Contents> {
    return this.call(
      (headers) => this.context.connection.client.ide.workspace.filesRead({ ...headers, body: { path: relative } }) as Promise<Contents>,
    )
  }

  async probe(path: string): Promise<FileProbe> {
    const relative = this.relative(path)
    const stat = await this.stat(relative)
    if (stat.type === 'missing') throw failure('notFound', `${path} does not exist`)
    if (stat.type === 'directory') throw failure('invalidInput', `${path} is a directory`)
    const size = stat.size ?? 0
    return { size, binary: (await this.read(relative)).encoding === 'base64', tooLarge: size > TOO_LARGE }
  }

  async readRange(path: string, offset: number, len: number): Promise<ByteRange> {
    // The host reads the whole file; the range is cut here.
    const bytes = bytesOf(await this.read(this.relative(path)))
    return { offset, data: base64Of(bytes.subarray(offset, offset + len)), total: bytes.length }
  }

  async readImage(path: string): Promise<string> {
    const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    const mime = MIME[extension]
    if (!mime) throw failure('invalidInput', `${path} is not an image type this host knows`)
    return `data:${mime};base64,${base64Of(bytesOf(await this.read(this.relative(path))))}`
  }

  async readText(path: string): Promise<string> {
    // An open document's text is what the user sees; the checkout may be behind it.
    const open = this.openSession(path)
    if (open) return open.text
    const file = await this.read(this.relative(path))
    if (file.encoding === 'base64') throw failure('invalidInput', `${path} is not a text file`)
    return file.contents
  }

  private async requireMissing(relative: string, path: string): Promise<void> {
    if ((await this.stat(relative)).type !== 'missing') throw failure('alreadyExists', `${path} already exists`)
  }

  async createFile(path: string, contents: string): Promise<null> {
    const relative = this.relative(path)
    if (relative === '') throw failure('invalidInput', `${path} is the project root`)
    await this.requireMissing(relative, path)
    await this.call((headers) => this.context.connection.client.ide.workspace.filesCreate({ ...headers, body: { path: relative, contents } }))
    this.listing = undefined
    return null
  }

  async createFileBytes(path: string, data: number[]): Promise<null> {
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(data))
    } catch {
      throw unavailable('Creating a binary file', 'the workspace accepts text files only')
    }
    if (text.includes('\0')) throw unavailable('Creating a binary file', 'the workspace accepts text files only')
    return this.createFile(path, text)
  }

  async createDir(path: string): Promise<null> {
    const relative = this.relative(path)
    if (relative === '') throw failure('invalidInput', `${path} is the project root`)
    await this.requireMissing(relative, path)
    await this.call((headers) =>
      this.context.connection.client.ide.workspace.filesCreate({ ...headers, body: { path: relative, directory: true } }),
    )
    this.listing = undefined
    return null
  }

  async rename(from: string, to: string): Promise<null> {
    const source = this.relative(from)
    const target = this.relative(to)
    if (source === '' || target === '') throw failure('invalidInput', 'the project root cannot be renamed')
    if ((await this.stat(source)).type === 'missing') throw failure('notFound', `${from} does not exist`)
    await this.requireMissing(target, to)
    await this.call((headers) =>
      this.context.connection.client.ide.workspace.filesRename({ ...headers, body: { from: source, to: target } }),
    )
    this.listing = undefined
    return null
  }

  async delete(path: string): Promise<null> {
    const relative = this.relative(path)
    if (relative === '') throw failure('invalidInput', `${path} is the project root`)
    await this.call((headers) => this.context.connection.client.ide.workspace.filesDelete({ ...headers, body: { path: relative } }))
    this.listing = undefined
    return null
  }

  /** Copy a file, or a directory with everything under it. Text only: the workspace has no binary create. */
  async copy(from: string, to: string): Promise<null> {
    const source = this.relative(from)
    const target = this.relative(to)
    const stat = await this.stat(source)
    if (stat.type === 'missing') throw failure('notFound', `${from} does not exist`)
    await this.requireMissing(target, to)
    if (stat.type === 'file') {
      const file = await this.read(source)
      if (file.encoding === 'base64') throw unavailable('Copying a binary file', 'the workspace accepts text files only')
      return this.createFile(to, file.contents)
    }
    await this.createDir(to)
    const listing = await this.list()
    const under = (path: string) => path.startsWith(`${source}/`)
    for (const { path } of listing.directories ?? []) {
      if (under(path)) await this.createDir(this.absolute(`${target}/${path.slice(source.length + 1)}`))
    }
    for (const { path } of listing.files ?? []) {
      if (under(path)) await this.copy(this.absolute(path), this.absolute(`${target}/${path.slice(source.length + 1)}`))
    }
    return null
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
    fs_create_file: (args) => files.createFile(arg(args, 'path', isString), ''),
    fs_create_file_bytes: (args) =>
      files.createFileBytes(arg(args, 'path', isString), arg(args, 'data', (v): v is number[] => Array.isArray(v))),
    fs_create_dir: (args) => files.createDir(arg(args, 'path', isString)),
    fs_rename: (args) => files.rename(arg(args, 'from', isString), arg(args, 'to', isString)),
    fs_delete: (args) => files.delete(arg(args, 'path', isString)),
    fs_copy: (args) => files.copy(arg(args, 'from', isString), arg(args, 'to', isString)),
    fs_set_writable: () => {
      throw unavailable('Changing a file’s write permission', 'the workspace host does not expose file modes')
    },
    // A reference written in a document that points at another file: no resolver in the host yet.
    fs_resolve_reference: async () => null,
    // A browser clipboard cannot carry a list of files; the tree pastes through fs_copy.
    clipboard_file_list: async () => [],
    clipboard_has_files: async () => false,
    clipboard_set_file_list: async () => false,
  }
}
