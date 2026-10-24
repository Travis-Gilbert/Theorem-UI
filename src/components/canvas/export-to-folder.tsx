// SOURCING: Base UI Menu (which open folder to write to), as rail.tsx builds
// its menus; @tanstack/react-query (the notes from their shared cache, the
// export as a mutation); space-export.ts writes the file (plan D15).
import { Menu } from '@base-ui/react/menu'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon } from '@/components/icons'
import { menuItem, menuPopup } from '@/components/shell/sidebar'
import { Button } from '@/components/ui/button'
import { exportSpace } from '@/lib/canvas/space-export'
import { describeError } from '@/lib/theorem/client'
import type { Theorem } from '@/lib/theorem/client'
import { fetchNote, noteKey } from '@/lib/theorem/notes'
import { openWorkspaceFile } from '@/lib/workspace/open'
import type { WorkspaceSummary } from '@/lib/workspace/types'
import { useWorkspaces, workspaceClient } from '@/lib/workspace/workspaces'

/**
 * "Export to folder": writes the Space as `<project title>.canvas` at the top
 * of an open folder and opens it there. Shown only when a folder is open.
 */
export function ExportToFolder({
  title,
  space,
}: {
  title: string
  space: Theorem.Space
}) {
  const queryClient = useQueryClient()
  const { workspaces } = useWorkspaces()

  const exporting = useMutation({
    mutationFn: async (workspace: WorkspaceSummary) => {
      const done = await exportSpace(
        workspaceClient(workspace),
        title,
        space,
        // The cache holds each open note's latest Markdown, saved or not.
        async (documentId) =>
          (
            await queryClient.fetchQuery({
              queryKey: noteKey(documentId),
              queryFn: () => fetchNote(documentId),
              staleTime: Infinity,
            })
          ).markdown,
      )
      openWorkspaceFile({ workspaceId: workspace.id, path: done.path })
      return done
    },
  })

  if (!workspaces.length) return null
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              variant="outline"
              size="sm"
              disabled={exporting.isPending}
            />
          }
        >
          <Icon.TreeFolderOpen />
          Export to folder
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="start" sideOffset={6} className="z-50">
            <Menu.Popup className={`min-w-48 ${menuPopup}`}>
              {workspaces.map((workspace) => (
                <Menu.Item
                  key={workspace.id}
                  className={menuItem}
                  onClick={() => exporting.mutate(workspace)}
                >
                  <Icon.TreeFolder className="size-4 text-ink-faint" />
                  {workspace.name}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {exporting.isError && (
        <span className="text-xs text-error-ink">
          Not exported: {describeError(exporting.error)}
        </span>
      )}
      {exporting.data?.skipped ? (
        <span className="text-xs text-ink-muted">
          Drawings have no canvas form and were left out.
        </span>
      ) : null}
    </>
  )
}
