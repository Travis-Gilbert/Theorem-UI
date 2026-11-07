// SOURCING: culori (OKLCH, WCAG contrast, gamut clamping, hex output) and @tanstack/highlight's githubDarkTheme for the code colours the terminal draws. No library derives one palette from another by preserved relationships; the rules here are the terminal's own, measured from pi's slate in GitHub Sharp.
//
// The terminal's colours as a function of the workspace around it. pi's slate
// was set in GitHub Sharp; each colour keeps the relationship it has there,
// so a palette, a mode, or a person's own colours move the terminal with them:
// - background: the workspace's tint (the mean of its neutrals in OKLab,
//   since a near-grey hex colour alone carries little reliable hue), in
//   proportion up to the slate's own tint and turned as the slate is turned
//   from GitHub Sharp's; a shade below the darkest large colour around it
//   (the ink in a light workspace, the main screen in a dark one); never
//   lighter than the slate, where the diff rows already use all the lightness
//   their text allows;
// - raised rows, rules and the idle cursor: the slate's steps from its
//   background;
// - text and status colours: their hue and chroma, at the lightness that
//   keeps the contrast each has on the slate, and at least 4.5:1 on every
//   surface they are drawn on;
// - diff tints: GitHub Dark's diff hues, each with at least the chroma it has
//   on the slate and more where it needs it to keep the distance (ΔE00) it has
//   there from what it sits on: a row from the background, changed words from
//   their row. A fixed chroma would lose a red row on a warm background. Each
//   keeps the slate's lightness step from what it sits on, lowered where its
//   text would fall below 4.5:1. Changed words that need more distance take
//   it in lightness first, as far as their text allows, then in chroma, so
//   they stay off the edge of sRGB, where a red reads as an alarm.
import { githubDarkTheme } from '@tanstack/highlight/themes/github-dark'
import {
  clampChroma,
  converter,
  differenceCiede2000,
  formatHex,
  inGamut,
  wcagContrast,
} from 'culori'
import type { Oklch } from 'culori'

const oklch = converter('oklch')
const oklab = converter('oklab')
const deltaE = differenceCiede2000()
const displayable = inGamut('rgb')

/**
 * The workspace colours the terminal relates to: every neutral the palettes
 * place (scripts/palettes.ts), read as CSS colours from the live tokens.
 */
export const WORKSPACE_TOKENS = [
  'surface-neutral',
  'surface-sidebar',
  'surface-frame',
  'surface-raised',
  'surface-hover',
  'surface-composer',
  'surface-artifact',
  'surface-rail',
  'sheet-from',
  'sheet-to',
  'ink',
  'ink-muted',
  'ink-faint',
  'line-control',
  'line-separator',
] as const
type WorkspaceToken = (typeof WORKSPACE_TOKENS)[number]
export type Workspace = Record<WorkspaceToken, string>

/** A workspace from its tokens, looked up by name. */
export const workspaceOf = (token: (name: WorkspaceToken) => string) =>
  Object.fromEntries(
    WORKSPACE_TOKENS.map((name) => [name, token(name)]),
  ) as Workspace

export type TerminalTheme = {
  bg: string
  raised: string
  line: string
  ink: string
  bright: string
  muted: string
  /** The prompt's cursor while the terminal is not focused. */
  idle: string
  sage: string
  gold: string
  error: string
  removedLine: string
  addedLine: string
  removedWords: string
  addedWords: string
  commentOnWords: string
}

/** pi's slate as it is drawn in GitHub Sharp. */
const SLATE: TerminalTheme = {
  bg: '#202733',
  raised: '#273042',
  line: '#3a4458',
  ink: '#c8d0d8',
  bright: '#e4eaee',
  muted: '#8f98a0',
  idle: '#6c747c',
  sage: '#8aa8a0',
  gold: '#d6bc8a',
  error: '#e08a8f',
  removedLine: '#362927',
  addedLine: '#262f26',
  removedWords: '#5e211d',
  addedWords: '#0e4318',
  commentOnWords: '#9aa4ae',
}

/**
 * GitHub Sharp, where the slate was set, measured as `measure` reads a
 * workspace: its tint, and the lightness of the ink (light) and the main
 * screen (dark). terminal-theme.test.ts measures them again from
 * scripts/palettes.ts.
 */
export const GITHUB_SHARP = {
  tint: { c: 0.0058461, h: 250.75 },
  anchor: { light: 0.277623, dark: 0.280696 },
}

/** GitHub Dark's diff red (#da3633) and green (#238636), as OKLCH hues. */
const DIFF_HUE = { removed: 26.8, added: 146.3 }

/** The code colours the crate draws: one per token class, with plain text in the ink. */
const CODE = [...new Set(Object.values(githubDarkTheme.tokens))].filter(
  (colour) => colour !== githubDarkTheme.tokens.token,
)
const COMMENT = githubDarkTheme.tokens.comment
const READABLE = 4.5

