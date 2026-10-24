// SOURCING: Base UI Combobox (inline list with filtering and keyboard
// navigation) inside ui/dialog, as note-picker.tsx uses it, over the
// workspace tree's files.
import { Combobox } from '@base-ui/react/combobox'
import { Icon } from '@/components/icons'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { WorkspaceClient, WorkspaceEntry } from '@/lib/workspace/types'
import { useWorkspaceTree } from '@/lib/workspace/workspaces'

/** Pick a file from a workspace. */
export function FilePicker({
  client,
  open,
  onOpenChange,
  title,
  onPick,
  exclude,
}: {
  client: WorkspaceClient
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onPick: (entry: WorkspaceEntry) => void
  /** A path to leave out, such as the file being edited. */
  exclude?: string
}) {
  const tree = useWorkspaceTree(client)
  const files = (tree.data ?? [])
    .filter((e) => e.kind === 'file' && e.path !== exclude)
    .toSorted((a, b) => a.path.localeCompare(b.path))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-3 sm:max-w-md">
        <DialogTitle className="px-1 text-sm font-medium">{title}</DialogTitle>
        <Combobox.Root<WorkspaceEntry>
          inline
          open
          items={files}
          itemToStringLabel={(e) => e.path}
          isItemEqualToValue={(a, b) => a.id === b.id}
          onValueChange={(entry) => {
            if (!entry) return
            onPick(entry)
            onOpenChange(false)
          }}
        >
          <div className="flex items-center gap-2 rounded-lg border border-control bg-background px-2.5">
            <Icon.Search className="size-4 text-ink-faint" />
            <Combobox.Input
              autoFocus
              placeholder="Search files"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
          </div>
          <Combobox.Empty className="px-2 py-6 text-center text-sm text-ink-muted empty:hidden">
            {tree.isPending ? 'Loading…' : 'No files match.'}
          </Combobox.Empty>
          <Combobox.List className="max-h-72 overflow-y-auto">
            {(entry: WorkspaceEntry) => (
              <Combobox.Item
                key={entry.id}
                value={entry}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-hover"
              >
                <Icon.TreeFile className="size-4 shrink-0 text-ink-faint" />
                <span className="min-w-0 truncate">{entry.path}</span>
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Root>
      </DialogContent>
    </Dialog>
  )
}
