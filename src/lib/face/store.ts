// SOURCING: one face for the page, made on first use, as lib/kit/driver.ts keeps one Kit driver; zustand for the little the shell needs to know about it. `localStorage` is the shelf its definitions and its days baseline are kept on.
import { create } from 'zustand'
import type { Shelf } from './book'
import { Face } from './engine'

let face: Face | undefined

const shelf = (): Shelf | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** The page's one face. Whoever moves Theo moves this. */
export function theFace(): Face {
  face ??= new Face({ seed: (Date.now() & 0x7fffffff) | 1, shelf: shelf() })
  return face
}

/** Replaces the page's face; tests and stories use one with a fixed seed and clock. */
export function setFace(next: Face | undefined) {
  face = next
}

interface FaceStageState {
  /** Whether the face is on the page, and so whether a turn may be given its operations. */
  readonly mounted: boolean
  /** What draws it, once known. */
  readonly painter?: 'luma' | 'canvas2d'
}

export const useFaceStage = create<FaceStageState>(() => ({ mounted: false }))
