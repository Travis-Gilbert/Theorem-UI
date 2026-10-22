// SOURCING: zustand + zustand/middleware persist (per-browser shell preferences; durable data stays in Theorem)
import type { SerializedDockview } from 'dockview-react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** A project's desktop dock arrangement. */
export type SavedLayout = {
  /** Conversation the layout's artifact panels belong to. */
  threadId: string | undefined
  dock: SerializedDockview
}

type ShellState = {
  /** Project whose threads the sidebar lists. Falls back to the first project. */
  projectId: string | undefined
  /** Desktop dock layouts by project. Phones use a drawer instead. */
  layouts: Readonly<Record<string, SavedLayout>>
  /**
   * Conversation chat mode last showed; undefined for a new chat. Spaces and
   * the IDE keep it open behind them, so switching back returns to it. Not
   * persisted: a reload starts from the URL.
   */
  chatThreadId: string | undefined
  setProjectId: (projectId: string) => void
  saveLayout: (projectId: string, layout: SavedLayout) => void
  setChatThreadId: (threadId: string | undefined) => void
}

export const useShell = create<ShellState>()(
  persist(
    (set) => ({
      projectId: undefined,
      layouts: {},
      chatThreadId: undefined,
      setProjectId: (projectId) => set({ projectId }),
      saveLayout: (projectId, layout) =>
        set((s) => ({ layouts: { ...s.layouts, [projectId]: layout } })),
      setChatThreadId: (chatThreadId) => set({ chatThreadId }),
    }),
    {
      name: 'theorem-ui:shell',
      // Version 0 kept a sidebarOpen flag that the dock's edge group replaced.
      version: 1,
      partialize: ({ projectId, layouts }) => ({ projectId, layouts }),
      migrate: (persisted) => ({
        projectId: (persisted as { projectId?: string } | undefined)?.projectId,
        layouts: {},
      }),
    },
  ),
)
