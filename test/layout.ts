// SOURCING: React Flow's own test shim, mockReactFlow() from
// https://reactflow.dev/learn/advanced-use/testing (ResizeObserver,
// DOMMatrixReadOnly, offset sizes from inline styles, SVG getBBox), with the
// client sizes TanStack Virtual reads added, and made undoable: bun runs every
// test file in one process, and the other files should keep happy-dom as it
// is. happy-dom does no layout, so nothing measures without this.

class ResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}

  observe(target: HTMLElement) {
    setTimeout(() => {
      // Later React Flow reads the entry's contentRect, which the guide's
      // shim leaves out.
      const contentRect = {
        width: target.offsetWidth,
        height: target.offsetHeight,
      }
      this.callback(
        [{ target, contentRect } as unknown as ResizeObserverEntry],
        this,
      )
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

const SIZES = [
  'offsetWidth',
  'offsetHeight',
  'clientWidth',
  'clientHeight',
] as const

/**
 * Gives elements sizes in happy-dom; returns the undo. Elements sized in
 * pixels measure as their style says; the rest (React Flow's panes, a
 * virtualized list's scroller, sized in percent or by flex) measure as
 * `viewport`, where the guide's shim gives 1, so `fitView` has a window to
 * fit into and a list has rows to show.
 */
export function mockLayout(viewport = { width: 1600, height: 1000 }) {
  const size = (value: string, fallback: number) =>
    value.endsWith('px') ? parseFloat(value) : fallback
  const saved = {
    ResizeObserver: globalThis.ResizeObserver,
    DOMMatrixReadOnly: globalThis.DOMMatrixReadOnly,
    getBBox: Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox'),
    sizes: SIZES.map((key) =>
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
    ),
  }
  Object.assign(globalThis, { ResizeObserver, DOMMatrixReadOnly })
  for (const key of SIZES) {
    const width = key.endsWith('Width')
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement) {
        return width
          ? size(this.style.width, viewport.width)
          : size(this.style.height, viewport.height)
      },
    })
  }
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  })

  return () => {
    Object.assign(globalThis, {
      ResizeObserver: saved.ResizeObserver,
      DOMMatrixReadOnly: saved.DOMMatrixReadOnly,
    })
    const restore = (
      target: object,
      key: string,
      descriptor?: PropertyDescriptor,
    ) => {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else Reflect.deleteProperty(target, key)
    }
    SIZES.forEach((key, i) =>
      restore(HTMLElement.prototype, key, saved.sizes[i]),
    )
    restore(SVGElement.prototype, 'getBBox', saved.getBBox)
  }
}
