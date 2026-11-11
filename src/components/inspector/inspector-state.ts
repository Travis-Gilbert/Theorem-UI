// SOURCING: zustand + zustand/middleware persist (the graph's settings, per
// browser, as shell-state.ts keeps the shell's), a plain zustand store for
// the file the inspector follows, and a React context naming that store.
import { createContext } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WorkspaceFileRef } from '@/lib/workspace/open'

/** The inspector's panels, which open beside the files in the dock. */
export const INSPECTOR_TOOLS = {
  outline: 'Outline',
  links: 'Links',
  graph: 'Graph',
} as const
export type InspectorTool = keyof typeof INSPECTOR_TOOLS

export const isInspectorTool = (id: string): id is InspectorTool =>
  Object.hasOwn(INSPECTOR_TOOLS, id)

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

type GraphPrefs = {
  graph: GraphSettings
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

export const useGraphPrefs = create<GraphPrefs>()(
  persist(
    (set) => ({
      graph: DEFAULT_GRAPH,
      setGraph: (change) => set((s) => ({ graph: { ...s.graph, ...change } })),
    }),
    {
      // The name the Vault kept them under, so the settings carry over.
      name: 'theorem-ui:vault',
      version: 2,
      // Version 1 also kept the Vault's own layout, which is gone.
      migrate: (persisted) => ({
        graph: {
          ...DEFAULT_GRAPH,
          ...(persisted as { graph?: Partial<GraphSettings> } | null)?.graph,
        },
      }),
      partialize: ({ graph }) => ({ graph }),
    },
  ),
)

/**
 * The file the inspector follows: the file tab last brought forward, which
 * stays while another panel has focus.
 */
export const useInspectedFile = create<{ file: WorkspaceFileRef | undefined }>(
  () => ({ file: undefined }),
)

/**
 * The store of the file the inspector's panels follow: the dock's front file,
 * unless a screen with its own files, such as the Vault, provides another.
 */
export const InspectedFileStore = createContext(useInspectedFile)
