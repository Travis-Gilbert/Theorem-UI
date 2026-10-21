// SOURCING: zustand + zustand/middleware persist (per-browser shell preferences; durable data stays in Theorem)
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ShellState = {
  /** Project whose threads the sidebar lists. Falls back to the first project. */
  projectId: string | undefined
  /** Desktop sidebar visibility. Phones use a drawer instead. */
  sidebarOpen: boolean
  setProjectId: (projectId: string) => void
  setSidebarOpen: (open: boolean) => void
}

export const useShell = create<ShellState>()(
  persist(
    (set) => ({
      projectId: undefined,
      sidebarOpen: true,
      setProjectId: (projectId) => set({ projectId }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    { name: 'theorem-ui:shell' },
  ),
)
