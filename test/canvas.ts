// SOURCING: @napi-rs/canvas, the 2D canvas pdf.js itself uses outside a
// browser, behind happy-dom's <canvas>, which has no context, with its Path2D
// and ImageData, which happy-dom lacks. Undoable, as bun runs every test file
// in one process.
import { ImageData, Path2D, createCanvas } from '@napi-rs/canvas'
import type { Canvas } from '@napi-rs/canvas'

const backing = new WeakMap<HTMLCanvasElement, Canvas>()

/** The drawing behind a <canvas> element, once something drew on it. */
export const drawingOf = (element: HTMLCanvasElement) => backing.get(element)

/** Gives happy-dom's <canvas> a working 2D context; returns the undo. */
export function mockCanvas() {
  const saved = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'getContext',
  )
  const globals = { Path2D: globalThis.Path2D, ImageData: globalThis.ImageData }
  Object.assign(globalThis, { Path2D, ImageData })
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value(this: HTMLCanvasElement, type: string) {
      if (type !== '2d') return null
      let canvas = backing.get(this)
      if (canvas?.width !== this.width || canvas.height !== this.height) {
        // pdf.js removes its scratch canvases, which it reaches through
        // their contexts, so the backing canvas stands in for the element.
        canvas = Object.assign(createCanvas(this.width, this.height), {
          remove: () => this.remove(),
        })
        backing.set(this, canvas)
      }
      return canvas.getContext('2d')
    },
  })
  return () => {
    Object.assign(globalThis, globals)
    if (saved)
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', saved)
    else Reflect.deleteProperty(HTMLCanvasElement.prototype, 'getContext')
  }
}
