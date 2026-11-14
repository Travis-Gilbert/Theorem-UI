import postcss from 'postcss'
import { converter, displayable, parse, wcagContrast } from 'culori'

// Independent semantic edge set transcribed from the v1 policy. Semantic names
// map to generated palette variables here; production policy is deliberately
// not imported, so mismatches between the two manifests remain detectable.
const READING_SURFACES = Object.freeze({
  canvas: 'surface-neutral', navigation: 'surface-sidebar', composer: 'surface-composer',
  'user-message': 'surface-user-message', 'assistant-reading': 'surface-neutral',
  popover: 'popover', artifact: 'surface-artifact', hover: 'surface-hover', selected: 'surface-selected',
})
export const REQUIRED_PALETTE_PAIRS = Object.freeze([
  ...Object.entries(READING_SURFACES).flatMap(([surface, background]) =>
    [['primary','ink'],['secondary','ink-muted'],['link','redwood-ink'],['code','ink']].map(([role,foreground]) => ({ foreground, background, threshold: 4.5, id: `${role}/${surface}` }))),
  { foreground: 'ink-muted', background: 'surface-composer', threshold: 4.5, id: 'placeholder/composer' },
  ...[['on-redwood','redwood','on-accent/redwood'],['on-redwood','redwood-hover','on-accent/redwood-hover'],['on-redwood','redwood-pressed','on-accent/redwood-pressed']].map(([foreground,background,id]) => ({ foreground, background, threshold: 4.5, id })),
  { foreground:'on-error',background:'error-solid',threshold:4.5,id:'on-destructive/destructive-fill' },
  ...[['error-ink','error-container','error'],['teal-ink','teal-container','success'],['ochre-ink','ochre-container','warning']].map(([foreground,background,role])=>({foreground,background,threshold:4.5,id:`${role}-ink/${role}-container`})),
  ...[['surface-neutral','canvas'],['surface-sidebar','navigation'],['surface-composer','composer'],['popover','popover'],['surface-artifact','artifact']].flatMap(([background,surface])=>[
    {foreground:'focus',background,threshold:3,id:`focus/${surface}`},
    {foreground:'line-control',background,threshold:3,id:`boundary/${surface}`},
  ]),
])

// Independent mapping from rendered semantic attributes to concrete policy
// token IDs. A valid contrast ratio alone must not bless an unregistered
// foreground/background relationship.
const RENDERED_FOREGROUNDS = Object.freeze({
  primary: ['ink'], secondary: ['ink-muted'], link: ['redwood-ink'],
  placeholder: ['ink-muted'], code: ['ink'], 'code-token': ['ink'],
  'on-accent': ['on-redwood'], 'on-destructive': ['on-error'], error: ['error-ink'],
  focus: ['focus'], boundary: ['line-control'],
})
const RENDERED_BACKGROUNDS = Object.freeze({
  canvas: ['surface-neutral'], navigation: ['surface-sidebar'], composer: ['surface-composer'],
  'user-message': ['surface-user-message'], 'assistant-reading': ['surface-neutral'],
  popover: ['popover'], artifact: ['surface-artifact'], hover: ['surface-hover'],
  selected: ['surface-selected'], accent: ['redwood'], 'destructive-fill': ['error-solid'],
  status: ['error-container'],
})

export function renderedRolePairRegistration(pair) {
  const foregrounds = RENDERED_FOREGROUNDS[pair.foregroundRole] ?? []
  let backgrounds = RENDERED_BACKGROUNDS[pair.backgroundRole] ?? []
  if (pair.backgroundRole === 'accent' && pair.state === 'hover') backgrounds = ['redwood-hover']
  if (pair.backgroundRole === 'accent' && pair.state === 'pressed') backgrounds = ['redwood-pressed']
  const registered = REQUIRED_PALETTE_PAIRS.some(edge => foregrounds.includes(edge.foreground) && backgrounds.includes(edge.background))
  return { registered, foregroundTokens:foregrounds, backgroundTokens:backgrounds, state:pair.state??'default' }
}

export const REQUIRED_RENDERED_FIXTURE_PAIRS = Object.freeze({
  F01: ['primary/composer','secondary/composer','placeholder/composer'],
  F02: ['primary/assistant-reading','secondary/assistant-reading'],
  F03: ['primary/user-message','primary/assistant-reading'],
  F04: ['code/popover','link/assistant-reading','primary/assistant-reading'],
  F05: ['primary/composer','secondary/composer'],
  F06: ['secondary/assistant-reading'],
  F07: ['error/status','primary/assistant-reading'],
  F08: ['primary/navigation','primary/selected'],
  F09: ['primary/composer','primary/assistant-reading'],
  F10: ['primary/assistant-reading'],
  F11: ['primary/composer'],
})
export const REQUIRED_RENDERED_FIXTURE_CANDIDATES = Object.freeze({
  F01: [{ pair:'placeholder/composer',kind:'placeholder',requireText:true }],
  F02: [{ pair:'secondary/assistant-reading',kind:'semantic',textIncludes:'Details' }],
  F04: [{ pair:'code/popover',kind:'code-token',requireText:true }],
  F06: [{ pair:'secondary/assistant-reading',kind:'semantic',textIncludes:'Checking the examples' }],
  F07: [{ pair:'error/status',kind:'semantic',requireText:true }],
  F08: [{ pair:'primary/selected',kind:'semantic',requireText:true }],
})