function at(colour: string): Oklch {
  const parsed = oklch(colour)
  if (!parsed) throw new Error(`not a colour: ${colour}`)
  return { ...parsed, h: parsed.h ?? 0 }
}
const hex = (colour: Oklch) => formatHex(clampChroma(colour, 'oklch'))
/**
 * What the terminal relates to in a workspace: its tint (the mean of its
 * neutrals in OKLab, since a near-grey hex colour alone carries little
 * reliable hue), whether it is dark, and the lightness of the darkest large
 * colour around the terminal: the main screen when it is dark, the ink
 * otherwise.
 */
export function measure(workspace: Workspace) {
  const colours = WORKSPACE_TOKENS.map((token) => {
    const colour = oklab(workspace[token])
    if (!colour)
      throw new Error(`--${token} is not a colour: ${workspace[token]}`)
    return colour
  })
  const a = colours.reduce((sum, colour) => sum + colour.a, 0) / colours.length
  const b = colours.reduce((sum, colour) => sum + colour.b, 0) / colours.length
  const dark = at(workspace['sheet-from']).l < 0.5
  return {
    tint: {
      c: Math.hypot(a, b),
      h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
    },
    dark,
    anchor: at(dark ? workspace['sheet-from'] : workspace.ink).l,
  }
}

const slate = at(SLATE.bg)
/** How much more tinted the slate is than GitHub Sharp, and how much bluer. */
const TINT = slate.c / GITHUB_SHARP.tint.c
const HUE_STEP = slate.h! - GITHUB_SHARP.tint.h
/** How far below its anchor the slate sits, light and dark. */
const SHADE = {
  light: slate.l - GITHUB_SHARP.anchor.light,
  dark: slate.l - GITHUB_SHARP.anchor.dark,
}

/** `colour` in the background's terms: lightness above it, chroma as a share of it, hue from it. */
function step(name: keyof TerminalTheme, bg: Oklch): Oklch {
  const colour = at(SLATE[name])
  return {
    mode: 'oklch',
    l: bg.l + colour.l - slate.l,
    c: slate.c > 0 ? (bg.c * colour.c) / slate.c : 0,
    h: bg.h! + colour.h! - slate.h!,
  }
}

/** The lightest `colour` can be (lightness only, from its own) while it reads at `ratio` on every surface. */
function lift(colour: Oklch, surfaces: string[], ratio: number): string {
  const reads = (l: number) =>
    surfaces.every(
      (surface) => wcagContrast(hex({ ...colour, l }), surface) >= ratio,
    )
  if (reads(colour.l)) return hex(colour)
  let low = colour.l
  let high = 1
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2
    if (reads(mid)) high = mid
    else low = mid
  }
  return hex({ ...colour, l: high })
}

/** Text that keeps the contrast it has on the slate, lightness only, and reads on every surface. */
function text(
  colour: Oklch,
  name: keyof TerminalTheme,
  bg: string,
  raised: string,
) {
  const ratio = wcagContrast(SLATE[name], SLATE.bg)
  let low = 0
  let high = 1
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2
    if (wcagContrast(hex({ ...colour, l: mid }), bg) >= ratio) high = mid
    else low = mid
  }
  return lift({ ...colour, l: high }, [bg, raised], READABLE)
}

/** The distance (ΔE00) each tint keeps on the slate from what it sits on. */
const DISTANCE = {
  removedLine: deltaE(SLATE.removedLine, SLATE.bg),
  addedLine: deltaE(SLATE.addedLine, SLATE.bg),
  removedWords: deltaE(SLATE.removedWords, SLATE.removedLine),
  addedWords: deltaE(SLATE.addedWords, SLATE.addedLine),
}

/**
 * The least chroma, from `floor`, at which a tint at `l` and `h` stands
 * `distance` from `from`. Past the chroma nearest `from` the distance only
 * grows; where `floor` already stands further, the tint keeps `floor`, and
 * where sRGB runs out first, the most it shows.
 */
function chromaFor(
  l: number,
  h: number,
  from: string,
  distance: number,
  floor: number,
) {
  const away = (c: number) => deltaE(hex({ mode: 'oklch', l, c, h }), from)
  let nearest = floor
  for (let c = floor; c <= 0.2; c += 0.0005)
    if (away(c) < away(nearest)) nearest = c
  for (let c = nearest; c <= 0.2; c += 0.0005) if (away(c) >= distance) return c
  return 0.2
}

const readsOn = (tint: string, texts: string[]) =>
  texts.every((colour) => wcagContrast(colour, tint) >= READABLE)

/**
 * A row at hue `h`, `distance` from the background `from`, at lightness `l`
 * where it can: lowered until every colour in `texts` reads on it, or raised
 * (while they still read) when sRGB cannot reach the distance at `l`.
 */
