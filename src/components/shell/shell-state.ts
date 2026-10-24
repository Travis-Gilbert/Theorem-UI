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

/** One tab of the right-hand terminal: its own agent thread, made on its first turn. */
export type TerminalTab = { id: string; title: string; threadId?: string }

/** What the right-hand drawer shows; only the terminal so far. */
export type SideDrawer = 'terminal'

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
  /** Whether the chat panel's file explorer is expanded. */
  explorerOpen: boolean
  /** Whether the agent terminal drawer is up. Not persisted. */
  terminalOpen: boolean
  /** The bottom drawer's snap point: its height as a share of the window. */
  terminalHeight: number
  /** Each project's current agent-terminal thread. */
  terminalThreads: Readonly<Record<string, string>>
  /** Every thread the terminal has made, kept out of the chat list. */
  terminalThreadIds: readonly string[]
  /** What the right-hand drawer shows, when it is open. Not persisted. */
  sideDrawer: SideDrawer | undefined
  /** The right-hand drawer's width in px on desktop, set by dragging its edge. */
  sideWidth: number
  /** Each project's right-hand terminal tabs, in order, and the one showing. */
  terminalTabs: Readonly<
    Record<string, { tabs: readonly TerminalTab[]; active: string }>
  >
  setProjectId: (projectId: string) => void
  saveLayout: (projectId: string, layout: SavedLayout) => void
  setPanelWidth: (width: number) => void
  togglePanel: (mode: ShellMode) => void
  setChatThreadId: (threadId: string | undefined) => void
  toggleExplorer: () => void
  setTerminalOpen: (open: boolean) => void
  setTerminalHeight: (height: number) => void
  setTerminalThread: (projectId: string, threadId: string | undefined) => void
  setSideDrawer: (drawer: SideDrawer | undefined) => void
  setSideWidth: (width: number) => void
  openTerminalTab: (projectId: string) => void
  closeTerminalTab: (projectId: string, tabId: string) => void
  selectTerminalTab: (projectId: string, tabId: string) => void
  /** Records a tab's thread and title, or clears its thread so it starts over. */
  updateTerminalTab: (
    projectId: string,
    tabId: string,
    change: { threadId: string | undefined; title?: string },
  ) => void
}

const newTab = (): TerminalTab => ({
  id: crypto.randomUUID(),
  title: 'agent',
})

export const useShell = create<ShellState>()(
  persist(
    (set) => ({
      projectId: undefined,
      layouts: {},
      panelWidth: PANEL_WIDTH.default,
      panelCollapsed: {},
      chatThreadId: undefined,
      explorerOpen: true,
      terminalOpen: false,
      terminalHeight: 0.46,
      terminalThreads: {},
      terminalThreadIds: [],
      sideDrawer: undefined,
      sideWidth: 620,
      terminalTabs: {},
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
      toggleExplorer: () => set((s) => ({ explorerOpen: !s.explorerOpen })),
      setTerminalOpen: (terminalOpen) => set({ terminalOpen }),
      setTerminalHeight: (terminalHeight) => set({ terminalHeight }),
      setTerminalThread: (projectId, threadId) =>
        set((s) => {
          const { [projectId]: _, ...rest } = s.terminalThreads
          if (!threadId) return { terminalThreads: rest }
          return {
            terminalThreads: { ...rest, [projectId]: threadId },
            terminalThreadIds: s.terminalThreadIds.includes(threadId)
              ? s.terminalThreadIds
              : [...s.terminalThreadIds, threadId],
          }
        }),
      setSideDrawer: (sideDrawer) => set({ sideDrawer }),
      setSideWidth: (sideWidth) => set({ sideWidth }),
      openTerminalTab: (projectId) =>
        set((s) => {
          const tab = newTab()
          const tabs = s.terminalTabs[projectId]?.tabs ?? []
          return {
            terminalTabs: {
              ...s.terminalTabs,
              [projectId]: { tabs: [...tabs, tab], active: tab.id },
            },
          }
        }),
      closeTerminalTab: (projectId, tabId) =>
        set((s) => {
          const current = s.terminalTabs[projectId]
          if (!current) return {}
          const at = current.tabs.findIndex((tab) => tab.id === tabId)
          const rest = current.tabs.filter((tab) => tab.id !== tabId)
          // The last tab closing leaves a fresh one, as a terminal would.
          const tabs = rest.length ? rest : [newTab()]
          const active =
            current.active === tabId
              ? (tabs[Math.min(at, tabs.length - 1)]?.id ?? '')
              : current.active
          return {
            terminalTabs: { ...s.terminalTabs, [projectId]: { tabs, active } },
          }
        }),
      selectTerminalTab: (projectId, tabId) =>
        set((s) => {
          const current = s.terminalTabs[projectId]
          if (!current?.tabs.some((tab) => tab.id === tabId)) return {}
          return {
            terminalTabs: {
              ...s.terminalTabs,
              [projectId]: { ...current, active: tabId },
            },
          }
        }),
      updateTerminalTab: (projectId, tabId, { threadId, title }) =>
        set((s) => {
          const current = s.terminalTabs[projectId]
          if (!current) return {}
          const tabs = current.tabs.map((tab) =>
            tab.id === tabId
              ? { ...tab, threadId, title: title ?? tab.title }
              : tab,
          )
          return {
            terminalTabs: {
              ...s.terminalTabs,
              [projectId]: { ...current, tabs },
            },
            terminalThreadIds:
              !threadId || s.terminalThreadIds.includes(threadId)
                ? s.terminalThreadIds
                : [...s.terminalThreadIds, threadId],
          }
        }),
    }),
    {
      name: 'theorem-ui:shell',
      // Version 0 kept a sidebarOpen flag that the dock's edge group replaced,
      // and version 1 docked the sidebar in that edge group. The sidebar now
      // sits beside the dock, so older layouts are dropped rather than restored
      // with a panel the dock no longer has. Version 3 narrowed the panel's
      // range, so widths saved against the wider one start over at the default.
      version: 3,
      partialize: ({
        projectId,
        layouts,
        panelWidth,
        panelCollapsed,
        explorerOpen,
        terminalHeight,
        sideWidth,
        terminalThreads,
        terminalThreadIds,
        terminalTabs,
      }) => ({
        projectId,
        layouts,
        panelWidth,
        panelCollapsed,
        explorerOpen,
        terminalHeight,
        sideWidth,
        terminalThreads,
        terminalThreadIds,
        terminalTabs,
      }),
      migrate: (persisted, version) => {
        const state = persisted as Partial<ShellState> | undefined
        if (version === 2) return { ...state, panelWidth: PANEL_WIDTH.default }
        return { projectId: state?.projectId, layouts: {} }
      },
    },
  ),
)
