// SOURCING: zustand (the store the WASM terminal reads, as lib/palette keeps the palette); the platform's MutationObserver and getComputedStyle read the workspace's live tokens, through a probe element so any CSS colour (a var(), oklch(), color-mix()) arrives as one the browser has resolved. The colours themselves come from terminal-theme.ts.
//
// The page's terminal colours, worked out again from the workspace's live
// tokens whenever the root element's palette, mode or style changes: a
// palette or mode switch, or a person's own colours set on the root.
// palettes.css already carries each built-in mode's terminal for the first
// paint, so this module loads after it, with the terminal or from the root
// route, and only takes over from there.
import { create } from 'zustand'
import {
  SLATE,
  terminalCss,
  terminalTheme,
  workspaceOf,
} from './terminal-theme'
import type { TerminalTheme, Workspace } from './terminal-theme'

export const useTerminalTheme = create<{ theme: TerminalTheme }>(() => ({
  theme: SLATE,
}))

/** The workspace's tokens as the browser resolves them on the root. */
function readWorkspace(): Workspace {
  const probe = document.createElement('span')
  probe.hidden = true
  document.documentElement.append(probe)
  try {
    return workspaceOf((name) => {
      probe.style.color = `var(--${name})`
      return getComputedStyle(probe).color
    })
  } finally {
    probe.remove()
  }
}

/** The workspace the current colours were worked out from. */
let followed = ''

function follow() {
  const workspace = readWorkspace()
  const key = JSON.stringify(workspace)
  // Setting the colours below changes the root's style, which calls this again.
  if (key === followed) return
  followed = key
  let theme: TerminalTheme
  try {
    theme = terminalTheme(workspace)
  } catch (error) {
    // A token that is not a colour keeps the terminal as it was.
    console.error('terminal colours:', error)
    return
  }
  const root = document.documentElement
  for (const [name, value] of Object.entries(terminalCss(theme)))
    root.style.setProperty(name, value)
  useTerminalTheme.setState({ theme })
}

follow()
new MutationObserver(follow).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class', 'data-palette', 'style'],
})
