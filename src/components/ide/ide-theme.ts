// SOURCING: the platform's MutationObserver and getComputedStyle (through a probe element, as live-terminal-theme.ts reads the terminal's workspace) read the UI's live tokens; culori turns each resolved colour into the #rrggbb a colour theme takes; React's useSyncExternalStore holds the result. The token list and the theme made of it are the frame's, ide/theia-extensions/theorem-workspace/src/common/ide-theme.ts.
//
// The look the IDE frame takes from the UI: its mode and the tokens of its
// palette as the browser resolves them, read again whenever the root
// element's palette, mode or style changes, so a palette switch, a mode
// switch or a person's own colours reach Theia as they reach the page.
import { formatHex } from 'culori'
import { useSyncExternalStore } from 'react'
import { IDE_TOKENS } from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-theme'
import type { IdeTheme } from '../../../ide/theia-extensions/theorem-workspace/src/common/ide-theme'

let look: IdeTheme | undefined
let lookKey = ''

function read(): IdeTheme {
  const root = document.documentElement
  const probe = document.createElement('span')
  probe.hidden = true
  root.append(probe)
  try {
    const tokens = Object.fromEntries(
      IDE_TOKENS.flatMap((name) => {
        probe.style.color = `var(--${name})`
        const hex = formatHex(getComputedStyle(probe).color)
        return hex ? [[name, hex] as const] : []
      }),
    )
    return {
      dark: root.classList.contains('dark'),
      palette: root.dataset.palette,
      tokens,
    }
  } finally {
    probe.remove()
  }
}

/** Reads the look again; true when it changed. */
function refresh(): boolean {
  const next = read()
  const key = JSON.stringify(next)
  if (key === lookKey) return false
  lookKey = key
  look = next
  return true
}

function subscribe(changed: () => void) {
  const observer = new MutationObserver(() => {
    if (refresh()) changed()
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-palette', 'style'],
  })
  return () => observer.disconnect()
}

function snapshot() {
  if (!look) refresh()
  return look
}

/** The UI's look for the IDE frame; undefined while rendering on the server. */
export function useIdeTheme(): IdeTheme | undefined {
  return useSyncExternalStore(subscribe, snapshot, () => undefined)
}
