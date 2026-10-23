// SOURCING: react-dom/client (React elements a block displays render into
// their own root), object-inspect (any other value shown as text), and the
// platform's ResizeObserver (the frame reports its height to the page).
import inspect from 'object-inspect'
import { isValidElement } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { Display } from './cell'

/** Shows displayed values in `container`, each in its own element. */
export function createDisplay(container: HTMLElement): Display {
  const roots: Array<Root> = []
  return {
    show(value) {
      const holder = document.createElement('div')
      holder.className = 'theorem-display'
      container.append(holder)
      if (isValidElement(value)) {
        const root = createRoot(holder)
        root.render(value as ReactNode)
        roots.push(root)
      } else if (value instanceof Node) {
        holder.append(value)
      } else {
        const pre = document.createElement('pre')
        pre.textContent =
          typeof value === 'string' ? value : inspect(value, { depth: 4 })
        holder.append(pre)
      }
    },
    clear() {
      for (const root of roots.splice(0)) root.unmount()
      container.replaceChildren()
    },
  }
}

/** Calls `report` with the document's height whenever it changes. */
export function observeHeight(report: (height: number) => void): void {
  let last = -1
  const measure = () => {
    const height = Math.ceil(document.documentElement.scrollHeight)
    if (height !== last) report((last = height))
  }
  new ResizeObserver(measure).observe(document.documentElement)
  measure()
}
