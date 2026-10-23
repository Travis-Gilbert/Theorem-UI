// SOURCING: zustand + zustand/middleware persist (per-browser shell preferences; durable data stays in Theorem)
import type { SerializedDockview } from 'dockview-react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ShellMode } from './modes'

/** A project's desktop dock arrangement. */
export type SavedLayout = {
  /** Conversation the layout's artifact panels belong to. */
  threadId: string | undefined
  dock: SerializedDockview
}

/** The context panel's working range in px; it opens at the default. */
export const PANEL_WIDTH = { min: 184, default: 224, max: 296 } as const

type ShellState = {
  /** Project whose threads the sidebar lists. Falls back to the first project. */
  projectId: string | undefined
  /** Desktop dock layouts by project. Phones use a drawer instead. */
  layouts: Readonly<Record<string, SavedLayout>>
  /** Desktop context panel width, shared by every mode. */
  panelWidth: number
  /** Modes whose context panel the user has closed; each starts open. */
  panelCollapsed: Readonly<Partial<Record<ShellMode, boolean>>>
  /**
   * Conversation chat mode last showed; undefined for a new chat. Spaces and
   * the IDE keep it open behind them, so switching back returns to it. Not
   * persisted: a reload starts from the URL.
   */
  chatThreadId: string | undefined
  setProjectId: (projectId: string) => void
  saveLayout: (projectId: string, layout: SavedLayout) => void
  setPanelWidth: (width: number) => void
  togglePanel: (mode: ShellMode) => void
  setChatThreadId: (threadId: string | undefined) => void
}

export const useShell = create<ShellState>()(
  persist(
    (set) => ({
      projectId: undefined,
      layouts: {},
      panelWidth: PANEL_WIDTH.default,
      panelCollapsed: {},
      chatThreadId: undefined,
      setProjectId: (projectId) => set({ projectId }),
      saveLayout: (projectId, layout) =>
        set((s) => ({ layouts: { ...s.layouts, [projectId]: layout } })),
      setPanelWidth: (panelWidth) => set({ panelWidth }),
      togglePanel: (mode) =>
        set((s) => ({
          panelCollapsed: {
            ...s.panelCollapsed,
            [mode]: !s.panelCollapsed[mode],
          },
        })),
      setChatThreadId: (chatThreadId) => set({ chatThreadId }),
    }),
    {
      name: 'theorem-ui:shell',
      // Version 0 kept a sidebarOpen flag that the dock's edge group replaced,
      // and version 1 docked the sidebar in that edge group. The sidebar now
      // sits beside the dock, so older layouts are dropped rather than restored
      // with a panel the dock no longer has. Version 3 narrowed the panel's
      // range, so widths saved against the wider one start over at the default.
      version: 3,
      partialize: ({ projectId, layouts, panelWidth, panelCollapsed }) => ({
        projectId,
        layouts,
        panelWidth,
        panelCollapsed,
      }),
      migrate: (persisted, version) => {
        const state = persisted as Partial<ShellState> | undefined
        if (version === 2) return { ...state, panelWidth: PANEL_WIDTH.default }
        return { projectId: state?.projectId, layouts: {} }
      },
    },
  ),
)
