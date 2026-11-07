// SOURCING: culori (Okhsl, OKLCH, sRGB gamut tests and hex output). The rules
// that place each colour are the palettes' own; each mode's terminal colours
// come from src/components/terminal/terminal-theme.ts.
//
// Writes src/palettes.css: the colours of every palette, placed by a few rules
// so that their tints and chromas agree. Edit the spec below, then run
// `bun scripts/palettes.ts`; palettes.test.ts fails while the two disagree.
//
// Neutrals (surfaces, inks, lines): one hue per palette and one Okhsl
// saturation per mode. Okhsl's saturation is relative to what sRGB can show at
// that hue and lightness, so every grey carries the same tint, fading toward
// white and black as the gamut narrows. Each keeps the lightness it was drawn
// at, which keeps the hierarchy and the contrast.
//
// Accents: each family keeps its hue, and each tier (strong, ink, container,
// the graph's kinds) has one OKLCH lightness and one chroma per mode, shared by
// every family in it. The chroma is the most all of the tier's hues reach in
// sRGB, up to the tier's ceiling, so no family is brighter or louder than
// another in the same role.
import { displayable, formatHex } from 'culori'
import type { Okhsl, Oklch } from 'culori'
import {
  terminalCss,
  terminalTheme,
  workspaceOf,
} from '../src/components/terminal/terminal-theme'

type Family = 'redwood' | 'teal' | 'ochre' | 'error' | 'focus'
type Tier = 'strong' | 'ink' | 'container' | 'graph' | 'focus'
type Role = 'strong' | 'hover' | 'pressed' | 'ink' | 'container'

/**
 * The tokens each family has; `strong` is the family's own name. "redwood" is
 * the accent's role name, and each palette gives it its own hue: GitHub's is
 * blue.
 */
const roles: Record<Family, Array<Role>> = {
  redwood: ['strong', 'hover', 'pressed', 'ink', 'container'],
  teal: ['strong', 'ink', 'container'],
  ochre: ['strong', 'ink', 'container'],
  error: ['ink', 'container'],
  focus: [],
}

/**
 * The Vault graph's kinds of node, after Obsidian's: green tags, yellow
 * attachments; from Theorem, teal plans and violet agents' documents. Written
 * as plain hex like every token here, since WebGL reads them.
 */
const graphHues = {
  'graph-plan': 185,
  'graph-agent': 292,
  'graph-tag': 135,
  'graph-attachment': 90,
}

interface Mode {
  selector: string
  dark: boolean
  /** Okhsl saturation of every neutral. */
  saturation: number
  /** Okhsl lightness of each neutral token. */
  neutrals: Record<string, number>
  /** A selected row is tinted with redwood's hue at this saturation, where the palette says so. */
  selected?: number
  hues: Record<Family, number>
  /**
   * OKLCH lightness and chroma ceiling of each tier. The focus ring is a tier
   * of its own, drawn where it keeps 3:1 against the surfaces it rings.
   */
  tiers: Record<Tier, { l: number; c: number }>
  /** The family whose ink links are drawn in. */
  link: Family
  /** What wants a person: warmer than ochre, which is the warning family. */
  attention: { strong: { l: number; c: number }; ink: { l: number; c: number } }
}

/** Hover and pressed sit one or two of these from their strong colour. */
const STEP = 0.045

const githubNeutrals = {
  light: {
    'surface-neutral': 0.958,
    'surface-sidebar': 0.958,
    'surface-frame': 0.913,
    'surface-raised': 1,
    'surface-hover': 0.942,
    'surface-selected': 0.888,
    'surface-composer': 1,
    'surface-artifact': 0.979,
    'surface-rail': 0.929,
    'sheet-from': 1,
    'sheet-to': 0.947,
    'ink-faint-top': 0.48,
    'ink-faint-bottom': 0.433,
    ink: 0.175,
    'ink-muted': 0.404,
    'ink-faint': 0.433,
    'line-control': 0.818,
    'line-separator': 0.904,
    'on-redwood': 1,
    'graph-note': 0.319,
    'graph-unresolved': 0.545,
    'graph-link': 0.62,
  },
  dark: {
    'surface-neutral': 0.127,
    'surface-sidebar': 0.127,
    'surface-frame': 0.084,
    'surface-raised': 0.171,
    'surface-hover': 0.163,
    'surface-selected': 0.22,
    'surface-composer': 0.163,
    'surface-artifact': 0.142,
    'surface-rail': 0.084,
    'sheet-from': 0.178,
    'sheet-to': 0.119,
    'ink-faint-top': 0.64,
    'ink-faint-bottom': 0.6,
    ink: 0.94,
    'ink-muted': 0.8,
    'ink-faint': 0.62,
    'line-control': 0.33,
    'line-separator': 0.235,
    'on-redwood': 0.078,
    'graph-note': 0.809,
    'graph-unresolved': 0.401,
    'graph-link': 0.318,
    'graph-label': 0.856,
  },
}

