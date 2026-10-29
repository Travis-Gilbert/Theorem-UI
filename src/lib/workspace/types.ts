// SOURCING: hand-rolled. The contract between the folder workspace service
// (plan D16) and the views that use it (handlers, live blocks, the file tree).
// It is this app's own domain model; no library defines it. The Theorem
// vault's own abilities are typed by @theoremharness/sdk.
import type { Theorem } from '@theoremharness/sdk'

/** `ws_<ULID>`, kept in the folder at `.theorem/workspace.json`. */
export type WorkspaceId = string

/** `vf_<ULID>`, kept in the folder at `.theorem/ids.json` (plan D8). */
export type EntryId = string

/** Plan D12. Desktop workspaces start `LocalOnly`; the Theorem vault is `ConnectedLive`. */
export type ReplicationPolicy = 'LocalOnly' | 'Synced' | 'ConnectedLive'

export interface WorkspaceSummary {
  id: WorkspaceId
  name: string
  /** Absolute path of the folder on this machine; '' for the Theorem vault. */
  path: string
  /**
   * Whether the person trusts this folder's code (plan D9). Kept in the app
   * data directory, never in the folder, so a folder cannot arrive trusted.
   */
  trusted: boolean
  policy: ReplicationPolicy
}

/** What stores a Theorem vault entry: a plain file, a document, or a plan. */
export type TheoremBacking = 'agentfs' | 'document' | 'plan'

/** Where a Theorem vault entry comes from. Absent for folder entries. */
export interface TheoremSource {
  backing: TheoremBacking
  /**
   * Writing answers `read_only`, and so does removing a plan. It can still
   * be moved: where it sits is the vault's, not the content's.
   */
  readOnly: boolean
  /**
   * False while the entry sits at the path Theorem computed for it (a plan
   * under `Plans/`, an agent's document under `Agent/`); moving it places it.
   */
  placed: boolean
  documentId?: string
  /** The doc-store kind: `authored`, `skill`, and so on. */
  documentKind?: string
  /** An agent wrote it, rather than a person. */
  agent: boolean
  planId?: string
  planStatus?: string
}

export interface WorkspaceEntry {
  id: EntryId
  /** POSIX path relative to the workspace root, without a leading slash. */
  path: string
  kind: 'file' | 'directory'
  size: number
  mtimeMs: number
  theorem?: TheoremSource
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
   * Events may have been missed (the event stream opened or reconnected, or
   * ids changed outside Theorem): refetch the tree and anything derived from it.
   */
  | { type: 'resync' }

export interface WorkspaceLink {
  /** The note that holds the link. */
  from: string
  /** The target as written, without heading or block part. */
  target: string
  /** The path the target resolves to, or null when it resolves to nothing. */
  resolved: string | null
  /**
   * `related` is an accepted Theorem link suggestion that is not in the text;
   * it shows from both ends.
   */
  kind: 'wikilink' | 'markdown' | 'embed' | 'related'
  heading?: string
  /** A block id from `#^id`. */
  block?: string
  /** 1-based line of the link in `from`; 0 for a `related` link. */
  line: number
  /** The Theorem link receipt behind a `related` link. */
  receiptId?: string
}

/** The notes and the links between them, for the graph view. */
export interface WorkspaceGraph {
  notes: Array<{
    path: string
    /** The `title` property, else the first heading, else the file name. */
    title: string
    /** Each tag once, as first spelled, without the `#`. */
    tags: Array<string>
    /** Present in the Theorem vault. */
    theorem?: Pick<TheoremSource, 'backing' | 'documentKind' | 'agent'>
  }>
  /**
   * One per note and target. `to` is the path the target resolves to (a note
   * or any other file), or null when it resolves to nothing.
   */
  links: Array<{
    from: string
    to: string | null
    target: string
    kind?: WorkspaceLink['kind']
  }>
}

export interface SearchHit {
  path: string
  title: string
  /** Matched text with the matches wrapped in `<mark>`. */
  snippet: string
  score: number
}

/** A folder's own settings, kept in it at `.theorem/settings.json` (plan D8). */
export interface FolderSettings {
  /**
   * Where new attachments go, written as Obsidian writes its "Default location
   * for new attachments": `/` the root, `./` beside the note, `./name` a
   * folder beside the note, any other path a folder from the root.
   */
  attachments: string
  dailyNotes: {
    /** The folder daily notes go in; '' is the root. */
    folder: string
    /** The note whose text starts each new daily note; '' for none. */
    template: string
  }
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
   * `merged` is true when the store merged this write with a change made
   * since `expectedHash` (the Theorem vault does, for documents); what it
   * stored is then not `data`, and has to be read again.
   */
  write(
    path: string,
    data: string | Uint8Array,
    options?: { expectedHash?: string | null },
  ): Promise<{ hash: string; merged?: boolean }>
  mkdir(path: string): Promise<void>
  /** Rename or move. The entry keeps its id and links to it are rewritten. */
  rename(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  /** Resolve a link target as written in `fromPath` to a path, Obsidian-style. */
  resolve(target: string, fromPath: string): Promise<string | null>
  links(path: string): Promise<Array<WorkspaceLink>>
  backlinks(path: string): Promise<Array<WorkspaceLink>>
  /** Every note and what it links to, for the graph view. */
  graph(): Promise<WorkspaceGraph>
  /**
   * Full-text search over titles and bodies. `tag:#name` terms keep the notes
   * with that tag or one nested under it.
   */
  search(query: string, options?: { limit?: number }): Promise<Array<SearchHit>>
  tags(): Promise<Array<{ tag: string; count: number }>>
  /** Frontmatter properties of a Markdown file. */
  properties(path: string): Promise<Record<string, unknown>>
  settings(): Promise<FolderSettings>
  /** Replaces the folder's settings; answers them as stored. */
  setSettings(settings: FolderSettings): Promise<FolderSettings>
  setTrusted(trusted: boolean): Promise<void>
  /** Returns an unsubscribe function. */
  subscribe(listener: (event: WorkspaceEvent) => void): () => void
  /** What only the Theorem vault can do. Absent for folders. */
  readonly theorem?: TheoremAbilities
}

/** Link suggestions for a note, or why there are none. */
export type LinkSuggestions =
  | { status: 'ready'; page: Theorem.FilesSuggestionPage }
  /** The tenant has not set link thresholds; nothing is suggested. */
  | { status: 'unconfigured' }

/** The Theorem vault's own abilities, beyond a folder's. */
export interface TheoremAbilities {
  /** Link candidates for the document at `path`, from Theorem's link service. */
  suggestions: (
    path: string,
    options?: { limit?: number },
  ) => Promise<LinkSuggestions>
  /**
   * Accepting an inline candidate rewrites its span as a wikilink; any other
   * accepted candidate becomes a `related` link.
   */
  decide: (
    candidateId: string,
    decision: Theorem.FilesSuggestionDecision,
  ) => Promise<Theorem.FilesDecisionReceipt>
  /**
   * Makes an agent's document the person's own, at `to`, else where the
   * agent's note was placed, else at its default path. The note leaves the
   * vault.
   */
  promote: (path: string, to?: string) => Promise<WorkspaceEntry>
  /** The Markdown under `path` ('' for everything) as an OKF bundle. */
  exportOkf: (
    path: string,
  ) => Promise<{ fileName: string; bytes: Uint8Array; conceptCount: number }>
  /** An OKF bundle's concepts as documents under `path`. */
  importOkf: (
    path: string,
    bundle: { fileName: string; bytes: Uint8Array },
    options?: { dryRun?: boolean },
  ) => Promise<Theorem.FilesOkfImportReceipt>
}
