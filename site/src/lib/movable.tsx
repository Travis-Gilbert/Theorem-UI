// SOURCING: hand-rolled. react-reverse-portal 2.3 models this (render once, show it in one place or another), but it takes the node out of the document between places with replaceChild, and an iframe taken out of the document loses its page, so the app would reload on every move. Element.moveBefore (Chrome 133, Firefox 144) moves a node with its state, and nothing upstream moves with it. Where moveBefore is missing (Safari), the node is moved with append: a playing film carries on, and the app frame reloads, which the bridge notices on its own (experience/bridge.ts).
import { useLayoutEffect, useRef, useState } from 'react'

const canMove = typeof Element !== 'undefined' && 'moveBefore' in Element.prototype

/** Where a node waits while no place shows it. It stays in the document, so nothing in it is discarded. */
let parking: HTMLDivElement | null = null
function park(): HTMLDivElement {
  if (!parking?.isConnected) {
    parking = document.createElement('div')
    parking.hidden = true
    document.body.append(parking)
  }
  return parking
}

function move(parent: Element, node: Element) {
  if (node.parentNode === parent) return
  if (canMove && node.isConnected) parent.moveBefore(node, null)
  else parent.append(node)
}

/**
 * A node to render into once, with createPortal, and show with <Place>. What is
 * rendered there is never remounted when the layout around it changes.
 */
export function useMovable(): HTMLElement {
  const [node] = useState(() => {
    const div = document.createElement('div')
    div.style.display = 'contents'
    return div
  })
  useLayoutEffect(() => {
    if (!node.isConnected) park().append(node)
    return () => node.remove()
  }, [node])
  return node
}

/** Shows a movable node here, taking it from wherever it was. */
export function Place({ node }: { node: HTMLElement }) {
  const here = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = here.current
    if (!el) return
    move(el, node)
    // Runs before React takes this place out of the document, so the node is still in it.
    return () => {
      if (node.parentNode === el) move(park(), node)
    }
  }, [node])
  return <div ref={here} style={{ display: 'contents' }} />
}
