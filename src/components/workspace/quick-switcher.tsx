// SOURCING: Base UI Combobox (inline list with keyboard navigation) inside
// ui/dialog, as file-picker.tsx uses it; fuzzysort (Obsidian-style fuzzy
// matching over names and paths, ranked, with the matched characters);
// useAllWorkspaceTrees (react-query, kept current); zustand (open state);
// theoremMark for what Theorem holds as more than a file.
import { Combobox } from '@base-ui/react/combobox'
import fuzzysort from 'fuzzysort'
import type { Result } from 'fuzzysort'
import { basename, dirname, extname } from 'pathe'
import { useState } from 'react'
import { create } from 'zustand'
import { Icon } from '@/components/icons'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { theoremMark } from './entry-mark'
import { openOrCreate } from '@/lib/workspace/notes'
import { openWorkspaceFile } from '@/lib/workspace/open'
import type { WorkspaceClient, WorkspaceEntry } from '@/lib/workspace/types'
import { useAllWorkspaceTrees } from '@/lib/workspace/workspaces'

export const useQuickSwitcher = create<{ open: boolean }>()(() => ({
  open: false,
}))

export const openQuickSwitcher = () => useQuickSwitcher.setState({ open: true })

const close = () => useQuickSwitcher.setState({ open: false })

const SHOWN = 50

interface FileChoice {
  kind: 'file'
  client: WorkspaceClient
  entry: WorkspaceEntry
  /** A note's name without `.md`, any other file's with its extension. */
  name: string
  match?: Result
}

interface CreateChoice {
  kind: 'create'
  client: WorkspaceClient
  path: string
}

type Choice = FileChoice | CreateChoice

const nameOf = (path: string) =>
  extname(path) === '.md' ? basename(path, '.md') : basename(path)

const keyOf = (choice: Choice) =>
  `${choice.kind}:${choice.client.workspace.id}:${
    choice.kind === 'file' ? choice.entry.path : choice.path
  }`

/** The files matching `query`, best first; the recently changed ones without. */
function useChoices(query: string): Array<Choice> {
  const trees = useAllWorkspaceTrees()
  const files = trees.flatMap(({ client, entries }) =>
    entries
      .filter((entry) => entry.kind === 'file')
      .map((entry): FileChoice => ({
        kind: 'file',
        client,
        entry,
        name: nameOf(entry.path),
      })),
  )
  const q = query.trim()
  if (!q)
    return files
      .toSorted((a, b) => b.entry.mtimeMs - a.entry.mtimeMs)
      .slice(0, SHOWN)

  const matches = fuzzysort
    .go(q, files, {
      keys: ['name', (file: FileChoice) => file.entry.path],
      limit: SHOWN,
      threshold: 0,
    })
    .map((result): FileChoice => ({ ...result.obj, match: result[0] }))
  // A note named as typed opens; any other name can be made, in each folder.
  const exact = files.some(
    (file) => file.name.toLowerCase() === q.toLowerCase(),
  )
  const creates = exact
    ? []
    : trees.map(({ client }): CreateChoice => ({
        kind: 'create',
        client,
        path: extname(q) ? q : `${q}.md`,
      }))
  return [...matches, ...creates]
}

function Name({ choice }: { choice: FileChoice }) {
  const { match, name } = choice
  if (!match?.indexes.length) return name
  return match.highlight((part, i) => (
    <b key={i} className="font-semibold text-ink">
      {part}
    </b>
  ))
}

function SwitcherBody() {
  const [query, setQuery] = useState('')
  const choices = useChoices(query)
  const several = new Set(choices.map((c) => c.client)).size > 1

  return (
    <Combobox.Root<Choice>
      inline
      open
      items={choices}
      filter={null}
      autoHighlight
      inputValue={query}
      onInputValueChange={setQuery}
      itemToStringLabel={keyOf}
      isItemEqualToValue={(a, b) => keyOf(a) === keyOf(b)}
      onValueChange={(choice) => {
        if (!choice) return
        close()
        if (choice.kind === 'file')
          openWorkspaceFile({
            workspaceId: choice.client.workspace.id,
            path: choice.entry.path,
          })
        else void openOrCreate(choice.client, choice.path)
      }}
    >
      <div className="flex items-center gap-2 rounded-lg border border-control bg-background px-2.5">
        <Icon.Search className="size-4 text-ink-faint" />
        <Combobox.Input
          autoFocus
          placeholder="Find or create a note"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
        />
      </div>
      <Combobox.Empty className="px-2 py-6 text-center text-sm text-ink-muted empty:hidden">
        No files yet.
      </Combobox.Empty>
      <Combobox.List className="max-h-80 overflow-y-auto">
        {(choice: Choice) => {
          if (choice.kind === 'create')
            return (
              <Combobox.Item
                key={keyOf(choice)}
                value={choice}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-hover"
              >
                <Icon.Add className="size-4 shrink-0 text-ink-faint" />
                <span className="min-w-0 truncate">
                  Create “{nameOf(choice.path)}”
                  {several && (
                    <span className="text-ink-faint">
                      {' '}
                      in {choice.client.workspace.name}
                    </span>
                  )}
                </span>
              </Combobox.Item>
            )
          const folder = dirname(choice.entry.path)
          const mark = theoremMark(choice.entry.theorem)
          const Mark = mark?.Mark ?? Icon.TreeFile
          const where = [
            several && choice.client.workspace.name,
            folder !== '.' && folder,
          ]
            .filter(Boolean)
            .join(' / ')
          return (
            <Combobox.Item
              key={keyOf(choice)}
              value={choice}
              title={mark?.label}
              className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-hover"
            >
              <Mark
                aria-hidden="true"
                className="size-4 shrink-0 text-ink-faint"
                strokeWidth={1.75}
              />
              <span className="min-w-0 truncate text-ink-muted">
                <Name choice={choice} />
              </span>
              {where && (
                <span className="ms-auto min-w-0 shrink truncate text-xs text-ink-faint">
                  {where}
                </span>
              )}
            </Combobox.Item>
          )
        }}
      </Combobox.List>
    </Combobox.Root>
  )
}

/** Open a file in any open folder by name, or make a note, as Obsidian's switcher does. */
export function QuickSwitcher() {
  const open = useQuickSwitcher((s) => s.open)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="gap-3 p-3 sm:max-w-lg">
        <DialogTitle className="sr-only">Quick switcher</DialogTitle>
        {open && <SwitcherBody />}
      </DialogContent>
    </Dialog>
  )
}
