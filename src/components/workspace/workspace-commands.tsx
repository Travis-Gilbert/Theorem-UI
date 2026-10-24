// SOURCING: @tanstack/react-hotkeys (the app-wide shortcuts, Obsidian's
// defaults: Mod+O for the quick switcher, Mod+Shift+F for search) and the
// folder dialogs they open.
import { useHotkey } from '@tanstack/react-hotkeys'
import { useWorkspaces } from '@/lib/workspace/workspaces'
import { FolderSettingsDialog } from './folder-settings-dialog'
import { QuickSwitcher, openQuickSwitcher } from './quick-switcher'
import { SearchDialog, openSearch } from './search-dialog'

/**
 * The folder workspace's dialogs and their shortcuts, mounted once in the
 * shell. Nothing is mounted or bound outside the desktop app.
 */
export function WorkspaceCommands() {
  const { available } = useWorkspaces()
  useHotkey('Mod+O', () => openQuickSwitcher(), { enabled: available })
  useHotkey('Mod+Shift+F', () => openSearch(), { enabled: available })
  if (!available) return null
  return (
    <>
      <QuickSwitcher />
      <SearchDialog />
      <FolderSettingsDialog />
    </>
  )
}
