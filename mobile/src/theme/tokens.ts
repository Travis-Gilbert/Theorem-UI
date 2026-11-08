// SOURCING: none. Values copied from Theorem-UI src/styles.css (Stone light and dark) and Theorem DESIGN.md (type roles, terminal palette).
//
// The app shares the web client's semantic roles, not its CSS: each role names
// what a color is for, and each scheme fills it. Status colors always travel
// with a text label (DESIGN.md: never color alone).

export type Scheme = 'light' | 'dark'

export type Palette = {
  /** The page behind lists and the transcript. */
  neutral: string
  /** Rows, cards and sheets lifted from the page. */
  raised: string
  /** The composer field. */
  composer: string
  hover: string
  selected: string
  ink: string
  inkMuted: string
  inkFaint: string
  lineControl: string
  lineSeparator: string
  focus: string
  accent: string
  accentPressed: string
  onAccent: string
  accentContainer: string
  accentInk: string
  link: string
  successInk: string
  successContainer: string
  attentionInk: string
  attentionContainer: string
  errorInk: string
  errorContainer: string
}

export const palettes: Record<Scheme, Palette> = {
  light: {
    neutral: '#f3f3f3',
    raised: '#ffffff',
    composer: '#ffffff',
    hover: '#eaeff5',
    selected: '#d0e2f0',
    ink: '#24292e',
    inkMuted: '#586069',
    inkFaint: '#5f6770',
    lineControl: '#c8ccd1',
    lineSeparator: '#e1e4e8',
    focus: '#2e78b8',
    accent: '#3f77a6',
    accentPressed: '#2d5a85',
    onAccent: '#ffffff',
    accentContainer: '#d0e2f0',
    accentInk: '#1f4f7a',
    link: '#005cc5',
    successInk: '#165c27',
    successContainer: '#dcf0e0',
    attentionInk: '#735c0f',
    attentionContainer: '#f5e9b8',
    errorInk: '#b31d28',
    errorContainer: '#ffeef0',
  },
  dark: {
    neutral: '#1c1d1e',
    raised: '#24282a',
    composer: '#232627',
    hover: '#232627',
    selected: '#2a3538',
    ink: '#c3c6c9',
    inkMuted: '#a1a5a8',
    inkFaint: '#84888b',
    lineControl: '#454647',
    lineSeparator: '#2d2d2d',
    focus: '#2e78b8',
    accent: '#5790be',
    accentPressed: '#4a80ab',
    onAccent: '#0e1114',
    accentContainer: '#1a3f60',
    accentInk: '#91afd1',
    link: '#7ea8d6',
    successInk: '#8fc79a',
    successContainer: '#1d2e22',
    attentionInk: '#e4d571',
    attentionContainer: '#3a3415',
    errorInk: '#e08a8f',
    errorContainer: '#3b1d1f',
  },
}

/** DESIGN.md's terminal surface (Asciinema dark), the same in both schemes. */
export const terminal = {
  background: '#121314',
  panel: '#181919',
  muted: '#1a1b1c',
  foreground: '#cccccc',
  border: '#303030',
  primary: '#26b0d7',
} as const

/**
 * Type roles from DESIGN.md: Manrope for the person's interface, IBM Plex Sans
 * for the agent's voice, IBM Plex Mono for code, JetBrains Mono for metadata.
 * Each name is the family `useFonts` registers in src/app/_layout.tsx.
 */
export const fonts = {
  ui: 'Manrope_500Medium',
  uiStrong: 'Manrope_700Bold',
  agent: 'IBMPlexSans_400Regular',
  agentStrong: 'IBMPlexSans_600SemiBold',
  code: 'IBMPlexMono_400Regular',
  meta: 'JetBrainsMono_400Regular',
} as const

/** Conversation prose is 16 on 24 (DESIGN.md); the rest scales with Dynamic Type. */
export const type = {
  prose: { fontSize: 16, lineHeight: 24 },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, lineHeight: 18 },
  meta: { fontSize: 12, lineHeight: 16 },
  title: { fontSize: 20, lineHeight: 26 },
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const
/** DESIGN.md radii: the composer is 16 du. */
export const radius = { control: 8, card: 12, composer: 16, pill: 999 } as const
/** Apple's minimum touch target. */
export const touchTarget = 44
