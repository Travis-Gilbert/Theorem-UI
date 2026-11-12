// SOURCING: none — Theorem's theme tokens as CSS custom properties, read in
// the page and written in a frame. The platform's getComputedStyle resolves
// each token (palettes.css, any palette or mode) to the colour it is now; a
// custom property's computed value already has its var()s substituted. For a
// hosted App, plain CSS: :where() gives every default zero specificity, so any
// rule an App writes wins over it. No library maps one design system's tokens
// onto another document's stylesheet.
//
// The page reads its tokens and hands them to a frame. A notebook's frame sets
// them on its root, so its CSS and its cells draw with the page's colours, and
// follows when the person changes theme. A hosted App's frame keeps them in one
// host stylesheet ahead of the App's own content, as `--theorem-*` variables
// and themed defaults for plain elements; the App's own styles are never read
// or changed. Nothing here names a colour.

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
export function readTheme(
  root: Element = document.documentElement,
): ThemeState {
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
export function resolvedTheme(
  root: HTMLElement = document.documentElement,
): ThemeState {
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

// A hosted App's look.

/** What the page hands a frame: its colour scheme and its tokens. */
export interface AppTheme {
  /** The page's own `color-scheme`, so a transparent frame stays see-through. */
  scheme: string
  /** Each value by its App name: `ink` is `--theorem-ink`. */
  tokens: Record<string, string>
}

/**
 * Each variable an App can use, `--theorem-<name>`, and the UI token it is
 * (src/styles.css, src/palettes.css).
 */
export const APP_TOKENS = {
  background: 'background',
  surface: 'surface-raised',
  hover: 'surface-hover',
  selected: 'surface-selected',
  ink: 'ink',
  'ink-muted': 'ink-muted',
  'ink-faint': 'ink-faint',
  border: 'line-separator',
  'border-control': 'line-control',
  accent: 'redwood',
  'accent-hover': 'redwood-hover',
  'on-accent': 'on-redwood',
  'accent-container': 'redwood-container',
  focus: 'focus',
  link: 'link',
  success: 'teal-ink',
  'success-container': 'teal-container',
  warning: 'ochre-ink',
  'warning-container': 'ochre-container',
  error: 'error-ink',
  'error-container': 'error-container',
  font: 'font-sans',
  'font-mono': 'font-mono',
  radius: 'radius-md',
} as const

/** The page's look as its root element resolves it now. */
export function readAppTheme(
  root: HTMLElement = document.documentElement,
): AppTheme {
  const style = getComputedStyle(root)
  const tokens: Record<string, string> = {}
  for (const [name, token] of Object.entries(APP_TOKENS)) {
    const value = style.getPropertyValue(`--${token}`).trim()
    if (value) tokens[name] = value
  }
  const scheme =
    style.getPropertyValue('color-scheme').trim() ||
    (root.classList.contains('dark') ? 'dark' : 'light')
  return { scheme, tokens }
}

const BUTTONS = [
  'button',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
]
const FIELDS = [
  'select',
  'textarea',
  'input:not([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="image"], [type="hidden"])',
]
const CONTROLS = [...BUTTONS, ...FIELDS]
/** Zero-specificity selectors for these elements in this state. */
const where = (selectors: Array<string>, state = '') =>
  `:where(${selectors.map((selector) => selector + state).join(', ')})`

// The look of the UI's own quiet controls: ink on a clear ground, a hairline
// at the radius of a control, the hover and pressed surfaces of a row.
const DEFAULTS = `
:where(body) {
  background-color: transparent;
  color: var(--theorem-ink);
  font-family: var(--theorem-font);
}
:where(a) { color: var(--theorem-link); }
${where(CONTROLS)} {
  font: inherit;
  color: inherit;
  background-color: transparent;
  border: 1px solid var(--theorem-border-control);
  border-radius: var(--theorem-radius);
  padding: 4px 8px;
}
${where(BUTTONS)} {
  border-color: var(--theorem-border);
  padding: 4px 10px;
  cursor: pointer;
}
${where(BUTTONS, ':hover:not(:disabled)')} {
  background-color: var(--theorem-hover);
}
${where(BUTTONS, ':active:not(:disabled)')} {
  background-color: var(--theorem-selected);
}
${where(CONTROLS, ':focus-visible')} {
  outline: 2px solid var(--theorem-focus);
  outline-offset: 1px;
}
${where(CONTROLS, ':disabled')} {
  opacity: 0.5;
  cursor: not-allowed;
}
:where(input, textarea)::placeholder { color: var(--theorem-ink-faint); }
`

/** The host stylesheet for a look: its variables, then the defaults. */
export function themeCss({ scheme, tokens }: AppTheme): string {
  const variables = Object.entries(tokens)
    .map(([name, value]) => `  --theorem-${name}: ${value};\n`)
    .join('')
  return `:where(:root) {\n${variables}  color-scheme: ${scheme};\n  accent-color: var(--theorem-accent);\n}${DEFAULTS}`
}

/** Marks the host stylesheet, so the frame finds it again. */
export const THEME_STYLE = 'data-theorem-theme'

/**
 * Puts a look in the document's host stylesheet, which it adds ahead of
 * everything in the head when there is none yet.
 */
export function applyAppTheme(
  theme: AppTheme,
  page: Document = document,
): void {
  let style = page.querySelector<HTMLStyleElement>(`style[${THEME_STYLE}]`)
  if (!style) {
    style = page.createElement('style')
    style.setAttribute(THEME_STYLE, '')
    page.head.prepend(style)
  }
  const css = themeCss(theme)
  if (style.textContent !== css) style.textContent = css
}
