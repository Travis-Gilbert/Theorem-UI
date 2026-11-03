// SOURCING: zustand + zustand/middleware persist (the Vault's dock layout and
// graph settings, per browser, as shell-state.ts keeps the shell's), and a
// plain zustand store for the file the Vault's panels follow.
import type { SerializedDockview } from 'dockview-react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WorkspaceFileRef } from '@/lib/workspace/open'

/** The panels besides the open files, which the status bar shows and hides. */
export const VAULT_TOOLS = {
  files: 'Files',
  outline: 'Outline',
  links: 'Links',
  graph: 'Graph',
} as const
export type VaultTool = keyof typeof VAULT_TOOLS

export interface GraphSettings {
  tags: boolean
  attachments: boolean
  orphans: boolean
  unresolved: boolean
  /** Show only what lies near the open note. */
  local: boolean
  /** The local graph's reach, in links. */
  depth: number
}

type VaultPrefs = {
  /** Undefined until the Vault is first arranged; then the default layout. */
  layout: SerializedDockview | undefined
  graph: GraphSettings
  saveLayout: (layout: SerializedDockview | undefined) => void
  setGraph: (change: Partial<GraphSettings>) => void
}

/** Obsidian's global graph starts with every kind of node showing. */
const DEFAULT_GRAPH: GraphSettings = {
  tags: true,
  attachments: true,
  orphans: true,
  unresolved: false,
  local: false,
  depth: 1,
}

export const useVaultPrefs = create<VaultPrefs>()(
  persist(
    (set) => ({
      layout: undefined,
      graph: DEFAULT_GRAPH,
      saveLayout: (layout) => set({ layout }),
      setGraph: (change) => set((s) => ({ graph: { ...s.graph, ...change } })),
    }),
    {
      name: 'theorem-ui:vault',
      version: 1,
      partialize: ({ layout, graph }) => ({ layout, graph }),
    },
  ),
)

/**
 * The file the Vault's outline, links, graph and status bar follow: the file
 * tab last brought forward, which stays while another panel has focus.
 */
export const useVaultFile = create<{ file: WorkspaceFileRef | undefined }>(
  () => ({ file: undefined }),
)
