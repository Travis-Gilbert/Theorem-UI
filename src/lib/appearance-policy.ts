// SOURCING: theorem-appearance-v1 roles, recipes, and Calm manifest.
export const PALETTES = [
  {
    value: 'github-sharp',
    label: 'GitHub Sharp',
    code: { light: 'github-light-default', dark: 'github-dark-default' },
  },
  {
    value: 'stone',
    label: 'Stone',
    code: { light: 'github-light-default', dark: 'github-dark-default' },
  },
  {
    value: 'vitesse',
    label: 'Vitesse',
    code: { light: 'vitesse-light', dark: 'vitesse-dark' },
  },
] as const

export type Palette = (typeof PALETTES)[number]['value']

export const SURFACE_ROLES = [
  'canvas',
  'navigation',
  'composer',
  'user-message',
  'assistant-reading',
  'popover',
  'artifact',
  'status',
] as const

export const MATERIALS = ['flat', 'paper', 'glass', 'liquid'] as const
export type Material = (typeof MATERIALS)[number]
export type SurfaceRole = (typeof SURFACE_ROLES)[number]

export const TEXT_RECIPES = {
  prose: {
    family: 'text',
    size: 1,
    lineHeight: 1.5,
    weight: 400,
    tracking: 'normal',
    scale: 'content',
  },
  'composer.content': {
    family: 'text',
    size: 1,
    lineHeight: 1.5,
    weight: 400,
    tracking: 'normal',
    scale: 'content',
  },
  'ui.label': {
    family: 'text',
    size: 0.875,
    lineHeight: 20 / 14,
    weight: 400,
    tracking: '0.01em',
    scale: 'ui',
  },
  'ui.section': {
    family: 'text',
    size: 0.875,
    lineHeight: 20 / 14,
    weight: 500,
    tracking: '0.01em',
    scale: 'ui',
  },
  metadata: {
    family: 'text',
    size: 0.75,
    lineHeight: 1.5,
    weight: 400,
    tracking: '0.01em',
    scale: 'ui',
  },
  code: {
    family: 'mono',
    size: 0.8125,
    lineHeight: 20 / 13,
    weight: 400,
    tracking: 'normal',
    scale: 'code',
  },
  'heading.small': {
    family: 'text',
    size: 1.125,
    lineHeight: 24 / 18,
    weight: 600,
    tracking: 'normal',
    scale: 'content',
  },
  'heading.medium': {
    family: 'text',
    size: 1.25,
    lineHeight: 28 / 20,
    weight: 600,
    tracking: 'normal',
    scale: 'content',
  },
  'heading.large': {
    family: 'text',
    size: 1.5,
    lineHeight: 32 / 24,
    weight: 600,
    tracking: 'normal',
    scale: 'content',
  },
} as const

export const CALM_COLORS = {
  light: {
    'surface-neutral': '#ffffff',
    'surface-sidebar': '#f2f3f5',
    'surface-composer': '#ffffff',
    'surface-raised': '#ffffff',
    'surface-user-message': '#f2f3f5',
    'surface-hover': '#edeff1',
    'surface-selected': '#d2e1f0',
    ink: '#24292d',
    'ink-muted': '#586069',
    'line-separator': '#e1e4e8',
    'line-control': '#808892',
    redwood: '#3379b3',
    'on-redwood': '#ffffff',
    'redwood-ink': '#286394',
    focus: '#3379b3',
  },
  dark: {
    'surface-neutral': '#1c1d1e',
    'surface-sidebar': '#1c1d1e',
    'surface-composer': '#262829',
    'surface-raised': '#262829',
    'surface-user-message': '#242627',
    'surface-hover': '#242627',
    'surface-selected': '#2d343a',
    ink: '#c3c6c8',
    'ink-muted': '#a2a5a8',
    'line-separator': '#2c2d2f',
    'line-control': '#85888b',
    redwood: '#4490d0',
    'on-redwood': '#101112',
    'redwood-ink': '#7ebdf7',
    focus: '#7ebdf7',
  },
} as const

export const COLOR_ROLES = {
  canvas: 'surface-neutral',
  navigation: 'surface-sidebar',
  composer: 'surface-composer',
  'user-message': 'surface-user-message',
  'assistant-reading': 'surface-neutral',
  popover: 'popover',
  artifact: 'surface-artifact',
  status: 'error-container',
  hover: 'surface-hover',
  selected: 'surface-selected',
  primary: 'ink',
  secondary: 'ink-muted',
  placeholder: 'ink-muted',
  code: 'ink',
  link: 'redwood-ink',
  separator: 'line-separator',
  boundary: 'line-control',
  accent: 'redwood',
  'accent-hover': 'redwood-hover',
  'accent-pressed': 'redwood-pressed',
  'on-accent': 'on-redwood',
  focus: 'focus',
  error: 'error-ink',
  'destructive-fill': 'error-solid',
  'on-destructive': 'on-error',
  'success-ink': 'teal-ink',
  'success-fill': 'teal-container',
  'warning-ink': 'ochre-ink',
  'warning-fill': 'ochre-container',
} as const

const readableSurfaces = [
  'canvas',
  'navigation',
  'composer',
  'user-message',
  'assistant-reading',
  'popover',
  'artifact',
  'hover',
  'selected',
] as const

type ColorRole = keyof typeof COLOR_ROLES
export type ColorPair = {
  foreground: ColorRole
  background: ColorRole
  minimum: number
}

export const COLOR_PAIRS: readonly ColorPair[] = [
  ...readableSurfaces.flatMap((background) =>
    (['primary', 'secondary', 'link', 'code'] as const).map((foreground) => ({
      foreground,
      background,
      minimum: 4.5,
    })),
  ),
  { foreground: 'placeholder', background: 'composer', minimum: 4.5 },
  ...(['accent', 'accent-hover', 'accent-pressed'] as const).map(
    (background) => ({
      foreground: 'on-accent' as const,
      background,
      minimum: 4.5,
    }),
  ),
  {
    foreground: 'on-destructive',
    background: 'destructive-fill',
    minimum: 4.5,
  },
  { foreground: 'error', background: 'status', minimum: 4.5 },
  { foreground: 'success-ink', background: 'success-fill', minimum: 4.5 },
  { foreground: 'warning-ink', background: 'warning-fill', minimum: 4.5 },
  ...(
    ['canvas', 'navigation', 'composer', 'popover', 'artifact'] as const
  ).flatMap((background) =>
    (['focus', 'boundary'] as const).map((foreground) => ({
      foreground,
      background,
      minimum: 3,
    })),
  ),
]

export function appearancePair(foreground: ColorRole, background: ColorRole) {
  return {
    'data-appearance-pair': `${foreground}/${background}`,
    'data-foreground-role': foreground,
    'data-background-role': background,
  }
}

/** Reference IBM Plex Sans Variable 5.3.0, Latin upright. */
export const PLEX_READING_MEASURE = {
  comfortableMeasure: 35.75,
  wideMeasure: 44.75,
  corpusSha256:
    'dbfeea1c559f50254d2a3f66388fe0c732fa7df09ab74fe0de7921d5860904f7',
  fontSha256:
    'e2291e842cf5af167122a22881a740c7f2dda7716f1e8cd76680264f4a859470',
} as const
