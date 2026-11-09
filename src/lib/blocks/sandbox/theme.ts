// SOURCING: the platform's getComputedStyle (a custom property's computed
// value already has its var()s substituted, so each token arrives as a value
// the frame can use as it is) and plain CSS: :where() gives every default
// zero specificity, so any rule an App writes wins over it. No library maps
// one design system's tokens onto another document's stylesheet.
//
// The UI's look as a hosted App's frame takes it: the page reads its tokens,
// and the frame keeps them in one host stylesheet ahead of the App's own
// content, as `--theorem-*` variables and themed defaults for plain elements.
// The App's own styles are never read or changed.

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
export function applyTheme(theme: AppTheme, page: Document = document): void {
  let style = page.querySelector<HTMLStyleElement>(`style[${THEME_STYLE}]`)
  if (!style) {
    style = page.createElement('style')
    style.setAttribute(THEME_STYLE, '')
    page.head.prepend(style)
  }
  const css = themeCss(theme)
  if (style.textContent !== css) style.textContent = css
}
