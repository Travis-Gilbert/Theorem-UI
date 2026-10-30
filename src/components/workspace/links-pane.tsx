// SOURCING: the workspace index through useIndexQuery (react-query): a note's
// backlinks (grouped by note with lodash-es), with each linking line read from its note, and its outgoing
// links; the note's tags from the workspace's Markdown parser (parseNote);
// in the Theorem vault, the link candidates Theorem's link service suggests,
// decided through react-query's useMutation (useMutationState hides the ones
// being decided); Base UI Collapsible (each section folds); TooltipIconButton;
// zustand persist (whether the aside is open, per browser, as shell-state.ts
// keeps shell preferences).
import { Collapsible } from '@base-ui/react/collapsible'
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { Theorem } from '@theoremharness/sdk'
import { countBy, groupBy, uniqBy } from 'lodash-es'
import { basename, dirname, extname } from 'pathe'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { followWikiLink } from '@/components/handlers/markdown/views'
import { openFileAt } from '@/lib/handlers/actions'
import { fileTextKey } from '@/lib/handlers/file-sync'
import type { FileViewProps } from '@/lib/handlers/types'
import type { WorkspaceClient, WorkspaceLink } from '@/lib/workspace/types'
import { useIndexQuery, workspaceIndexKey } from '@/lib/workspace/workspaces'
import { cn } from '@/lib/utils'
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
  /** Every link is a `related` one, made by accepting a suggestion. */
  related: boolean
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
          // A related link is on no line.
          const lines = [...new Set(noteLinks.map((link) => link.line))]
            .filter((line) => line > 0)
            .toSorted((a, b) => a - b)
            .map((line) => ({ line, text: text[line - 1]?.trim() ?? '' }))
          const related = noteLinks.every((link) => link.kind === 'related')
          return { from, lines, related }
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
      <Collapsible.Trigger className="group/section flex h-8 w-full items-center gap-1.5 px-3 text-start text-xs font-medium text-ink-muted outline-none hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus">
        <Icon.Next
          aria-hidden="true"
          className="size-2.5 shrink-0 transition-transform duration-150 group-data-panel-open/section:rotate-90"
        />
        <span className="flex-1">{title}</span>
        {count !== undefined && (
          <span className="text-ink-faint tabular-nums">{count}</span>
        )}
      </Collapsible.Trigger>
      <Collapsible.Panel className="px-1.5 pb-2">{children}</Collapsible.Panel>
    </Collapsible.Root>
  )
}

/** Why Theorem suggests a link, in the words the pane shows. */
const REASONS: Record<Theorem.FilesSuggestionReason, string> = {
  identity: 'The same thing',
  mention: 'Mentioned here',
  similarity: 'Similar',
  structure: 'Nearby in the graph',
  inference: 'Inferred',
}

/**
 * The links Theorem suggests for the note: those above the tenant's
 * threshold, each to accept, reject or stop suggesting.
 */
