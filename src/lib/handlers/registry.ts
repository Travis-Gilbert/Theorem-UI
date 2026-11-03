// SOURCING: zustand (the registry is a store, so a handler or extension
// registered later, such as Phase 4's sandboxed handlers, reaches the views
// already open) and mime (the MIME type for an extension). Choosing among
// handlers is plan D13's own rule; no library models it.
import type { Extension } from '@codemirror/state'
import { Mime } from 'mime'
import otherTypes from 'mime/types/other.js'
import standardTypes from 'mime/types/standard.js'
import type { ComponentType } from 'react'
import { create } from 'zustand'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import type {
  FileHandler,
  FileViewProps,
  HandlerMatchInput,
  MarkdownExtension,
} from './types'

/** Extra behaviour for the code handler's CodeMirror editor. */
export interface CodeExtension {
  id: string
  /** CodeMirror extensions for a code file's editor, e.g. last-run values in the gutter. */
  extensions: (file: FileViewProps) => Extension[]
  /** Controls in the code panel's toolbar, e.g. Run. */
  Toolbar?: ComponentType<FileViewProps>
}

interface Registry {
  /** In registration order. */
  handlers: Array<FileHandler>
  markdownExtensions: Array<MarkdownExtension>
  codeExtensions: Array<CodeExtension>
}

export const useHandlerRegistry = create<Registry>()(() => ({
  handlers: [],
  markdownExtensions: [],
  codeExtensions: [],
}))

/**
 * Adds `item` to one list of the registry, replacing an item with the same
 * id in place. Returns a function that removes it again.
 */
function register<TKey extends keyof Registry>(
  key: TKey,
  item: Registry[TKey][number],
): () => void {
  useHandlerRegistry.setState((registry) => {
    const list: Array<{ id: string }> = registry[key]
    const at = list.findIndex((x) => x.id === item.id)
    return {
      [key]: at < 0 ? [...list, item] : list.with(at, item),
    }
  })
  return () =>
    useHandlerRegistry.setState((registry) => ({
      [key]: (registry[key] as Array<{ id: string }>).filter((x) => x !== item),
    }))
}

export const registerHandler = (handler: FileHandler) =>
  register('handlers', handler)

export const registerMarkdownExtension = (extension: MarkdownExtension) =>
  register('markdownExtensions', extension)

export const registerCodeExtension = (extension: CodeExtension) =>
  register('codeExtensions', extension)

export const markdownExtensions = () =>
  useHandlerRegistry.getState().markdownExtensions

export const codeExtensions = () => useHandlerRegistry.getState().codeExtensions

/** The built-in handler for files no other handler opens. */
export const FALLBACK_HANDLER_ID = 'unknown'

export const handlerById = (id: string) =>
  useHandlerRegistry.getState().handlers.find((h) => h.id === id)

/**
 * Every handler that matches, the one that opens the file first. Higher
 * priority first; among equal priorities, the one registered first.
 */
export function handlersFor(
  input: HandlerMatchInput,
  handlers = useHandlerRegistry.getState().handlers,
): Array<FileHandler> {
  return handlers
    .filter((handler) => handler.match(input))
    .toSorted((a, b) => b.priority - a.priority)
}

/** The handler that opens the file. */
export function handlerFor(
  input: HandlerMatchInput,
  handlers = useHandlerRegistry.getState().handlers,
): FileHandler | undefined {
  return handlersFor(input, handlers)[0]
}

/** The `mime` package's full table, with the script types it lacks. */
const mime = new Mime(standardTypes, otherTypes).define(
  {
    // `mime` maps .ts to MPEG transport streams (video/mp2t). In a workspace
    // it is far more often TypeScript; a real stream still opens through
    // "Open with".
    'text/typescript': ['ts', 'mts', 'cts'],
    'text/tsx': ['tsx'],
    'text/x-python': ['py'],
  },
  true,
)

/** Lowercased, without the dot; '' for none and for dotfiles like `.env`. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** The MIME type for a path's extension, or null. */
export function mimeOf(path: string): string | null {
  const extension = extensionOf(path)
  return (extension && mime.getType(extension)) || null
}

/** What handlers decide on for `entry`. */
export function matchInput(
  entry: WorkspaceEntry,
  properties: Record<string, unknown> | null = null,
): HandlerMatchInput {
  return {
    entry,
    extension: extensionOf(entry.path),
    mime: mimeOf(entry.path),
    properties,
  }
}
