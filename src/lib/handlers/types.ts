// SOURCING: types only. The shape follows Patchwork's tools and datatypes
// (plan D13): a handler matches an entry and supplies a panel, a card and,
// optionally, a way to create a new file of its type.
//
// This is the seam between the file handlers (plan Phase 3) and live blocks
// (Phase 4): the registry and the built-in handlers implement it, and the
// block sandbox supplies sandboxed handlers and the Markdown editor's live
// block extension through it.
import type { Crepe } from '@milkdown/crepe'
import type { ComponentType } from 'react'
import type { WorkspaceClient, WorkspaceEntry } from '@/lib/workspace/types'

/** What a handler decides on. */
export interface HandlerMatchInput {
  entry: WorkspaceEntry
  /** Lowercased extension without the dot; '' when there is none. */
  extension: string
  /** The MIME type guessed from the extension, when there is one. */
  mime: string | null
  /** Frontmatter properties of a Markdown file, when the index has them. */
  properties: Record<string, unknown> | null
}

/** A file shown by a handler. `path` is relative to the workspace. */
export interface FileViewProps {
  client: WorkspaceClient
  path: string
  entry: WorkspaceEntry
}

/** A file shown as a card on a canvas, at the canvas's current zoom. */
export interface FileCardProps extends FileViewProps {
  zoom: number
  selected: boolean
}

export interface FileHandler {
  /** Stable id, such as `markdown` or `canvas`. */
  id: string
  /** Shown in "Open with" and in create menus. */
  label: string
  /**
   * When several handlers match, the highest priority wins. Built-ins use
   * 0 to 100; the fallback for unknown files uses 0.
   */
  priority: number
  match: (input: HandlerMatchInput) => boolean
  Panel: ComponentType<FileViewProps>
  Card: ComponentType<FileCardProps>
  create?: {
    label: string
    /** Without the dot. */
    extension: string
    initial: () => string
  }
}

/**
 * Extra behaviour for the Markdown handler's Crepe editor, such as live
 * blocks. `extend` runs on each new Crepe before `create()`, so it can add
 * Milkdown plugins (`crepe.editor.use`) and configuration
 * (`crepe.editor.config`).
 */
export interface MarkdownExtension {
  id: string
  extend: (crepe: Crepe, file: FileViewProps) => void
}
