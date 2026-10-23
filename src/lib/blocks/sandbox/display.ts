// SOURCING: react-dom/client (React elements a block displays render into
// their own root), object-inspect (any other value shown as text), and the
// platform's ResizeObserver and MutationObserver (the frame reports its
// height, and a static copy of itself, to the page).
import inspect from 'object-inspect'
import { isValidElement } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { Display } from './cell'
import { MAX_SNAPSHOT } from './protocol'

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

const SNAPSHOT_DELAY_MS = 400

/**
 * The page as static HTML: its style elements and a copy of its body, with
 * form state written into attributes (it lives in properties), canvases as
 * images, and no scripts. The page sanitizes it again before showing it.
 */
export function snapshotHtml(): string {
  const copy = document.body.cloneNode(true) as HTMLElement
  const live = document.body.querySelectorAll('input, textarea, select, canvas')
  const copies = copy.querySelectorAll('input, textarea, select, canvas')
  live.forEach((element, index) => {
    const target = copies[index]
    if (!target) return
    if (element instanceof HTMLInputElement) {
      target.toggleAttribute('checked', element.checked)
      target.setAttribute('value', element.value)
    } else if (element instanceof HTMLTextAreaElement) {
      target.textContent = element.value
    } else if (element instanceof HTMLSelectElement) {
      for (const [i, option] of [...(target as HTMLSelectElement).options].entries())
        option.toggleAttribute('selected', i === element.selectedIndex)
    } else if (element instanceof HTMLCanvasElement) {
      const image = document.createElement('img')
      image.width = element.width
      image.height = element.height
      try {
        image.src = element.toDataURL()
      } catch {
        // A canvas that drew something it may not read back stays blank.
      }
      target.replaceWith(image)
    }
  })
  for (const script of copy.querySelectorAll('script')) script.remove()
  const styles = [...document.querySelectorAll('style')]
    .map((style) => style.outerHTML)
    .join('')
  return styles + copy.innerHTML
}

/**
 * Calls `report` with a snapshot of the page once it settles after a change,
 * for the page to show where a live frame would cost too much (a canvas card
 * far out).
 */
export function observeSnapshots(report: (html: string) => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const take = () => {
    const html = snapshotHtml()
    if (html.length <= MAX_SNAPSHOT) report(html)
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(take, SNAPSHOT_DELAY_MS)
  }
  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })
  document.addEventListener('input', schedule, true)
  document.addEventListener('change', schedule, true)
  schedule()
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
