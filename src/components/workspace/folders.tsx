// SOURCING: Base UI Collapsible (each folder folds), the assistant-ui
// TooltipIconButton (Open folder), WorkspaceTree (@headless-tree/react), the
// workspace hooks (react-query over the desktop workspace routes)
import { Collapsible } from '@base-ui/react/collapsible'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import type { WorkspaceSummary } from '@/lib/workspace/types'
import {
  useOpenFolder,
  useWorkspaces,
  workspaceClient,
} from '@/lib/workspace/workspaces'
import { WorkspaceTree } from './workspace-tree'

function WorkspaceSection({ workspace }: { workspace: WorkspaceSummary }) {
  return (
    <Collapsible.Root defaultOpen>
      <Collapsible.Trigger
        title={workspace.path}
        className="group/folder flex h-7 w-full items-center gap-1.5 rounded-md ps-2 pe-2 text-start text-sm font-medium transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
      >
        <Icon.Next
          aria-hidden="true"
          className="size-2.5 shrink-0 text-ink-faint transition-transform duration-150 group-data-panel-open/folder:rotate-90"
        />
        <span className="min-w-0 truncate">{workspace.name}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-(--ease-structure) data-ending-style:h-0 data-starting-style:h-0">
        <WorkspaceTree client={workspaceClient(workspace)} />
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

/**
 * The folders the person opened, each with its live file tree. Present only
 * in the desktop app, where the workspace routes answer.
 */
export function FoldersSection() {
  const { available, workspaces } = useWorkspaces()
  const openFolder = useOpenFolder()
  if (!available || (!workspaces.length && !openFolder)) return null

  return (
    <section
      aria-label="Folders"
      className="flex max-h-[50%] min-h-0 shrink-0 flex-col border-t border-separator"
    >
      <div className="flex h-9 shrink-0 items-center ps-3.5 pe-2 text-xs font-medium text-ink-faint-sheet">
        <h2 className="flex-1">Folders</h2>
        {openFolder && (
          <TooltipIconButton
            tooltip="Open folder"
            className="size-7 p-1.5"
            disabled={openFolder.isPending}
            onClick={() => openFolder.mutate()}
          >
            <Icon.Add className="size-4" />
          </TooltipIconButton>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {workspaces.length ? (
          workspaces.map((workspace) => (
            <WorkspaceSection key={workspace.id} workspace={workspace} />
          ))
        ) : (
          <p className="px-1.5 text-sm text-ink-faint-sheet">
            Open a folder to work with its files here.
          </p>
        )}
      </div>
    </section>
  )
}
