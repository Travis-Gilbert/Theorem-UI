// SOURCING: hand-rolled. The contract between the folder workspace service
// (plan D16) and the views that use it (handlers, live blocks, the file tree).
// It is this app's own domain model; no library defines it.

/** `ws_<ULID>`, kept in the folder at `.theorem/workspace.json`. */
export type WorkspaceId = string

/** `vf_<ULID>`, kept in the folder at `.theorem/ids.json` (plan D8). */
export type EntryId = string

/** Plan D12. Desktop workspaces start `LocalOnly`. */
export type ReplicationPolicy = 'LocalOnly' | 'Synced' | 'ConnectedLive'

export interface WorkspaceSummary {
  id: WorkspaceId
  name: string
  /** Absolute path of the folder on this machine. */
  path: string
  /**
   * Whether the person trusts this folder's code (plan D9). Kept in the app
   * data directory, never in the folder, so a folder cannot arrive trusted.
   */
  trusted: boolean
  policy: ReplicationPolicy
}

export interface WorkspaceEntry {
  id: EntryId
  /** POSIX path relative to the workspace root, without a leading slash. */
  path: string
  kind: 'file' | 'directory'
  size: number
  mtimeMs: number
}

export interface FileContent {
  bytes: Uint8Array
  /** SHA-256 of the bytes, lowercase hex. */
  hash: string
}

/** Who made a change: Theorem UI itself, or something outside it. */
export type ChangeOrigin = 'app' | 'external'

export type WorkspaceEvent =
  | { type: 'created'; entry: WorkspaceEntry; origin: ChangeOrigin }
  | {
      type: 'changed'
      entry: WorkspaceEntry
      hash: string
      origin: ChangeOrigin
    }
  | { type: 'deleted'; id: EntryId; path: string; origin: ChangeOrigin }
  | {
      type: 'renamed'
      id: EntryId
      from: string
      to: string
      origin: ChangeOrigin
    }
  /** The index has caught up with every change so far. */
  | { type: 'indexed' }
  /**
   * Events may have been missed (the event stream reconnected, or ids changed
   * outside Theorem): refetch the tree and anything derived from it.
   */
  | { type: 'resync' }

export interface WorkspaceLink {
  /** The note that holds the link. */
  from: string
  /** The target as written, without heading or block part. */
  target: string
  /** The path the target resolves to, or null when it resolves to nothing. */
  resolved: string | null
  kind: 'wikilink' | 'markdown' | 'embed'
  heading?: string
  /** A block id from `#^id`. */
  block?: string
  /** 1-based line of the link in `from`. */
  line: number
}

export interface SearchHit {
  path: string
  title: string
  /** Matched text with the matches wrapped in `<mark>`. */
  snippet: string
  score: number
}

/** Thrown when a write's `expectedHash` does not match the file on disk. */
export class WorkspaceConflictError extends Error {
  constructor(
    readonly path: string,
    readonly currentHash: string | null,
  ) {
    super(`${path} changed on disk`)
    this.name = 'WorkspaceConflictError'
  }
}

/**
 * One open workspace. The desktop implementation talks to the local server's
 * workspace routes; the web deployment's later implementation reads a synced
 * copy in OPFS (plan D12). Paths are workspace-relative POSIX paths.
 */
export interface WorkspaceClient {
  readonly workspace: WorkspaceSummary
  tree(): Promise<Array<WorkspaceEntry>>
  read(path: string): Promise<FileContent>
  readText(path: string): Promise<{ text: string; hash: string }>
  /**
   * Write atomically. `expectedHash` guards against overwriting a change made
   * elsewhere: a hash must match the file on disk, and `null` means the file
   * must not exist yet. On a mismatch it throws `WorkspaceConflictError`.
   */
  write(
    path: string,
    data: string | Uint8Array,
    options?: { expectedHash?: string | null },
  ): Promise<{ hash: string }>
  mkdir(path: string): Promise<void>
  /** Rename or move. The entry keeps its id and links to it are rewritten. */
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  /** Resolve a link target as written in `fromPath` to a path, Obsidian-style. */
  resolve(target: string, fromPath: string): Promise<string | null>
  links(path: string): Promise<Array<WorkspaceLink>>
  backlinks(path: string): Promise<Array<WorkspaceLink>>
  search(query: string, options?: { limit?: number }): Promise<Array<SearchHit>>
  tags(): Promise<Array<{ tag: string; count: number }>>
  /** Frontmatter properties of a Markdown file. */
  properties(path: string): Promise<Record<string, unknown>>
  setTrusted(trusted: boolean): Promise<void>
  /** Returns an unsubscribe function. */
  subscribe(listener: (event: WorkspaceEvent) => void): () => void
}
