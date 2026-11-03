// SOURCING: zustand + zustand/middleware persist (the Vault's dock layout, per
// browser, as shell-state.ts keeps the shell's), and a plain zustand store for
// the file the Vault's panels follow, of the same shape as the inspector's.
import type { SerializedDockview } from 'dockview-core'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INSPECTOR_TOOLS } from '@/components/inspector/inspector-state'
import type { WorkspaceFileRef } from '@/lib/workspace/open'

/** The panels besides the open files, which the status bar shows and hides. */
export const VAULT_TOOLS = { files: 'Files', ...INSPECTOR_TOOLS } as const
export type VaultTool = keyof typeof VAULT_TOOLS

type VaultLayout = {
  /** Undefined until the Vault is first arranged; then the default layout. */
  layout: SerializedDockview | undefined
  saveLayout: (layout: SerializedDockview | undefined) => void
}

/**
 * The Vault's arrangement. It has a key of its own: 'theorem-ui:vault' now
 * holds only the graph's settings (useGraphPrefs), which this must not clobber.
 */
export const useVaultLayout = create<VaultLayout>()(
  persist(
    (set) => ({
      layout: undefined,
      saveLayout: (layout) => set({ layout }),
    }),
    {
      name: 'theorem-ui:vault-layout',
      version: 1,
      partialize: ({ layout }) => ({ layout }),
    },
  ),
)

/**
 * The file the Vault's outline, links, graph and status bar follow: its file
 * tab last brought forward, which stays while another panel has focus. It is
 * apart from the dock's inspected file, so leaving the Vault finds the dock's
 * inspector where it was.
 */
export const useVaultFile = create<{ file: WorkspaceFileRef | undefined }>(
  () => ({ file: undefined }),
)