/** GitHub Sharp's cool grey and Stone's warm one. */
const GITHUB_HUE = 250
const STONE_HUE = 70
const ATTENTION_HUE = 75

const modes: Array<Mode & { hue: number }> = [
  {
    selector: ':root',
    dark: false,
    hue: GITHUB_HUE,
    saturation: 0.1,
    neutrals: githubNeutrals.light,
    selected: 0.4,
    hues: { redwood: 247, teal: 150, ochre: 95, error: 18, focus: 247 },
    tiers: {
      strong: { l: 0.558, c: 0.132 },
      ink: { l: 0.485, c: 0.108 },
      container: { l: 0.936, c: 0.03 },
      graph: { l: 0.534, c: 0.12 },
      focus: { l: 0.558, c: 0.123 },
    },
    link: 'redwood',
    attention: { strong: { l: 0.62, c: 0.145 }, ink: { l: 0.47, c: 0.105 } },
  },
  {
    selector: '.dark',
    dark: true,
    hue: GITHUB_HUE,
    saturation: 0.034,
    neutrals: githubNeutrals.dark,
    selected: 0.12,
    hues: { redwood: 247, teal: 150, ochre: 95, error: 18, focus: 247 },
    tiers: {
      strong: { l: 0.633, c: 0.123 },
      ink: { l: 0.779, c: 0.105 },
      container: { l: 0.324, c: 0.048 },
      graph: { l: 0.745, c: 0.125 },
      focus: { l: 0.558, c: 0.123 },
    },
    link: 'redwood',
    attention: { strong: { l: 0.8, c: 0.14 }, ink: { l: 0.86, c: 0.105 } },
  },
  {
    selector: "[data-palette='stone']",
    dark: false,
    hue: STONE_HUE,
    saturation: 0.045,
    neutrals: {
      'surface-neutral': 0.72,
      'surface-sidebar': 0.705,
      'surface-frame': 0.677,
      'surface-raised': 0.772,
      'surface-hover': 0.747,
      'surface-selected': 0.655,
      'surface-composer': 0.772,
      'surface-artifact': 0.742,
      'surface-rail': 0.862,
      'sheet-from': 0.823,
      'sheet-to': 0.698,
      'ink-faint-top': 0.367,
      'ink-faint-bottom': 0.246,
      ink: 0.21,
      'ink-muted': 0.274,
      'ink-faint': 0.384,
      'line-control': 0.338,
      'line-separator': 0.635,
      'on-redwood': 0.951,
      'graph-note': githubNeutrals.light['graph-note'],
      'graph-unresolved': githubNeutrals.light['graph-unresolved'],
      'graph-link': githubNeutrals.light['graph-link'],
    },
    hues: { redwood: 13, teal: 182, ochre: 85, error: 12, focus: 226 },
    tiers: {
      strong: { l: 0.476, c: 0.108 },
      ink: { l: 0.394, c: 0.087 },
      container: { l: 0.809, c: 0.032 },
      graph: { l: 0.534, c: 0.12 },
      focus: { l: 0.395, c: 0.063 },
    },
    link: 'teal',
    attention: { strong: { l: 0.56, c: 0.125 }, ink: { l: 0.4, c: 0.09 } },
  },
  {
    selector: ".dark[data-palette='stone']",
    dark: true,
    hue: STONE_HUE,
    saturation: 0.03,
    neutrals: {
      'surface-neutral': 0.087,
      'surface-sidebar': 0.11,
      'surface-frame': 0.062,
      'surface-raised': 0.139,
      'surface-hover': 0.123,
      'surface-selected': 0.173,
      'surface-composer': 0.135,
      'surface-artifact': 0.111,
      'surface-rail': 0.062,
      'sheet-from': 0.156,
      'sheet-to': 0.099,
      'ink-faint-top': 0.582,
      'ink-faint-bottom': 0.536,
      ink: 0.9,
      'ink-muted': 0.72,
      'ink-faint': 0.512,
      'line-control': 0.251,
      'line-separator': 0.208,
      'on-redwood': 0.062,
      popover: 0.144,
      'graph-note': githubNeutrals.dark['graph-note'],
      'graph-unresolved': githubNeutrals.dark['graph-unresolved'],
      'graph-link': githubNeutrals.dark['graph-link'],
      'graph-label': githubNeutrals.dark['graph-label'],
    },
    hues: { redwood: 222, teal: 182, ochre: 85, error: 12, focus: 197 },
    tiers: {
      strong: { l: 0.666, c: 0.108 },
      ink: { l: 0.822, c: 0.092 },
      container: { l: 0.311, c: 0.041 },
      graph: { l: 0.745, c: 0.125 },
      focus: { l: 0.666, c: 0.095 },
    },
    link: 'teal',
    attention: { strong: { l: 0.8, c: 0.13 }, ink: { l: 0.86, c: 0.1 } },
  },
]

