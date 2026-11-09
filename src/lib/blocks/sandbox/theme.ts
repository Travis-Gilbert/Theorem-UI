// SOURCING: none — Theorem's theme tokens as CSS custom properties, read in
// the page and written in a frame. The platform's getComputedStyle resolves
// each token (palettes.css, any palette or mode) to the colour it is now.
//
// The page reads its tokens and hands them to a frame; the frame sets them on
// its root, so its CSS and its cells draw with the page's colours, and
// follows when the person changes theme. Nothing here names a colour.

/** The tokens a frame is handed. Every palette defines each of them. */
export const THEME_TOKENS = [
  '--surface-artifact',
  '--surface-raised',
  '--surface-hover',
  '--surface-selected',
  '--ink',
  '--ink-muted',
  '--ink-faint',
  '--line-control',
  '--line-separator',
  '--redwood',
  '--redwood-ink',
  '--redwood-container',
  '--teal',
  '--teal-ink',
  '--teal-container',
  '--ochre',
  '--ochre-ink',
  '--ochre-container',
  '--graph-agent',
  '--graph-plan',
  '--graph-tag',
  '--graph-attachment',
  '--error-ink',
  '--error-container',
  '--attention',
  '--attention-ink',
  '--focus',
  '--link',
  '--font-sans',
  '--font-mono',
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]

export interface ThemeState {
  mode: 'light' | 'dark'
  tokens: Partial<Record<ThemeToken, string>>
}

/** The theme a document's root holds now, each token as it was set. */
export function readTheme(root: Element = document.documentElement): ThemeState {
  const style = getComputedStyle(root)
  const tokens: ThemeState['tokens'] = {}
  for (const token of THEME_TOKENS) {
    const value = style.getPropertyValue(token).trim()
    if (value) tokens[token] = value
  }
  return { mode: root.classList.contains('dark') ? 'dark' : 'light', tokens }
}

/**
 * The page's theme with every token resolved to a value that stands alone. A
 * token the page defines through another (`var()`, `color-mix()`) means
 * nothing in a frame that lacks the rest, so each is read back through a
 * probe as the colour or font family the browser computed.
 */
export function resolvedTheme(root: HTMLElement = document.documentElement): ThemeState {
  const theme = readTheme(root)
  const probe = root.ownerDocument.createElement('span')
  probe.hidden = true
  root.append(probe)
  try {
    for (const token of Object.keys(theme.tokens) as Array<ThemeToken>) {
      const font = token.startsWith('--font-')
      probe.style.setProperty(font ? 'font-family' : 'color', `var(${token})`)
      const style = getComputedStyle(probe)
      const value = (font ? style.fontFamily : style.color).trim()
      if (value) theme.tokens[token] = value
    }
  } finally {
    probe.remove()
  }
  return theme
}

/** The `:root` rule a document starts with, so its first paint is already in theme. */
export function themeRule(theme: ThemeState): string {
  const declarations = Object.entries(theme.tokens)
    .map(([token, value]) => `${token}:${value.replace(/[;{}<]/g, '')};`)
    .join('')
  return `:root{color-scheme:${theme.mode};${declarations}}`
}

/** Sets a theme on a document's root: its tokens, its mode class and its colour scheme. */
export function applyTheme(
  theme: ThemeState,
  root: HTMLElement = document.documentElement,
) {
  for (const [token, value] of Object.entries(theme.tokens))
    root.style.setProperty(token, value)
  root.style.setProperty('color-scheme', theme.mode)
  root.classList.toggle('dark', theme.mode === 'dark')
}

/** The event a frame fires on `window` after a new theme is applied. */
export const THEME_EVENT = 'theorem:theme'

/**
 * The colours a chart in the frame draws with, named for what they mean.
 * `series` separates subjects; `states` marks meaningful states. Values are
 * the resolved tokens, so they work as SVG attributes as well as in CSS.
 */
export function chartTheme(theme: ThemeState) {
  const t = (token: ThemeToken) => theme.tokens[token] ?? `var(${token})`
  return {
    mode: theme.mode,
    surface: t('--surface-artifact'),
    raised: t('--surface-raised'),
    ink: t('--ink'),
    inkMuted: t('--ink-muted'),
    inkFaint: t('--ink-faint'),
    line: t('--line-separator'),
    lineStrong: t('--line-control'),
    series: [
      t('--redwood'),
      t('--teal'),
      t('--ochre'),
      t('--graph-agent'),
      t('--graph-plan'),
      t('--graph-tag'),
    ],
    states: {
      positive: t('--teal'),
      warning: t('--attention'),
      negative: t('--error-ink'),
      focus: t('--focus'),
      selected: t('--surface-selected'),
    },
    font: { sans: t('--font-sans'), mono: t('--font-mono') },
  }
}

export type ChartTheme = ReturnType<typeof chartTheme>
