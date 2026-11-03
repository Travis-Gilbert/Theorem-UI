// SOURCING: LinksPane for Links, react-query over the file's saved text and the
// workspace's Markdown parser (parseNote) for the outline, openFileAt for the
// heading a click reveals.
import { useQuery } from '@tanstack/react-query'
import { extname } from 'pathe'
import { LinksPane } from '@/components/workspace/links-pane'
import { openFileAt } from '@/lib/handlers/actions'
import { fileTextKey } from '@/lib/handlers/file-sync'
import { entryOf } from '@/lib/workspace/open'
import type { WorkspaceClient, WorkspaceEntry } from '@/lib/workspace/types'
import {
  useWorkspaceClient,
  workspaceTreeKey,
} from '@/lib/workspace/workspaces'
import { parseNote } from '#/server/desktop/workspace/markdown'
import { useInspectedFile } from './inspector-state'

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-3 text-sm text-ink-faint">{children}</p>
}

/** The inspected file's client and entry, wherever the entry has moved. */
export function useInspected():
  { client: WorkspaceClient; entry: WorkspaceEntry } | undefined {
  const file = useInspectedFile((s) => s.file)
  const client = useWorkspaceClient(file?.workspaceId ?? '')
  const entry = useQuery({
    queryKey: workspaceTreeKey(client?.workspace.id ?? ''),
    queryFn: () => client!.tree(),
    enabled: Boolean(client),
    staleTime: Infinity,
    select: (entries) => (file ? entryOf(entries, file) : undefined),
  }).data
  return client && entry ? { client, entry } : undefined
}

function Outline({ client, path }: { client: WorkspaceClient; path: string }) {
  const headings = useQuery({
    queryKey: fileTextKey(client.workspace.id, path),
    queryFn: () => client.readText(path),
    staleTime: Infinity,
    select: ({ text }) => parseNote(text).headings,
  })
  if (extname(path) !== '.md') return <Empty>This file has no outline.</Empty>
  if (headings.isPending) return <Empty>Loading…</Empty>
  if (!headings.data?.length) return <Empty>This note has no headings.</Empty>
  // The shallowest heading sits at the left edge, as in Obsidian's outline.
  const top = Math.min(...headings.data.map((h) => h.depth))
  return (
    <nav aria-label="Outline" className="px-1.5 py-1.5">
      {headings.data.map((heading) => (
        <button
          key={`${heading.line}:${heading.text}`}
          type="button"
          style={{ paddingInlineStart: `${(heading.depth - top) * 14 + 6}px` }}
          className="flex w-full min-w-0 items-center rounded-md py-1 pe-1.5 text-start text-sm text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          onClick={() => openFileAt({ client, path }, `#${heading.text}`)}
        >
          <span className="min-w-0 truncate">{heading.text}</span>
        </button>
      ))}
    </nav>
  )
}

/** The inspected note's headings; a click scrolls the note to one. */
export function OutlinePanel() {
  const inspected = useInspected()
  return (
    <div className="h-full overflow-y-auto">
      {inspected ? (
        <Outline client={inspected.client} path={inspected.entry.path} />
      ) : (
        <Empty>Open a note to see its outline.</Empty>
      )}
    </div>
  )
}

/** Backlinks, outgoing links and tags of the inspected file. */
export function LinksPanel() {
  const inspected = useInspected()
  return inspected ? (
    <LinksPane
      client={inspected.client}
      path={inspected.entry.path}
      entry={inspected.entry}
      className="h-full w-full border-l-0"
    />
  ) : (
    <Empty>Open a note to see what links to it.</Empty>
  )
}
