// SOURCING: React Flow's own test shim, mockReactFlow() from
// https://reactflow.dev/learn/advanced-use/testing (ResizeObserver,
// DOMMatrixReadOnly, offset sizes from inline styles, SVG getBBox), made
// undoable: bun runs every test file in one process, and the other files
// should keep happy-dom as it is.

class ResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}

  observe(target: HTMLElement) {
    setTimeout(() => {
      // Later React Flow reads the entry's contentRect, which the guide's
      // shim leaves out.
      const contentRect = { width: target.offsetWidth, height: target.offsetHeight }
      this.callback([{ target, contentRect } as unknown as ResizeObserverEntry], this)
    }, 0)
  }

  unobserve() {}

  disconnect() {}
}

class DOMMatrixReadOnly {
  m22: number
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([1-9.])\)/)?.[1]
    this.m22 = scale !== undefined ? +scale : 1
  }
}

/**
 * Lets React Flow measure nodes in happy-dom; returns the undo. Elements
 * sized in pixels measure as their style says; the rest (the flow's own
 * panes, sized in percent) measure as `viewport`, where the guide's shim gives
 * 1, so `fitView` has a window to fit into.
 */
export function mockReactFlow(viewport = { width: 1600, height: 1000 }) {
  const size = (value: string, fallback: number) =>
    value.endsWith('px') ? parseFloat(value) : fallback
  const saved = {
    ResizeObserver: globalThis.ResizeObserver,
    DOMMatrixReadOnly: globalThis.DOMMatrixReadOnly,
    offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
    offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
    getBBox: Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox'),
  }
  Object.assign(globalThis, { ResizeObserver, DOMMatrixReadOnly })
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: {
      configurable: true,
      get(this: HTMLElement) {
        return size(this.style.height, viewport.height)
      },
    },
    offsetWidth: {
      configurable: true,
      get(this: HTMLElement) {
        return size(this.style.width, viewport.width)
      },
    },
  })
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  })

  return () => {
    Object.assign(globalThis, {
      ResizeObserver: saved.ResizeObserver,
      DOMMatrixReadOnly: saved.DOMMatrixReadOnly,
    })
    const restore = (target: object, key: string, descriptor?: PropertyDescriptor) => {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else Reflect.deleteProperty(target, key)
    }
    restore(HTMLElement.prototype, 'offsetHeight', saved.offsetHeight)
    restore(HTMLElement.prototype, 'offsetWidth', saved.offsetWidth)
    restore(SVGElement.prototype, 'getBBox', saved.getBBox)
  }
}