/** The most chroma sRGB shows at this OKLCH lightness and hue. */
export function maxChroma(l: number, h: number) {
  let low = 0
  let high = 0.4
  for (let i = 0; i < 24; i++) {
    const c = (low + high) / 2
    if (displayable({ mode: 'oklch', l, c, h })) low = c
    else high = c
  }
  return low
}

/** One chroma for a tier: the ceiling, or less where one of its hues cannot reach it. */
function tierChroma(l: number, ceiling: number, hues: Array<number>) {
  return Math.min(ceiling, ...hues.map((h) => maxChroma(l, h)))
}

const hex = (color: Okhsl | Oklch) => formatHex(color)

/** Every colour token of one mode, by name. */
export function modeTokens(mode: Mode & { hue: number }) {
  const tokens: Record<string, string> = {}
  for (const [name, l] of Object.entries(mode.neutrals))
    tokens[name] = hex({ mode: 'okhsl', h: mode.hue, s: mode.saturation, l })
  const selected = mode.neutrals['surface-selected']
  if (mode.selected !== undefined && selected !== undefined)
    tokens['surface-selected'] = hex({
      mode: 'okhsl',
      h: mode.hues.redwood,
      s: mode.selected,
      l: selected,
    })

  const tierHues = (tier: 'strong' | 'ink' | 'container') =>
    (Object.keys(roles) as Array<Family>)
      .filter((family) => roles[family].includes(tier))
      .map((family) => mode.hues[family])
  const chroma = {
    strong: tierChroma(
      mode.tiers.strong.l,
      mode.tiers.strong.c,
      tierHues('strong'),
    ),
    ink: tierChroma(mode.tiers.ink.l, mode.tiers.ink.c, tierHues('ink')),
    container: tierChroma(
      mode.tiers.container.l,
      mode.tiers.container.c,
      tierHues('container'),
    ),
  }
  const lightness: Record<Role, number> = {
    strong: mode.tiers.strong.l,
    hover: mode.tiers.strong.l + (mode.dark ? STEP : -STEP),
    pressed: mode.tiers.strong.l - (mode.dark ? STEP : 2 * STEP),
    ink: mode.tiers.ink.l,
    container: mode.tiers.container.l,
  }
  for (const family of Object.keys(roles) as Array<Family>)
    for (const role of roles[family]) {
      const tier = role === 'hover' || role === 'pressed' ? 'strong' : role
      const name = role === 'strong' ? family : `${family}-${role}`
      tokens[name] = hex({
        mode: 'oklch',
        l: lightness[role],
        c: Math.min(
          chroma[tier],
          maxChroma(lightness[role], mode.hues[family]),
        ),
        h: mode.hues[family],
      })
    }

  const focus = mode.tiers.focus
  tokens.focus = hex({
    mode: 'oklch',
    l: focus.l,
    c: Math.min(focus.c, maxChroma(focus.l, mode.hues.focus)),
    h: mode.hues.focus,
  })

  for (const [name, { l, c }] of [
    ['attention', mode.attention.strong],
    ['attention-ink', mode.attention.ink],
  ] as const)
    tokens[name] = hex({
      mode: 'oklch',
      l,
      c: Math.min(c, maxChroma(l, ATTENTION_HUE)),
      h: ATTENTION_HUE,
    })

  const graph = mode.tiers.graph
  const graphChroma = tierChroma(graph.l, graph.c, Object.values(graphHues))
  for (const [name, h] of Object.entries(graphHues))
    tokens[name] = hex({ mode: 'oklch', l: graph.l, c: graphChroma, h })
  return tokens
}

export function palettesCss() {
  const blocks = modes.map((mode) => {
    const tokens = modeTokens(mode)
    const lines = Object.entries(tokens).map(
      ([name, value]) => `  --${name}: ${value};`,
    )
    lines.push(`  --link: var(--${mode.link}-ink);`)
    // The graph labels nodes in the ink, where a mode gives it no grey of its own.
    if (!('graph-label' in mode.neutrals))
      lines.push('  --graph-label: var(--ink);')
    // Popovers are the raised surface, where a mode gives them no grey of their own.
    if (!('popover' in mode.neutrals))
      lines.push('  --popover: var(--surface-raised);')
    // The terminal, related to this mode as pi's slate is to GitHub Sharp's.
    // The page works it out again when a person's own colours change.
    for (const [name, value] of Object.entries(
      terminalCss(terminalTheme(workspaceOf((token) => tokens[token]!))),
    ))
      lines.push(`  ${name}: ${value};`)
    return `${mode.selector} {\n${lines.join('\n')}\n}\n`
  })
  return `/* Generated by scripts/palettes.ts, which says how each colour is placed.
   Edit the spec there and run \`bun scripts/palettes.ts\`. */
${blocks.join('\n')}`
}

export { modes }

export const PALETTES_CSS = new URL('../src/palettes.css', import.meta.url)

if (import.meta.main) await Bun.write(PALETTES_CSS, palettesCss())
