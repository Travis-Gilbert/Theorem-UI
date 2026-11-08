// SOURCING: zustand (the mounted canvas's handle and where in it a person is, for surfaces outside its React Flow provider)
import { create } from 'zustand'

/** What the mounted canvas lets other surfaces do with it. */
export type CanvasHandle = { focus: (placementId: string) => void }

/** A canvas inside the project's, on the way down to the one on screen. */
export type CanvasCrumb = { spaceId: string; title: string }

type CanvasView = {
  /** Set while a canvas is mounted. */
  canvas: CanvasHandle | undefined
  /** Counts focus requests, so the phone drawer can close on each one. */
  focusCount: number
  /** Brings a card into view and selects it; false when no canvas is mounted. */
  focus: (placementId: string) => boolean
  /** The canvases entered from the project's; the last is on screen. */
  trail: readonly CanvasCrumb[]
  /** The project the trail belongs to. */
  projectId: string | undefined
  /** A new project starts at its own canvas, whichever canvas was open before. */
  setProject: (projectId: string) => void
  /** Goes into a canvas, or back to it when it is already on the way. */
  enter: (crumb: CanvasCrumb) => void
  /** Goes back up the trail; -1 is the project's own canvas. */
  backTo: (index: number) => void
  renameCrumb: (spaceId: string, title: string) => void
  /** The card being typed in. Only one has an editor, however many are shown. */
  editing: string | undefined
  /** The card just added, which springs in and takes the selection. */
  arriving: string | undefined
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
  trail: [],
  projectId: undefined,
  setProject: (projectId) =>
    set((s) =>
      s.projectId === projectId
        ? s
        : {
            projectId,
            // An undefined project means the trail was entered from outside
            // the canvas (a block in a note), for this very mount.
            trail: s.projectId === undefined ? s.trail : [],
            editing: undefined,
          },
    ),
  enter: (crumb) =>
    set((s) => {
      // From outside a canvas (a block in a note) the way down starts at the
      // project's own canvas, whatever trail an earlier visit left.
      if (!s.canvas)
        return { trail: [crumb], editing: undefined, projectId: undefined }
      const at = s.trail.findIndex((c) => c.spaceId === crumb.spaceId)
      return {
        trail: at >= 0 ? s.trail.slice(0, at + 1) : [...s.trail, crumb],
        editing: undefined,
      }
    }),
  backTo: (index) =>
    set((s) => ({ trail: s.trail.slice(0, index + 1), editing: undefined })),
  renameCrumb: (spaceId, title) =>
    set((s) => ({
      trail: s.trail.map((c) => (c.spaceId === spaceId ? { ...c, title } : c)),
    })),
  editing: undefined,
  arriving: undefined,
}))
