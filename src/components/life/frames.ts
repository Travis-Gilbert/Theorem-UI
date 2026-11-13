// SOURCING: a plain listener set. Both fields keep their pixels between frames (textmode.js creates its context with preserveDrawingBuffer; the 2D field is a 2D canvas), so a reader can sample the canvas whenever it likes; this only says when there is something new to sample. Liquid glass (components/glass/liquid-glass) is the reader.

type Listener = (canvas: HTMLCanvasElement) => void

const listeners = new Set<Listener>()

/** Hears each frame the Life field draws, with the canvas it drew on. */
export function onLifeFrame(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Called by a field at the end of each draw. */
export function publishLifeFrame(canvas: HTMLCanvasElement) {
  for (const listener of listeners) listener(canvas)
}
