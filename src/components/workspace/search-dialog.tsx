// SOURCING: Base UI Combobox (inline result list with keyboard navigation;
// its own filtering is off, as the index ranks) inside ui/dialog, as
// file-picker.tsx uses it; react-query useQueries (each open folder's search
// and tags through its index); zustand (whether the dialog is open and its
// query, so a tag anywhere can open it).
import { Combobox } from '@base-ui/react/combobox'
import { keepPreviousData, useQueries } from '@tanstack/react-query'
import { dirname } from 'pathe'
import { useDeferredValue, useRef } from 'react'
import { create } from 'zustand'
import { Icon } from '@/components/icons'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { openWorkspaceFile } from '@/lib/workspace/open'
import type { SearchHit, WorkspaceClient } from '@/lib/workspace/types'
import {
  useWorkspaces,
  workspaceClient,
  workspaceIndexKey,
} from '@/lib/workspace/workspaces'

/** The dialog's query, or null while it is closed. */
export const useWorkspaceSearch = create<{ query: string | null }>()(() => ({
  query: null,
}))

/** Opens search across the open folders, with `query` typed in. */
export const openSearch = (query = '') => useWorkspaceSearch.setState({ query })

const setQuery = (query: string | null) =>
  useWorkspaceSearch.setState({ query })

const RESULTS_PER_FOLDER = 50

interface Hit extends SearchHit {
  client: WorkspaceClient
}

/** A snippet with its `<mark>` runs marked; everything else stays text. */
function Snippet({ text }: { text: string }) {
  return text.split(/<\/?mark>/).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="rounded-sm bg-ochre-container text-ochre-ink">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

/** Every tag in the open folders with how many notes use it. */
function useAllTags(clients: Array<WorkspaceClient>) {
  return useQueries({
    queries: clients.map((client) => ({
      queryKey: workspaceIndexKey(client.workspace.id, ['tags']),
      queryFn: () => client.tags(),
    })),
    combine: (results) => {
      const counts = new Map<string, { tag: string; count: number }>()
      for (const { tag, count } of results.flatMap((r) => r.data ?? [])) {
        const key = tag.toLowerCase()
        const seen = counts.get(key)
        counts.set(key, {
          tag: seen?.tag ?? tag,
          count: (seen?.count ?? 0) + count,
        })
      }
      return {
        tags: [...counts.values()].toSorted((a, b) =>
          a.tag.localeCompare(b.tag),
        ),
        isPending: results.some((r) => r.isPending),
      }
    },
  })
}

function useSearch(clients: Array<WorkspaceClient>, query: string) {
  const q = query.trim()
  return useQueries({
    queries: clients.map((client) => ({
      queryKey: workspaceIndexKey(client.workspace.id, ['search', q]),
      queryFn: () => client.search(q, { limit: RESULTS_PER_FOLDER }),
      enabled: q !== '',
      placeholderData: keepPreviousData,
    })),
    combine: (results) => ({
      hits: clients.flatMap((client, i): Array<Hit> =>
        (results[i]?.data ?? []).map((hit) => ({ ...hit, client })),
      ),
      isFetching: results.some((r) => r.isFetching),
    }),
  })
}

function SearchBody({ query }: { query: string }) {
  const clients = useWorkspaces().workspaces.map(workspaceClient)
  const input = useRef<HTMLInputElement>(null)
  const deferred = useDeferredValue(query)
  const { hits, isFetching } = useSearch(clients, deferred)
  const tags = useAllTags(clients)
  const searching = query.trim() !== ''
  const several = clients.length > 1

  return (
    <Combobox.Root<Hit>
      inline
      open
      items={searching ? hits : []}
      filter={null}
      autoHighlight
      inputValue={query}
      onInputValueChange={(value) => setQuery(value)}
      itemToStringLabel={(hit) => hit.path}
      isItemEqualToValue={(a, b) => a.client === b.client && a.path === b.path}
      onValueChange={(hit) => {
        if (!hit) return
        openWorkspaceFile({
          workspaceId: hit.client.workspace.id,
          path: hit.path,
        })
        setQuery(null)
      }}
    >
      <div className="flex items-center gap-2 rounded-lg border border-control bg-background px-2.5">
        <Icon.Search className="size-4 text-ink-faint" />
        <Combobox.Input
          ref={input}
          autoFocus
          placeholder="Search notes, or tag:#name"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
        />
      </div>
      {searching ? (
        <Combobox.Empty className="px-2 py-6 text-center text-sm text-ink-muted empty:hidden">
          {isFetching ? 'Searching…' : 'Nothing matches.'}
        </Combobox.Empty>
      ) : (
        <section aria-label="Tags" className="max-h-80 overflow-y-auto">
          <h3 className="px-1 pb-1.5 text-xs font-medium text-ink-faint">
            Tags
          </h3>
          {tags.isPending ? (
            <p className="px-1 text-sm text-ink-muted">Loading…</p>
          ) : !tags.tags.length ? (
            <p className="px-1 text-sm text-ink-muted">
              No notes have tags yet.
            </p>
          ) : (
            <ul className="flex flex-col">
              {tags.tags.map(({ tag, count }) => (
                <li key={tag}>
                  <button
                    type="button"
                    style={{
                      paddingInlineStart: 8 + tag.split('/').length * 12 - 12,
                    }}
                    className="flex w-full items-center gap-2 rounded-md py-1 pe-2 text-start text-sm outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                    onClick={() => {
                      setQuery(`tag:#${tag} `)
                      input.current?.focus()
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">#{tag}</span>
                    <span className="text-xs text-ink-faint tabular-nums">
                      {count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <Combobox.List className="max-h-96 overflow-y-auto empty:hidden">
        {(hit: Hit) => {
          const folder = dirname(hit.path)
          const where = [
            several && hit.client.workspace.name,
            folder !== '.' && folder,
          ]
            .filter(Boolean)
            .join(' / ')
          return (
            <Combobox.Item
              key={`${hit.client.workspace.id}:${hit.path}`}
              value={hit}
              className="flex cursor-default flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-hover"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate font-medium">{hit.title}</span>
                {where && (
                  <span className="truncate text-xs text-ink-faint">
                    {where}
                  </span>
                )}
              </span>
              {hit.snippet && (
                <span className="line-clamp-2 text-xs text-ink-muted">
                  <Snippet text={hit.snippet} />
                </span>
              )}
            </Combobox.Item>
          )
        }}
      </Combobox.List>
    </Combobox.Root>
  )
}

/** Full-text and tag search across the open folders. */
export function SearchDialog() {
  const query = useWorkspaceSearch((s) => s.query)
  return (
    <Dialog
      open={query !== null}
      onOpenChange={(open) => !open && setQuery(null)}
    >
      <DialogContent className="gap-3 p-3 sm:max-w-xl">
        <DialogTitle className="px-1 text-sm font-medium">Search</DialogTitle>
        {query !== null && <SearchBody query={query} />}
      </DialogContent>
    </Dialog>
  )
}
