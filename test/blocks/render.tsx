// React into happy-dom for the block components' tests: react-dom/client's
// root under React's act(), as React's own testing docs set it up.
import { act } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<{ root: Root; container: HTMLElement }> = []

export async function render(node: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(node))
  mounted.push({ root, container })
  return {
    container,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    unmount: () => act(async () => root.unmount()),
  }
}

/** Unmounts everything render() mounted. */
export async function cleanup() {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount())
    container.remove()
  }
}

/** Waits, letting React work, until `find` returns something. */
export async function waitFor<T>(
  find: () => T | null | undefined | false,
  timeout = 3000,
): Promise<T> {
  const start = Date.now()
  for (;;) {
    const found = find()
    if (found) return found
    if (Date.now() - start > timeout)
      throw new Error('waitFor: nothing found in time')
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)))
  }
}

export const click = (element: Element) =>
  act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

export const buttonNamed = (root: ParentNode, name: string | RegExp) =>
  [...root.querySelectorAll('button')].find((button) =>
    typeof name === 'string'
      ? button.textContent.trim() === name
      : name.test(button.textContent),
  )
