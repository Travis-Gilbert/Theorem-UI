// SOURCING: culori (parses any colour the browser resolves, clamps it into sRGB, formats rgb(), WCAG luminance); the platform's getComputedStyle through a probe element and a MutationObserver on the root, as live-terminal-theme.ts does; React's useSyncExternalStore to share one reading between cards
//
// The conversation's colours and type, sent to an immersive artifact with its
// mount so the agent's code draws in the reply's own palette. The tokens are
// read as the browser resolves them, then written as rgb(): the workspace's
// oklch() and color-mix() values are not ones d3-color or a canvas can parse.
// A palette or mode switch changes the root, and every card is told again.
import { useSyncExternalStore } from 'react'
import { clampChroma, formatRgb, parse, wcagLuminance } from 'culori'
import type { SceneTheme } from './scene-model'

type Colour = Exclude<keyof SceneTheme, 'colorScheme' | 'fontFamily' | 'monoFamily'>

/** Which workspace token each theme colour is read from (palettes.css, styles.css). */
const COLOURS: Record<Colour, string> = {
  background: 'surface-artifact',
  surface: 'surface-raised',
  foreground: 'ink',
  muted: 'ink-muted',
  border: 'line-separator',
  accent: 'primary',
  accentForeground: 'primary-foreground',
  success: 'success',
  warning: 'warning',
  danger: 'destructive',
}

const FONTS = { fontFamily: 'font-sans', monoFamily: 'font-mono' } as const

/** Above this luminance black text outcontrasts white: a light surface. */
const LIGHT_LUMINANCE = 0.179

export type TokenReader = {
  colour: (name: string) => string
  font: (name: string) => string
}

export function sceneThemeOf(read: TokenReader): SceneTheme {
  const theme: SceneTheme = {}
  for (const [key, name] of Object.entries(COLOURS) as [Colour, string][]) {
    const colour = parse(read.colour(name))
    if (colour) theme[key] = formatRgb(clampChroma(colour, 'oklch'))
  }
  for (const [key, name] of Object.entries(FONTS) as [keyof typeof FONTS, string][]) {
    const family = read.font(name).trim()
    if (family) theme[key] = family
  }
  if (theme.background)
    theme.colorScheme =
      wcagLuminance(theme.background) > LIGHT_LUMINANCE ? 'light' : 'dark'
  return theme
}

/** The tokens as the browser resolves them on the root, through a probe. */
function readTheme(): SceneTheme {
  const probe = document.createElement('span')
  probe.hidden = true
  document.documentElement.append(probe)
  try {
    return sceneThemeOf({
      colour: (name) => {
        probe.style.color = `var(--${name})`
        return getComputedStyle(probe).color
      },
      font: (name) => {
        probe.style.fontFamily = `var(--${name})`
        return getComputedStyle(probe).fontFamily
      },
    })
  } finally {
    probe.remove()
  }
}

const EMPTY: SceneTheme = {}
let current: SceneTheme = EMPTY
let currentKey = ''

/** Reads the tokens again; whether they changed. */
function refresh(): boolean {
  const next = readTheme()
  const key = JSON.stringify(next)
  if (key === currentKey) return false
  current = next
  currentKey = key
  return true
}

const listeners = new Set<() => void>()
let observer: MutationObserver | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!observer) {
    refresh()
    observer = new MutationObserver(() => {
      if (refresh()) for (const notify of listeners) notify()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-palette', 'style'],
    })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    observer?.disconnect()
    observer = undefined
  }
}

function snapshot(): SceneTheme {
  if (!currentKey) refresh()
  return current
}

/** The conversation's theme, the same object until a token changes. */
export function useSceneTheme(): SceneTheme {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}
