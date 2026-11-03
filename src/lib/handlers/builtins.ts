// SOURCING: React.lazy and Suspense (a view's code, such as pdf.js or
// CodeMirror, loads the first time a file needs it) over the registry. Plan
// D13's built-in handlers, in one place with their priorities.
//
// Not here: the sandboxed `.tsx` app handler, the `.html` handler and the
// folder-with-`index.html` handler are Phase 4's. The block sandbox registers
// them through registerHandler, beside these.
import { Suspense, createElement, lazy } from 'react'
import type { ComponentType } from 'react'
import { languageFor } from '@/components/handlers/code/language'
import { FileMessage } from '@/components/handlers/file-status'
import { mediaKind } from '@/components/handlers/media/kind'
import { FALLBACK_HANDLER_ID, registerHandler } from './registry'
import type { FileHandler, HandlerMatchInput } from './types'

/** A view whose code loads when it is first shown. */
function lazyView<TProps extends object>(
  load: () => Promise<ComponentType<TProps>>,
): ComponentType<TProps> {
  const View = lazy(async () => ({ default: await load() }))
  return function LazyView(props: TProps) {
    return createElement(
      Suspense,
      { fallback: createElement(FileMessage, null, 'Loading…') },
      createElement(View, props),
    )
  }
}

const markdown = () => import('@/components/handlers/markdown/markdown-handler')
const canvas = () => import('@/components/handlers/canvas/canvas-handler')
const pdf = () => import('@/components/handlers/pdf/pdf-handler')
const csv = () => import('@/components/handlers/data/csv-handler')
const json = () => import('@/components/handlers/data/json-handler')
const media = () => import('@/components/handlers/media/media-handler')
const code = () => import('@/components/handlers/code/code-handler')
const unknown = () => import('@/components/handlers/unknown/unknown-handler')

const MiB = 1024 * 1024
/**
 * Above these sizes a file opens as file info; the editor or table stays in
 * "Open with". Editors hold the whole text; the table draws only the rows in
 * view, so it takes larger files.
 */
const TEXT_LIMIT = 4 * MiB
const TABLE_LIMIT = 32 * MiB

const isFile = ({ entry }: HandlerMatchInput) => entry.kind === 'file'
const fits = (input: HandlerMatchInput, limit: number) =>
  isFile(input) && input.entry.size <= limit

export const builtinHandlers: Array<FileHandler> = [
  {
    id: 'markdown',
    label: 'Markdown',
    priority: 80,
    match: (input) => input.mime === 'text/markdown' && fits(input, TEXT_LIMIT),
    Panel: lazyView(() => markdown().then((m) => m.MarkdownPanel)),
    Card: lazyView(() => markdown().then((m) => m.MarkdownCard)),
    create: { label: 'Note', extension: 'md', initial: () => '' },
  },
  {
    id: 'canvas',
    label: 'Canvas',
    priority: 80,
    match: (input) => input.extension === 'canvas' && fits(input, TEXT_LIMIT),
    Panel: lazyView(() => canvas().then((m) => m.CanvasPanel)),
    Card: lazyView(() => canvas().then((m) => m.CanvasCard)),
    // What Obsidian writes for a new canvas.
    create: { label: 'Canvas', extension: 'canvas', initial: () => '{}' },
  },
  {
    id: 'pdf',
    label: 'PDF',
    priority: 70,
    match: (input) => input.mime === 'application/pdf' && isFile(input),
    Panel: lazyView(() => pdf().then((m) => m.PdfPanel)),
    Card: lazyView(() => pdf().then((m) => m.PdfCard)),
  },
  {
    id: 'csv',
    label: 'Table',
    priority: 70,
    match: (input) =>
      (input.mime === 'text/csv' ||
        input.mime === 'text/tab-separated-values') &&
      fits(input, TABLE_LIMIT),
    Panel: lazyView(() => csv().then((m) => m.CsvPanel)),
    Card: lazyView(() => csv().then((m) => m.CsvCard)),
  },
  {
    id: 'json',
    label: 'JSON tree',
    priority: 70,
    match: (input) =>
      (input.mime === 'application/json' ||
        !!input.mime?.endsWith('+json') ||
        input.extension === 'jsonc') &&
      fits(input, TEXT_LIMIT),
    Panel: lazyView(() => json().then((m) => m.JsonPanel)),
    Card: lazyView(() => json().then((m) => m.JsonCard)),
  },
  {
    id: 'media',
    label: 'Image, audio or video',
    priority: 60,
    match: (input) => mediaKind(input.mime) !== null && isFile(input),
    Panel: lazyView(() => media().then((m) => m.MediaPanel)),
    Card: lazyView(() => media().then((m) => m.MediaCard)),
  },
  {
    id: 'code',
    label: 'Code editor',
    priority: 40,
    match: (input) =>
      (languageFor(input.entry.path) !== null ||
        !!input.mime?.startsWith('text/')) &&
      fits(input, TEXT_LIMIT),
    Panel: lazyView(() => code().then((m) => m.CodePanel)),
    Card: lazyView(() => code().then((m) => m.CodeCard)),
  },
  {
    id: FALLBACK_HANDLER_ID,
    label: 'File info',
    priority: 0,
    match: isFile,
    Panel: lazyView(() => unknown().then((m) => m.UnknownPanel)),
    Card: lazyView(() => unknown().then((m) => m.UnknownCard)),
  },
]

/**
 * Registers the built-in handlers. Registering again replaces them in place,
 * so calling this more than once is harmless. Returns the undo.
 */
export function registerBuiltinHandlers(): () => void {
  const undo = builtinHandlers.map(registerHandler)
  return () => {
    for (const fn of undo) fn()
  }
}