function Suggestions({
  client,
  path,
}: {
  client: WorkspaceClient
  path: string
}) {
  const queryClient = useQueryClient()
  const abilities = client.theorem!
  const suggestions = useIndexQuery(client, ['suggestions', path], () =>
    abilities.suggestions(path, { limit: 12 }),
  )
  const mutationKey = ['workspace', client.workspace.id, 'suggestion']
  const decide = useMutation({
    mutationKey,
    mutationFn: ({
      candidateId,
      decision,
    }: {
      candidateId: string
      decision: Theorem.FilesSuggestionDecision
    }) => abilities.decide(candidateId, decision),
    // Accepting adds a link, and may rewrite the note; the row stays hidden
    // until the index says so.
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: workspaceIndexKey(client.workspace.id, []),
      }),
  })
  const deciding = new Set(
    useMutationState({
      filters: { mutationKey, status: 'pending' },
      select: (mutation) =>
        (mutation.state.variables as { candidateId: string }).candidateId,
    }),
  )

  const data = suggestions.data
  const shown =
    data?.status === 'ready'
      ? data.page.suggestions.filter(
          (s) => s.aboveThreshold && !deciding.has(s.candidateId),
        )
      : []
  // An agent's memory and the note made from it share a title.
  const titles = countBy(shown, (s) => s.targetTitle)
  return (
    <Section title="Suggested links" count={shown.length || undefined}>
      {suggestions.isPending
        ? empty('Loading…')
        : suggestions.isError
          ? empty('Suggestions could not be loaded.')
          : data?.status === 'unconfigured'
            ? empty('Theorem suggests links once link thresholds are set.')
            : !shown.length
              ? empty('Nothing to suggest.')
              : shown.map((suggestion) => {
                  const choose =
                    (decision: Theorem.FilesSuggestionDecision) => () =>
                      decide.mutate({
                        candidateId: suggestion.candidateId,
                        decision,
                      })
                  const inline = suggestion.kind === 'inline' && suggestion.span
                  return (
                    <div key={suggestion.candidateId}>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          title={suggestion.targetPath}
                          className={rowClass}
                          onClick={() =>
                            openFileAt({ client, path: suggestion.targetPath })
                          }
                        >
                          <Icon.Link className="size-4 shrink-0 text-ink-faint" />
                          <span className="min-w-0 truncate">
                            {suggestion.targetTitle}
                          </span>
                          {titles[suggestion.targetTitle]! > 1 && (
                            <span className="ms-auto shrink-0 text-xs text-ink-faint">
                              {folderOf(suggestion.targetPath)}
                            </span>
                          )}
                        </button>
                        <TooltipIconButton
                          tooltip={inline ? 'Make it a link' : 'Link them'}
                          className="shrink-0 text-ink-faint hover:text-ink"
                          onClick={choose('accept')}
                        >
                          <Icon.Check className="size-3.5" />
                        </TooltipIconButton>
                        <TooltipIconButton
                          tooltip="Not related"
                          className="shrink-0 text-ink-faint hover:text-ink"
                          onClick={choose('reject')}
                        >
                          <Icon.Close className="size-3.5" />
                        </TooltipIconButton>
                        <TooltipIconButton
                          tooltip="Stop suggesting this"
                          className="shrink-0 text-ink-faint hover:text-ink"
                          onClick={choose('mute')}
                        >
                          <Icon.Mute className="size-3.5" strokeWidth={1.75} />
                        </TooltipIconButton>
                      </div>
                      <p className="ms-7 me-1.5 line-clamp-2 text-xs text-ink-muted">
                        {REASONS[suggestion.reason]}
                        {suggestion.span &&
                          `: “${suggestion.span.text}”, line ${suggestion.span.line}`}
                      </p>
                    </div>
                  )
                })}
      {decide.isError && (
        <p role="alert" className="px-1.5 py-1 text-xs text-error-ink">
          That could not be saved.
        </p>
      )}
    </Section>
  )
}

const folderOf = (path: string) => {
  const folder = dirname(path)
  return folder === '.' ? '/' : folder
}

const empty = (text: string) => (
  <p className="px-1.5 py-1 text-sm text-ink-faint">{text}</p>
)

/** A link made by accepting a suggestion, with no place in the text. */
const RelatedMark = () => (
  <span className="shrink-0 text-xs text-ink-faint">Related</span>
)

const rowClass =
  'flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-start text-sm outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus'

/**
 * Beside a file: the notes linking to it, the links it makes and its tags, as
 * Obsidian's backlinks, outgoing links and tags panes show them. In the
 * Theorem vault, also the links Theorem suggests.
 */
export function LinksPane({
  className,
  ...file
}: FileViewProps & { className?: string }) {
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
      className={cn(
        'w-64 shrink-0 overflow-y-auto border-l border-separator',
        className,
      )}
    >
      <Section title="Backlinks" count={backlinks.data?.length}>
        {backlinks.isPending
          ? empty('Loading…')
          : !backlinks.data?.length
            ? empty('No notes link here.')
            : backlinks.data.map(({ from, lines, related }) => (
                <div key={from}>
                  <button
                    type="button"
                    title={from}
                    className={rowClass}
                    onClick={() => openFileAt({ client, path: from })}
                  >
                    <Icon.TreeFile className="size-4 shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1 truncate">
                      {titleOf(from)}
                    </span>
                    {related && <RelatedMark />}
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
                    <span className="min-w-0 flex-1 truncate">
                      {titleOf(link.resolved ?? link.target)}
                    </span>
                    {link.kind === 'related' && <RelatedMark />}
                  </button>
                ))}
        </Section>
      )}
      {markdown && client.theorem && (
        <Suggestions client={client} path={path} />
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