function placeRow(
  h: number,
  l: number,
  from: string,
  distance: number,
  floor: number,
  texts: string[],
) {
  const tint = (lightness: number) =>
    hex({
      mode: 'oklch',
      l: lightness,
      h,
      c: chromaFor(lightness, h, from, distance, floor),
    })
  let lightness = l
  while (!readsOn(tint(lightness), texts)) {
    lightness -= 0.0005
    if (lightness <= 0) throw new Error(`no readable diff row for ${from}`)
  }
  while (
    deltaE(tint(lightness), from) < distance - 0.05 &&
    readsOn(tint(lightness + 0.0005), texts)
  )
    lightness += 0.0005
  return tint(lightness)
}

/** The lightest a tint at chroma `c` and hue `h` can be while every colour in `texts` reads on it. */
function lightest(c: number, h: number, texts: string[]) {
  let low = 0
  let high = 1
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2
    if (readsOn(hex({ mode: 'oklch', l: mid, c, h }), texts)) low = mid
    else high = mid
  }
  return low
}

/**
 * Changed words at hue `h`, `distance` from their `row`: at lightness `l` and
 * chroma `floor` where that stands far enough; otherwise lighter, as far as
 * `texts` allow, and then more chromatic, up to the most sRGB shows there.
 */
function placeWords(
  h: number,
  l: number,
  row: string,
  distance: number,
  floor: number,
  texts: string[],
) {
  const far = (colour: string) => deltaE(colour, row) >= distance - 0.05
  const top = lightest(floor, h, texts)
  for (let lightness = Math.min(l, top); lightness < top; lightness += 0.0005) {
    const colour = hex({ mode: 'oklch', l: lightness, c: floor, h })
    if (far(colour)) return colour
  }
  let shown = hex({ mode: 'oklch', l: top, c: floor, h })
  for (let c = floor; c <= 0.2; c += 0.001) {
    const colour: Oklch = { mode: 'oklch', l: lightest(c, h, texts), c, h }
    if (!displayable(colour)) return shown
    shown = hex(colour)
    if (far(shown)) return shown
  }
  return shown
}

export function terminalTheme(workspace: Workspace): TerminalTheme {
  const around = measure(workspace)
  const bgColour: Oklch = {
    mode: 'oklch',
    l: Math.min(slate.l, around.anchor + SHADE[around.dark ? 'dark' : 'light']),
    c: Math.min(slate.c, TINT * around.tint.c),
    h: around.tint.h + HUE_STEP,
  }
  const bg = hex(bgColour)
  const surface = at(bg)
  const raised = hex(step('raised', surface))
  const line = hex(step('line', surface))
  const grey = (name: 'ink' | 'bright' | 'muted') =>
    text(step(name, surface), name, bg, raised)
  const status = (name: 'sage' | 'gold' | 'error') =>
    text(at(SLATE[name]), name, bg, raised)
  const ink = grey('ink')
  const lightStep = (name: keyof TerminalTheme) => at(SLATE[name]).l - slate.l

  const rowTexts = [...CODE, ink]
  const wordTexts = [...CODE.filter((colour) => colour !== COMMENT), ink]
  const row = (which: 'removed' | 'added') =>
    placeRow(
      DIFF_HUE[which],
      surface.l + lightStep(`${which}Line`),
      bg,
      DISTANCE[`${which}Line`],
      at(SLATE[`${which}Line`]).c,
      rowTexts,
    )
  const rows = { removed: row('removed'), added: row('added') }
  const word = (which: 'removed' | 'added') =>
    placeWords(
      DIFF_HUE[which],
      at(rows[which]).l +
        lightStep(`${which}Words`) -
        lightStep(`${which}Line`),
      rows[which],
      DISTANCE[`${which}Words`],
      Math.max(at(rows[which]).c, at(SLATE[`${which}Words`]).c),
      wordTexts,
    )
  const words = { removed: word('removed'), added: word('added') }
  return {
    bg,
    raised,
    line,
    ink,
    bright: grey('bright'),
    muted: grey('muted'),
    idle: hex(step('idle', surface)),
    sage: status('sage'),
    gold: status('gold'),
    error: status('error'),
    removedLine: rows.removed,
    addedLine: rows.added,
    removedWords: words.removed,
    addedWords: words.added,
    commentOnWords: lift(at(COMMENT), [words.removed, words.added], READABLE),
  }
}

/** The colours the page's own terminal surfaces use, as CSS custom properties (styles.css maps them to Tailwind's `term` colours). */
const CSS_COLOURS = [
  'bg',
  'raised',
  'line',
  'ink',
  'bright',
  'muted',
  'sage',
  'gold',
  'error',
] as const

export function terminalCss(theme: TerminalTheme): Record<string, string> {
  return Object.fromEntries(
    CSS_COLOURS.map((name) => [`--term-${name}`, theme[name]]),
  )
}

export { SLATE }
