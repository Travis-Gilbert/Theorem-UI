// SOURCING: zustand (the open composer request; the conversation it starts lives in Theorem chat)
import { create } from 'zustand'
import type { CanvasSource } from '@/lib/theorem/canvas-agent'

export type ComposerRequest = {
  /** Viewport point the composer opens at. */
  anchor: { x: number; y: number }
  sources: CanvasSource[]
  /** Canvas point for the result when no source is placed. */
  at?: { x: number; y: number }
}

type ComposerState = {
  request: ComposerRequest | undefined
  /** A run is streaming; only Stop ends it, so dismissal waits. */
  busy: boolean
  setBusy: (busy: boolean) => void
  open: (request: ComposerRequest) => void
  close: () => void
  removeSource: (index: number) => void
}

export const useComposer = create<ComposerState>()((set) => ({
  request: undefined,
  busy: false,
  setBusy: (busy) => set({ busy }),
  open: (request) => set((s) => (s.busy ? s : { request })),
  close: () => set({ request: undefined, busy: false }),
  removeSource: (index) =>
    set((s) =>
      s.request
        ? {
            request: {
              ...s.request,
              sources: s.request.sources.filter((_, i) => i !== index),
            },
          }
        : s,
    ),
}))

/** Code-point offsets of a quote in Markdown, as Theorem counts characters. */
export function quoteRange(markdown: string, quote: string) {
  const index = markdown.indexOf(quote)
  if (index < 0 || !quote) return undefined
  const start = [...markdown.slice(0, index)].length
  return { start, end: start + [...quote].length }
}
