// SOURCING: the workspace index through useIndexQuery (react-query): a note's
// backlinks (grouped by note with lodash-es), with each linking line read from its note, and its outgoing
// links; the note's tags from the workspace's Markdown parser (parseNote);
// Base UI Collapsible (each section folds); zustand persist (whether the
// aside is open, per browser, as shell-state.ts keeps shell preferences).
import { Collapsible } from '@base-ui/react/collapsible'
import { useQuery } from '@tanstack/react-query'
import { groupBy, uniqBy } from 'lodash-es'
import { basename, extname } from 'pathe'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Icon } from '@/components/icons'
import { followWikiLink } from '@/components/handlers/markdown/views'
import { openFileAt } from '@/lib/handlers/actions'
import { fileTextKey } from '@/lib/handlers/file-sync'
import type { FileViewProps } from '@/lib/handlers/types'
import type { WorkspaceLink } from '@/lib/workspace/types'
import { useIndexQuery } from '@/lib/workspace/workspaces'
import { parseNote } from '#/server/desktop/workspace/markdown'
import { openSearch } from './search-dialog'

/** Whether file panels show their links aside. */
export const useLinksAside = create<{ open: boolean; toggle: () => void }>()(
  persist(
    (set) => ({
      open: false,
      toggle: () => set((s) => ({ open: !s.open })),
    }),
    {
      name: 'theorem-links-aside',
      partialize: ({ open }) => ({ open }),
    },
  ),
)

const titleOf = (path: string) => basename(path, extname(path))

const subpathOf = (link: WorkspaceLink) =>
  link.block ? `#^${link.block}` : link.heading ? `#${link.heading}` : undefined

interface Backlinks {
  from: string
  /** Each linking line once, in order, with its text. */
  lines: Array<{ line: number; text: string }>
}

/** The notes that link to `path`, each with the lines that do. */
function useBacklinks({ client, path }: FileViewProps) {
  return useIndexQuery(client, ['backlinks', path], async () => {
    const links = await client.backlinks(path)
    return Promise.all(
      Object.entries(groupBy(links, (link) => link.from)).map(
        async ([from, noteLinks]): Promise<Backlinks> => {
          const text = await client
            .readText(from)
            .then((read) => read.text.split(/\r?\n/))
            .catch(() => [])
          const lines = [...new Set(noteLinks.map((link) => link.line))]
            .toSorted((a, b) => a - b)
            .map((line) => ({ line, text: text[line - 1]?.trim() ?? '' }))
          return { from, lines }
        },
      ),
    )
  })
}

/** The note's own tags, from its saved text. */
function useNoteTags({ client, path }: FileViewProps) {
  return useQuery({
    queryKey: fileTextKey(client.workspace.id, path),
    queryFn: () => client.readText(path),
    staleTime: Infinity,
    select: ({ text }) =>
      [...new Set(parseNote(text).tags.map(({ tag }) => tag))].toSorted(),
  })
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number | undefined
  children: React.ReactNode
}) {
  return (
    <Collapsible.Root defaultOpen className="border-b border-separator">
      <Collapsible.Trigger className="group/section flex h-8 w-full items-center gap-1.5 px-3 text-start text-xs font-medium text-ink-faint outline-none hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
        <Icon.Next
          aria-hidden="true"
          className="size-2.5 shrink-0 transition-transform duration-150 group-data-panel-open/section:rotate-90"
        />
        <span className="flex-1">{title}</span>
        {count !== undefined && <span className="tabular-nums">{count}</span>}
      </Collapsible.Trigger>
      <Collapsible.Panel className="px-1.5 pb-2">{children}</Collapsible.Panel>
    </Collapsible.Root>
  )
}

const empty = (text: string) => (
  <p className="px-1.5 py-1 text-sm text-ink-faint">{text}</p>
)

const rowClass =
  'flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-start text-sm outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

/**
 * Beside a file: the notes linking to it, the links it makes and its tags, as
 * Obsidian's backlinks, outgoing links and tags panes show them.
 */
export function LinksPane(file: FileViewProps) {
  const { client, path } = file
  const markdown = extname(path) === '.md'
  const backlinks = useBacklinks(file)
  const outgoing = useIndexQuery(client, ['links', path], () =>
    client.links(path),
  )
  const tags = useNoteTags(file)

  // One row per target, in the order the note first links to it.
  const targets = uniqBy(
    outgoing.data ?? [],
    (link) => link.resolved ?? link.target,
  )

  return (
    <aside
      aria-label="Links"
      className="w-64 shrink-0 overflow-y-auto border-l border-separator"
    >
      <Section title="Backlinks" count={backlinks.data?.length}>
        {backlinks.isPending
          ? empty('Loading…')
          : !backlinks.data?.length
            ? empty('No notes link here.')
            : backlinks.data.map(({ from, lines }) => (
                <div key={from}>
                  <button
                    type="button"
                    title={from}
                    className={rowClass}
                    onClick={() => openFileAt({ client, path: from })}
                  >
                    <Icon.TreeFile className="size-4 shrink-0 text-ink-faint" />
                    <span className="min-w-0 truncate">{titleOf(from)}</span>
                  </button>
                  {lines.map(({ line, text }) => (
                    <p
                      key={line}
                      className="ms-7 me-1.5 line-clamp-2 text-xs text-ink-muted"
                    >
                      {text}
                    </p>
                  ))}
                </div>
              ))}
      </Section>
      {markdown && (
        <Section title="Outgoing links" count={targets.length}>
          {outgoing.isPending
            ? empty('Loading…')
            : !targets.length
              ? empty('This note links nowhere.')
              : targets.map((link) => (
                  <button
                    key={link.resolved ?? link.target}
                    type="button"
                    title={link.resolved ?? `${link.target} (not created yet)`}
                    data-unresolved={link.resolved === null || undefined}
                    className={`${rowClass} data-unresolved:text-ink-faint`}
                    onClick={() =>
                      link.resolved !== null
                        ? openFileAt(
                            { client, path: link.resolved },
                            subpathOf(link),
                          )
                        : void followWikiLink(file, link.target)
                    }
                  >
                    <Icon.Link className="size-4 shrink-0 text-ink-faint" />
                    <span className="min-w-0 truncate">
                      {titleOf(link.resolved ?? link.target)}
                    </span>
                  </button>
                ))}
        </Section>
      )}
      {markdown && (
        <Section title="Tags" count={tags.data?.length}>
          {!tags.data?.length ? (
            empty('No tags.')
          ) : (
            <div className="flex flex-wrap gap-1 px-1.5 py-1">
              {tags.data.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="rounded-full bg-pill px-2 py-0.5 text-xs outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() => openSearch(`tag:#${tag}`)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </Section>
      )}
    </aside>
  )
}
