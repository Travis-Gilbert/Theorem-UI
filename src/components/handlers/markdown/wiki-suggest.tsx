// SOURCING: prosemirror-autocomplete (the `[[` and `![[` trigger, the text
// typed after it, and the arrow, Enter, Tab and Escape keys while it is open)
// as Milkdown $prose plugins; a zustand store between its reducer and the
// React list; the workspace tree (react-query) for the files, and parseNote for
// a note's headings and block ids. The list sits at the caret by ProseMirror's
// coordsAtPos, as the package's demo places it.
//
// Typing `[[` lists the folder's files; `[[Note#` lists the note's headings
// and `[[Note#^` its block ids; text after `|` becomes the link's alias.
// Enter or Tab inserts the highlighted entry as a wikilink (an embed after
// `![[`), or, with nothing listed, the link as typed.
import { editorViewOptionsCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { ActionKind, autocomplete } from 'prosemirror-autocomplete'
import type { AutocompleteAction, FromTo } from 'prosemirror-autocomplete'
import { basename, dirname } from 'pathe'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'
import { parseNote } from '#/server/desktop/workspace/markdown'
import { menuItem, menuPopup } from '@/components/shell/sidebar'
import type { FileViewProps } from '@/lib/handlers/types'
import { useWorkspaceTree } from '@/lib/workspace/workspaces'
import { linkTarget, rankFiles } from './link-target'
import { useNoteText } from './note-sections'
import { wikiEmbedNode, wikiLinkNode } from './syntax'
import { useResolvedPath } from './views'

export interface WikiSuggestion {
  key: string
  label: string
  detail?: string
  /** The link's target as it is inserted, with any `#heading` or `#^block`. */
  value: string
}

interface Query {
  view: EditorView
  embed: boolean
  /** What was typed after the trigger. */
  text: string
  /** The trigger and the text, which the link replaces. */
  range: FromTo
}

interface SuggestState {
  query: Query | null
  active: number
  /** What the list shows for `query`, set by the list. */
  items: Array<WikiSuggestion>
}

export type WikiSuggestStore = StoreApi<SuggestState>

export const createWikiSuggestStore = (): WikiSuggestStore =>
  createStore<SuggestState>(() => ({ query: null, active: 0, items: [] }))

/** What the typed text asks for. */
export function parseQuery(text: string) {
  const bar = text.indexOf('|')
  const target = (bar === -1 ? text : text.slice(0, bar)).trim()
  const alias = bar === -1 ? null : text.slice(bar + 1).trim() || null
  const hash = target.indexOf('#')
  if (hash === -1)
    return {
      mode: 'file' as const,
      note: target,
      search: target,
      target,
      alias,
    }
  const note = target.slice(0, hash).trim()
  const fragment = target.slice(hash + 1)
  return fragment.startsWith('^')
    ? { mode: 'block' as const, note, search: fragment.slice(1), target, alias }
    : { mode: 'heading' as const, note, search: fragment, target, alias }
}

/** Replaces the trigger and what was typed with the link. */
function insertLink(query: Query, value: string, alias: string | null) {
  const { view, range, embed } = query
  const type =
    view.state.schema.nodes[embed ? wikiEmbedNode.id : wikiLinkNode.id]
  if (!type) return
  view.dispatch(
    view.state.tr
      .replaceWith(range.from, range.to, type.create({ value, alias }))
      .scrollIntoView(),
  )
  view.focus()
}

/**
 * Inserts the entry at `index`, or the link as typed when nothing is listed.
 * False when there is nothing to insert.
 */
export function chooseSuggestion(store: WikiSuggestStore, index: number) {
  const { query, items } = store.getState()
  if (!query) return false
  const { target, alias } = parseQuery(query.text)
  const value = items[index]?.value ?? target
  if (!value) return false
  insertLink(query, value, alias)
  return true
}

function reducer(store: WikiSuggestStore) {
  return (action: AutocompleteAction): boolean => {
    const { active, items } = store.getState()
    switch (action.kind) {
      case ActionKind.open:
      case ActionKind.filter:
      case ActionKind.enter:
        store.setState({
          query: {
            view: action.view,
            embed: action.trigger.startsWith('!'),
            text: action.filter ?? '',
            range: action.range,
          },
          ...(action.kind !== ActionKind.enter && { active: 0 }),
        })
        return action.kind === ActionKind.enter
          ? chooseSuggestion(store, active)
          : true
      case ActionKind.up:
      case ActionKind.down: {
        if (!items.length) return false
        const step = action.kind === ActionKind.up ? -1 : 1
        store.setState({
          active: (active + step + items.length) % items.length,
        })
        return true
      }
      case ActionKind.close:
        store.setState({ query: null, active: 0 })
        return true
      default:
        return false
    }
  }
}

/**
 * The editor's `[[` suggestions: the plugins for `editor.use`, and a config
 * for `editor.config` that hands keys to the open list before any other
 * plugin's keymap (Enter, Tab and the arrows have other meanings there).
 */
export function wikiSuggest(store: WikiSuggestStore) {
  // The list's state and keys, then the input rule that opens it.
  const plugins = autocomplete({
    // Obsidian opens the list after `[[` anywhere, and after `![[`.
    triggers: [{ name: 'wikilink', trigger: /(!?\[\[)$/ }],
    reducer: reducer(store),
  })
  const [list] = plugins
  return {
    plugins: plugins.map((plugin) => $prose(() => plugin)),
    config: (ctx: Ctx) =>
      ctx.update(editorViewOptionsCtx, (options) => ({
        ...options,
        handleKeyDown: (view, event) =>
          Boolean(list?.props.handleKeyDown?.call(list, view, event)) ||
          Boolean(options.handleKeyDown?.(view, event)),
      })),
  }
}

/** The entries for `text`: files, or the headings or blocks of a note. */
function suggestionsFor(
  text: string,
  paths: Array<string>,
  outline: ReturnType<typeof parseNote> | undefined,
  lines: Array<string>,
): Array<WikiSuggestion> {
  const query = parseQuery(text)
  const search = query.search.trim().toLowerCase()
  if (query.mode === 'file')
    return rankFiles(paths, query.search).map((path) => ({
      key: path,
      label: basename(path).replace(/\.md$/, ''),
      detail: dirname(path) === '.' ? undefined : dirname(path),
      value: linkTarget(path, paths),
    }))
  if (!outline) return []
  const byPrefix = <T,>(list: Array<T>, of: (item: T) => string) =>
    list
      .filter((item) => of(item).toLowerCase().includes(search))
      .sort(
        (a, b) =>
          Number(!of(a).toLowerCase().startsWith(search)) -
          Number(!of(b).toLowerCase().startsWith(search)),
      )
  if (query.mode === 'heading')
    return byPrefix(outline.headings, (h) => h.text).map((heading) => ({
      key: `${heading.line}:${heading.text}`,
      label: heading.text,
      detail: `H${heading.depth}`,
      value: `${query.note}#${heading.text}`,
    }))
  return byPrefix(outline.blocks, (b) => b.id).map((block) => ({
    key: block.id,
    label: `^${block.id}`,
    detail: lines[block.line - 1]?.replace(/\s*\^[\w-]+\s*$/, '').trim(),
    value: `${query.note}#^${block.id}`,
  }))
}

/** Where the list goes: below the caret, or above it near the bottom. */
function placement(view: EditorView, pos: number): CSSProperties {
  let box = { left: 0, top: 0, bottom: 0 }
  try {
    box = view.coordsAtPos(pos)
  } catch {
    // A view without layout (a test) has no caret box.
  }
  return box.bottom + 300 > window.innerHeight && box.top > 300
    ? { left: box.left, bottom: window.innerHeight - box.top + 4 }
    : { left: box.left, top: box.bottom + 4 }
}

/** The open `[[` list of one editor. */
export function WikiSuggest({
  store,
  file,
}: {
  store: WikiSuggestStore
  file: FileViewProps
}) {
  const query = useStore(store, (s) => s.query)
  const active = useStore(store, (s) => s.active)
  const tree = useWorkspaceTree(file.client)
  const parsed = query && parseQuery(query.text)
  const note = parsed && parsed.mode !== 'file' ? parsed.note : null
  const resolved = useResolvedPath(file, note ?? '')
  const outlined = note === null ? null : (resolved.data ?? null)
  const text = useNoteText(file.client, outlined)

  const paths = useMemo(
    () => (tree.data ?? []).filter((e) => e.kind === 'file').map((e) => e.path),
    [tree.data],
  )
  const outline = useMemo(
    () =>
      text.data === undefined
        ? undefined
        : { note: parseNote(text.data), lines: text.data.split('\n') },
    [text.data],
  )
  const items = useMemo(
    () =>
      query
        ? suggestionsFor(query.text, paths, outline?.note, outline?.lines ?? [])
        : [],
    [query, paths, outline],
  )
  useLayoutEffect(() => {
    store.setState((s) => ({
      items,
      active: Math.min(s.active, Math.max(items.length - 1, 0)),
    }))
  }, [items, store])

  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!query || !parsed) return null
  const empty =
    parsed.mode === 'file'
      ? paths.length
        ? 'No file matches. Enter links it as typed.'
        : 'This folder has no files yet.'
      : resolved.isLoading || text.isLoading
        ? 'Loading…'
        : outline === undefined
          ? 'No such note.'
          : parsed.mode === 'heading'
            ? 'No heading matches.'
            : 'No block matches.'

  return createPortal(
    <div
      ref={list}
      role="listbox"
      aria-label={query.embed ? 'Embed a file' : 'Link to a file'}
      data-slot="wiki-suggest"
      className={`fixed z-50 max-h-72 w-80 overflow-y-auto ${menuPopup}`}
      style={placement(query.view, query.range.from)}
      // The editor keeps the focus.
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.map((item, index) => (
        <div
          key={item.key}
          role="option"
          aria-selected={index === active}
          data-highlighted={index === active || undefined}
          className={menuItem}
          onMouseEnter={() => store.setState({ active: index })}
          onClick={() => chooseSuggestion(store, index)}
        >
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.detail && (
            <span className="max-w-[50%] shrink-0 truncate text-xs text-ink-faint">
              {item.detail}
            </span>
          )}
        </div>
      ))}
      {!items.length && (
        <p className="px-2 py-1.5 text-sm text-ink-faint">{empty}</p>
      )}
    </div>,
    document.body,
  )
}