export const contrastRatio = (foreground, background) => wcagContrast(foreground, background)

function cssBlocks(css) {
  const root = postcss.parse(css, { from: 'src/palettes.css' })
  const blocks = []
  root.walkRules((rule) => {
    const tokens = {}
    rule.walkDecls(/^--/, (declaration) => { tokens[declaration.prop.slice(2)] = declaration.value.trim() })
    if (Object.keys(tokens).length) blocks.push({ selector: rule.selector, tokens })
  })
  return blocks
}

function resolve(value, tokens, trail = []) {
  const reference = value.match(/^var\(--([\w-]+)\)$/)
  if (!reference) return value
  const name = reference[1]
  if (trail.includes(name)) throw new Error(`cyclic color token alias: ${[...trail, name].join(' -> ')}`)
  const next = tokens[name]
  if (!next) throw new Error(`unresolved color token alias --${name}`)
  return resolve(next, tokens, [...trail, name])
}

export function auditPaletteCss(css) {
  const modes = cssBlocks(css)
  const results = []
  // The candidate custom palette stores unresolved user inputs in aliases;
  // it is not a built-in preset and must not be reported as validated here.
  const modeEntries = modes.filter(({ tokens }) => tokens.ink && tokens.redwood && !tokens.ink.includes('--custom-'))
  if (!modeEntries.length) return [{ id: 'COL-04.palette-modes', status: 'not-measurable', expected: 'mode token blocks in src/palettes.css', observed: 'no palette blocks found' }]

  for (const { selector: mode, tokens } of modeEntries) {
    const concrete = Object.entries(tokens).map(([name, raw]) => {
      try {
        const value = resolve(raw, tokens)
        const color = parse(value)
        const valid = Boolean(color) && displayable(color) && [color.r, color.g, color.b, color.alpha ?? 1].every(Number.isFinite) && (color.alpha ?? 1) >= 0 && (color.alpha ?? 1) <= 1
        return { name, raw, value, valid, error: valid ? undefined : 'not a finite in-gamut sRGB color with alpha in [0,1]' }
      } catch (error) {
        return { name, raw, valid: false, error: String(error) }
      }
    })
    const invalid = concrete.filter((entry) => !entry.valid)
    results.push({
      id: `COL-04.emitted-colors.${mode}`, version: '1.0', class: 'Contract', status: invalid.length ? 'fail' : 'pass',
      expected: 'every emitted/resolved color is finite, sRGB-displayable, and has alpha in [0,1]',
      observed: { tokenCount: concrete.length, invalid: invalid.map(({ name, raw, error }) => ({ name, raw, error })), library: 'culori@4.0.2', precision: 1e-6 },
      evidence: { mode, concrete },
    })
    for (const pair of REQUIRED_PALETTE_PAIRS) {
      const foreground = tokens[pair.foreground]
      const background = tokens[pair.background]
      if (!foreground || !background) {
        const missing = { version: '1.0', status: 'fail', expected: `registered ${pair.foreground} / ${pair.background} pair at >= ${pair.threshold}:1`, observed: 'required palette role missing', evidence: { mode, pair } }
        results.push({ id: `COL-01.minimum.${mode}.${pair.id}`, class: 'Standard', ...missing })
        results.push({ id: `COL-01.contract.${mode}.${pair.id}`, class: 'Contract', ...missing })
        continue
      }
      try {
        const resolvedForeground = resolve(foreground, tokens)
        const resolvedBackground = resolve(background, tokens)
        const ratio = contrastRatio(resolvedForeground, resolvedBackground)
        const status = ratio >= pair.threshold ? 'pass' : 'fail'
        const measured = { version: '1.0', status, expected: `contrast >= ${pair.threshold}:1`, observed: { foregroundRole: pair.foreground, foreground: resolvedForeground, backgroundRole: pair.background, background: resolvedBackground, ratio: Number(ratio.toFixed(6)) }, evidence: { mode, pair, library: 'culori@4.0.2' } }
        results.push({ id: `COL-01.minimum.${mode}.${pair.id}`, class: 'Standard', ...measured })
        results.push({ id: `COL-01.contract.${mode}.${pair.id}`, class: 'Contract', ...measured })
      } catch (error) {
        const unknown = { version: '1.0', status: 'not-measurable', expected: `contrast >= ${pair.threshold}:1`, observed: String(error), evidence: { mode, pair } }
        results.push({ id: `COL-01.minimum.${mode}.${pair.id}`, class: 'Standard', ...unknown })
        results.push({ id: `COL-01.contract.${mode}.${pair.id}`, class: 'Contract', ...unknown })
      }
    }
  }
  return results
}

export const srgbToOklch = converter('oklch')
export const srgbToOklab = converter('oklab')
