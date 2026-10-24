// SOURCING: zustand (the mounted canvas's handle, for panels outside its React Flow provider)
import { create } from 'zustand'

/** What the mounted canvas lets other surfaces do with it. */
export type CanvasHandle = { focus: (placementId: string) => void }

type CanvasView = {
  /** Set while a canvas is mounted. */
  canvas: CanvasHandle | undefined
  /** Counts focus requests, so the phone drawer can close on each one. */
  focusCount: number
  /** Brings a card into view and selects it; false when no canvas is mounted. */
  focus: (placementId: string) => boolean
}

export const useCanvasView = create<CanvasView>()((set, get) => ({
  canvas: undefined,
  focusCount: 0,
  focus: (placementId) => {
    const { canvas } = get()
    if (!canvas) return false
    canvas.focus(placementId)
    set((s) => ({ focusCount: s.focusCount + 1 }))
    return true
  },
}))
