#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit } from 'playwright-core'
import { converter, displayable, parse } from 'culori'
import { auditPaletteCss, contrastRatio, REQUIRED_PALETTE_PAIRS, REQUIRED_RENDERED_FIXTURE_CANDIDATES, REQUIRED_RENDERED_FIXTURE_PAIRS, renderedRolePairRegistration, srgbToOklab, srgbToOklch } from './colors.mjs'
import { LATIN_PROSE_V1, LATIN_PROSE_V1_ACTUAL_SHA256, LATIN_PROSE_V1_SHA256, FONT_ASSET_EVIDENCE } from './corpus.mjs'
import { CHILD_ORACLES, EXECUTION_MATRIX, FIXTURES, ORACLES, POLICY, PREDICATE_TOLERANCES } from './registry.mjs'
import { measureReading } from './measure-reading.mjs'
import { invariantCheckResult } from './metamorphic.mjs'
import { measureKeyboardFocus } from './focus.mjs'
import { validatePortalEvidence } from './portals.mjs'
import { reviewOutput } from './review-browser.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const index = argv.indexOf(name)
  return index < 0 ? fallback : argv[index + 1]
}
const has = (name) => argv.includes(name)
const ORIGIN = arg('--url', process.env.ORACLE_URL ?? 'http://127.0.0.1:3117/story/design-oracle-long')
const OUTPUT = resolve(arg('--out', 'docs/plans/composable-appearance/evidence/design-oracles'))
const browserName = arg('--browser', 'chromium')
const modeArg = arg('--mode', 'light')
const presetArg = arg('--preset', 'calm')
const engine = ({ chromium, firefox, webkit })[browserName]
const widthArg = arg('--viewport', '1440x900')
const [viewportWidth, viewportHeight] = widthArg.split('x').map(Number)
const runAllViewports = has('--matrix')
const routeSlug = new URL(ORIGIN).pathname.split('/').filter(Boolean).at(-1) ?? 'page'

if ((runAllViewports || has('--all-fixtures')) && !has('--matrix-child') && !has('--fixtures-child')) {
  const base = process.argv[1]
  const viewports = runAllViewports ? ['1024x768', '1440x900', '1920x1080', '320x720', '390x844'] : [widthArg]
  const fixtureRoutes = has('--all-fixtures') ? ['design-oracle-empty','design-oracle-long','design-oracle-preview','design-oracle-content','design-oracle-draft','design-oracle-stream','design-oracle-failure','design-oracle-navigation','design-oracle-reflow','design-oracle-rtl','design-oracle-continuity'] : [null]
  let code = 0
  for (const route of fixtureRoutes) for (const viewport of viewports) {
    const target = route ? new URL(`/story/${route}`, ORIGIN).href : ORIGIN
    const args = [base, '--url', target, '--browser', browserName, '--viewport', viewport, '--mode', modeArg, '--preset', presetArg, '--matrix-child', '--fixtures-child', '--out', OUTPUT]
    const run = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: process.env })
    if (run.status) code = run.status
  }
  process.exit(code)
}

const normalizeStatus = (status) => ['pass', 'fail', 'review', 'not-measurable', 'not-applicable'].includes(status) ? status : 'not-measurable'
const basicResult = (record, status, expected, observed, evidence = {}) => ({
  id: record.id, version: record.version, class: record.class, severity: record.severity ?? null,
  purpose: record.purpose, scope: record.requiredEvidence, applicability: record.fixture,
  fixture: record.fixture, environment: null, extraction: 'scripts/design-oracles/run.mjs', expected,
  tolerance: PREDICATE_TOLERANCES, provenance: record.provenance, observed,
  result: normalizeStatus(status), evidence, exception: null,
})

function rgba(value) {
  if (typeof value !== 'string') return null
  const parsed = parse(value)
  if (!parsed || !displayable(parsed)) return null
  const color = converter('rgb')(parsed)
  if (!color || ![color.r,color.g,color.b,color.alpha??1].every(Number.isFinite)) return null
  if ([color.r,color.g,color.b].some(channel=>channel<0||channel>1)||(color.alpha??1)<0||(color.alpha??1)>1) return null
  return { mode:'rgb',r:color.r,g:color.g,b:color.b,alpha:color.alpha??1 }
}

function over(source, backdrop) {
  const a = source.alpha + backdrop.alpha * (1 - source.alpha)
  if (a === 0) return { mode: 'rgb', r: 0, g: 0, b: 0, alpha: 0 }
  return {
    mode: 'rgb',
    r: (source.r * source.alpha + backdrop.r * backdrop.alpha * (1 - source.alpha)) / a,
    g: (source.g * source.alpha + backdrop.g * backdrop.alpha * (1 - source.alpha)) / a,
    b: (source.b * source.alpha + backdrop.b * backdrop.alpha * (1 - source.alpha)) / a,
    alpha: a,
  }
}

const cssRgb = ({ r, g, b }) => `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`

async function gitRevision() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() }
  catch { return null }
}

async function sourceEvidence() {
  try {
    const diff = execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: ROOT, encoding: 'buffer' })
    const allUntracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'buffer' }).toString().split('\0').filter(Boolean).sort()
    const evidencePrefix='docs/plans/composable-appearance/evidence/'
    const excludedEvidenceFileCount=allUntracked.filter(file=>file.startsWith(evidencePrefix)).length
    const untracked=allUntracked.filter(file=>!file.startsWith(evidencePrefix))
    const tree = createHash('sha256').update(diff)
    for (const file of untracked) tree.update(file).update(await readFile(resolve(ROOT, file)))
    const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(line=>line.trim()&&!line.slice(3).startsWith(evidencePrefix))
    return { head: await gitRevision(), diffSha256: createHash('sha256').update(diff).digest('hex'), workingTreeSha256: tree.digest('hex'), dirtyFileCount: status.length, excludedEvidenceFileCount }
  } catch (error) { return { head: await gitRevision(), status: 'not-measurable', reason: String(error).slice(0, 250) } }
}

const RECIPE_REFERENCE = {
  prose: { size: 1, lineHeight: 1.5, weight: 400, family: 'IBM Plex Sans', scale: 'content' },
  'composer.content': { size: 1, lineHeight: 1.5, weight: 400, family: 'IBM Plex Sans', scale: 'content' },
  'ui.label': { size: 0.875, lineHeight: 20 / 14, weight: 400, family: 'IBM Plex Sans', scale: 'ui', tracking: 0.01 },
  'ui.section': { size: 0.875, lineHeight: 20 / 14, weight: 500, family: 'IBM Plex Sans', scale: 'ui', tracking: 0.01 },
  metadata: { size: 0.75, lineHeight: 1.5, weight: 400, family: 'IBM Plex Sans', scale: 'ui', tracking: 0.01 },
  code: { size: 0.8125, lineHeight: 20 / 13, weight: 400, family: 'JetBrains Mono', scale: 'code' },
  'heading.small': { size: 1.125, lineHeight: 24 / 18, weight: 600, family: 'IBM Plex Sans', scale: 'content' },
  'heading.medium': { size: 1.25, lineHeight: 28 / 20, weight: 600, family: 'IBM Plex Sans', scale: 'content' },
  'heading.large': { size: 1.5, lineHeight: 32 / 24, weight: 600, family: 'IBM Plex Sans', scale: 'content' },
}

function auditRecipes(recipes, environment) {
  const scales = environment.appState?.scales ?? { content: 1, ui: 1, code: 1 }
  const observed = []
  for (const [role, recipe] of Object.entries(RECIPE_REFERENCE)) {
    const matches = recipes.filter((item) => item.recipe === role && item.text)
    if (!matches.length) {
      observed.push({ role, result: 'not-measurable', reason: 'no actual text-bearing component carries this recipe hook' })
      continue
    }
    for (const item of matches) {
      const scale = scales?.[recipe.scale] ?? 1
      const expectedSize = environment.rootFontSizePx * recipe.size * scale
      const expectedLineHeight = expectedSize * recipe.lineHeight
      const failures = []
      if (Math.abs(item.fontSize - expectedSize) > PREDICATE_TOLERANCES.fontPx) failures.push(`font-size ${item.fontSize}px != ${expectedSize}px`)
      if (Math.abs(item.lineHeight - expectedLineHeight) > PREDICATE_TOLERANCES.lineHeightPx) failures.push(`line-height ${item.lineHeight}px != ${expectedLineHeight}px`)
      if (Number(item.fontWeight) !== recipe.weight) failures.push(`font-weight ${item.fontWeight} != ${recipe.weight}`)
      if (!item.fontFamily.includes(recipe.family)) failures.push(`requested family stack lacks ${recipe.family}`)
      if (recipe.tracking && Math.abs(item.letterSpacing - item.fontSize * recipe.tracking) > PREDICATE_TOLERANCES.letterSpacingPx) failures.push(`tracking ${item.letterSpacing}px != ${item.fontSize * recipe.tracking}px`)
      observed.push({ role, id: item.id, text: item.text, result: failures.length ? 'fail' : 'pass', expected: { fontSize: expectedSize, lineHeight: expectedLineHeight, weight: recipe.weight, family: recipe.family, trackingEm: recipe.tracking ?? 0 }, actual: item, failures })
    }
  }
  const applicable = observed.filter((item) => item.result !== 'not-measurable')
  const missingRole = Object.keys(RECIPE_REFERENCE).some((role) => !observed.some((item) => item.role === role && item.result !== 'not-measurable'))
  return { observations: observed, status: applicable.some((item) => item.result === 'fail') ? 'fail' : missingRole ? 'not-measurable' : 'pass' }
}

function humanReport(report) {
  const tally = Object.fromEntries(['pass', 'fail', 'review', 'not-measurable', 'not-applicable'].map((s) => [s, report.results.filter((r) => r.result === s).length]))
  const lines = [
    `# Design oracle report — ${POLICY.id} v${POLICY.version}`,
    '',
    `Revision: ${report.environment.revision ?? 'unknown'}  `,
    `URL: ${report.environment.url}  `,
    `Browser: ${report.environment.browser ?? 'unavailable'}  `,
    `Viewport: ${report.environment.viewport.width} × ${report.environment.viewport.height} CSS px  `,
    `Corpus SHA-256: ${report.corpus.sha256} (${report.corpus.valid ? 'verified' : 'MISMATCH'})`,
    '',
    `Results: ${tally.pass} pass, ${tally.fail} fail, ${tally.review} review, ${tally['not-measurable']} not-measurable, ${tally['not-applicable']} not-applicable.`,
    '',
    'There is no aggregate design score. Missing evidence remains not-measurable and blocks completion claims for its applicable contract.',
    '',
    '## Failures, reviews, and measurement gaps',
    '',
  ]
  const rows = report.results.filter((item) => ['fail', 'review', 'not-measurable'].includes(item.result))
  if (!rows.length) lines.push('None.')
  for (const item of rows) {
    let actual
    if (item.id === 'COL-01' && item.observed && typeof item.observed === 'object') {
      const p = item.observed.palettePairs ?? []
      const r = item.observed.renderedPairs ?? []
      const paletteCount = Array.isArray(p) ? p.length : p.count ?? 0
      const renderedCount = Array.isArray(r) ? r.length : item.observed.renderedPairCount ?? 0
      const paletteFailures = Array.isArray(p) ? p.filter(row => row.status === 'fail').length : p.statuses?.fail ?? item.observed.failedPalettePairs?.length ?? 0
      const renderedFailures = Array.isArray(r) ? r.filter(row => row.status === 'fail').length : item.observed.failedRenderedPairs?.length ?? 0
      actual = `palette pairs ${paletteCount}; rendered pairs ${renderedCount}; failures ${paletteFailures} palette, ${renderedFailures} rendered`
    } else if (typeof item.observed === 'string') actual = item.observed
    else {
      const json = JSON.stringify(item.observed)
      actual = json.length > 500 ? `${json.slice(0, 497)}...` : json
    }
    lines.push(`- **${item.result.toUpperCase()} ${item.id}** (${item.class}; ${item.fixture}): expected ${typeof item.expected === 'string' ? item.expected : JSON.stringify(item.expected)}; observed ${actual}. Evidence: ${item.evidence.source ?? item.evidence.note ?? 'see machine report'}.`)
  }
  lines.push('', '## Fixture coverage', '')
  for (const fixture of report.fixtures) lines.push(`- ${fixture.id} ${fixture.name}: **${fixture.result}** — ${typeof fixture.observed==='string'?fixture.observed:JSON.stringify(fixture.observed)}`)
  lines.push('', '## Limitations', '', ...report.limitations.map((limitation) => `- ${limitation}`), '')
  return lines.join('\n')
}

const resultById = new Map()
const paletteCss = await readFile(resolve(ROOT, 'src/palettes.css'), 'utf8')
for (const result of auditPaletteCss(paletteCss)) resultById.set(result.id, result)

const corpusValid = LATIN_PROSE_V1_ACTUAL_SHA256 === LATIN_PROSE_V1_SHA256
const environment = {
  timestamp: new Date().toISOString(), revision: await gitRevision(), source: await sourceEvidence(), url: ORIGIN,
  requestedState: { preset: presetArg, mode: modeArg },
  browser: null, viewport: { width: Number.isFinite(viewportWidth) ? viewportWidth : 1440, height: Number.isFinite(viewportHeight) ? viewportHeight : 900 },
  deviceScaleFactor: null, userAgent: null, locale: null, direction: null, motion: null,
  rootFontSizePx: null, appState: null,
}
const measurements = { parts: [], recipes: [], colorPairs: [], fonts: null, stability: null, document: null, visibilityProbes: [] }
const limitations = []
const pageErrors=[]
let browser
let page
let browserFailure

if (!engine) {
  browserFailure = `Unsupported browser engine ${browserName}`
} else {
  try {
    browser = await engine.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: environment.viewport.width, height: environment.viewport.height }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'en-US', colorScheme: modeArg })
    page = await context.newPage()
    await page.addInitScript(({ preset, mode }) => {
      localStorage.setItem('theorem-ui:appearance', JSON.stringify({ state: { preset, overrides: {} }, version: 1 }))
      localStorage.setItem('theorem-ui-theme', mode)
    }, { preset: presetArg, mode: modeArg })
    page.on('pageerror', (error) => { pageErrors.push(String(error).slice(0,300)); limitations.push(`Page error: ${String(error).slice(0, 300)}`) })
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.locator('[data-story-ready]').waitFor({state:'attached',timeout:30_000})
    await page.locator('[data-appearance-fixture]').waitFor({state:'attached',timeout:30_000})
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
    await page.evaluate(async () => { await document.fonts.ready })
    await page.addStyleTag({ content: '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;scroll-behavior:auto!important}' }).catch(() => undefined)
    if (routeSlug === 'design-oracle-long') {
      const activity = page.locator('[data-appearance-fixture="F02"] [data-slot="activity-line"]').first()
      if (await activity.count()) {
        await activity.scrollIntoViewIfNeeded()
        const evidence = await activity.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return { text: element.textContent?.trim() ?? '', visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && style.visibility !== 'hidden' && style.display !== 'none', rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, scrollContainer: element.closest('[data-appearance-part="conversation-track"]')?.getAttribute('data-appearance-part') ?? null }
        })
        measurements.visibilityProbes.push({ id: 'COL-01.secondary/assistant-reading', ...evidence, scrolledIntoView: true })
      } else {
        measurements.visibilityProbes.push({ id: 'COL-01.secondary/assistant-reading', visible: false, reason: 'production Activity metadata line was absent from F02 fixture' })
      }
    }
    measurements.codeScrollProbe = await page.evaluate(async () => {
      const scrollers = [...document.querySelectorAll('.cm-scroller')]
      const scroller = scrollers.find((element) => element.scrollWidth > element.clientWidth && element.querySelector('.cm-content'))
      if (!scroller) return { status: 'not-applicable', reason: 'no horizontally scrollable CodeMirror content in this fixture' }
      const before = scroller.scrollLeft
      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth
      scroller.scrollLeft = maxScrollLeft
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const walker = document.createTreeWalker(scroller.querySelector('.cm-content'), NodeFilter.SHOW_TEXT)
      const textNodes = []
      while (walker.nextNode()) if (walker.currentNode.textContent?.trim()) textNodes.push(walker.currentNode)
      let finalGlyph = null
      const last = textNodes.at(-1)
      if (last) {
        const text = last.textContent ?? ''
        let index = text.length - 1
        while (index >= 0 && /\s/u.test(text[index])) index--
        if (index >= 0) {
          const range = document.createRange()
          range.setStart(last, index)
          range.setEnd(last, index + 1)
          const rect = range.getBoundingClientRect()
          const box = scroller.getBoundingClientRect()
          finalGlyph = { rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, scrollerRect: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, visibleAtEnd: rect.width > 0 && rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5 }
        }
      }
      const result = { status: finalGlyph?.visibleAtEnd ? 'pass' : 'fail', selector: '.cm-scroller .cm-content', scrollerIndex: scrollers.indexOf(scroller), scrollRangeCssPx: maxScrollLeft, startScrollLeft: before, endScrollLeft: scroller.scrollLeft, finalGlyph, outerDocumentScrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }
      scroller.scrollLeft = before
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return result
    })
    measurements.editorScrollProbes = await page.evaluate(async () => {
      const candidates = [...document.querySelectorAll('.milkdown .ProseMirror[contenteditable="true"], .cm-content[contenteditable="true"]')]
      const probes = []
      for (const [index, editor] of candidates.entries()) {
        const style = getComputedStyle(editor)
        const maxScrollTop = editor.scrollHeight - editor.clientHeight
        if (maxScrollTop <= 0 || !/auto|scroll/.test(style.overflowY)) continue
        const before = editor.scrollTop
        editor.scrollTop = maxScrollTop
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
        const nodes = []
        while (walker.nextNode()) if (walker.currentNode.textContent?.trim()) nodes.push(walker.currentNode)
        const last = nodes.at(-1)
        let finalGlyph = null
        if (last) {
          const text = last.textContent ?? ''
          let offset = text.length - 1
          while (offset >= 0 && /\s/u.test(text[offset])) offset--
          if (offset >= 0) {
            const range = document.createRange()
            range.setStart(last, offset)
            range.setEnd(last, offset + 1)
            const glyph = range.getBoundingClientRect()
            const box = editor.getBoundingClientRect()
            finalGlyph = { rect: { left: glyph.left, right: glyph.right, top: glyph.top, bottom: glyph.bottom }, editorRect: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, visibleAtEnd: glyph.height > 0 && glyph.top >= box.top - 0.5 && glyph.bottom <= box.bottom + 0.5 }
          }
        }
        const actions = document.querySelector('[data-appearance-part="composer-actions"]')
        const actionRect = actions?.getBoundingClientRect()
        const actionsReachable = Boolean(actionRect && actionRect.width > 0 && actionRect.height > 0 && actionRect.top >= 0 && actionRect.bottom <= innerHeight)
        const rect = editor.getBoundingClientRect()
        const visibleWidth = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left))
        const visibleHeight = Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top))
        probes.push({ index, selector: editor.matches('.milkdown .ProseMirror') ? '.milkdown .ProseMirror[contenteditable=true]' : '.cm-content[contenteditable=true]', status: finalGlyph?.visibleAtEnd && actionsReachable ? 'pass' : 'fail', maxScrollTop, startScrollTop: before, endScrollTop: editor.scrollTop, finalGlyph, actionsReachable, actionRect: actionRect ? { x: actionRect.x, y: actionRect.y, width: actionRect.width, height: actionRect.height } : null, visibleAreaFraction: rect.width * rect.height ? visibleWidth * visibleHeight / (rect.width * rect.height) : 0 })
        editor.scrollTop = before
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      }
      return probes
    })
    const meta = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight }, deviceScaleFactor: devicePixelRatio, userAgent: navigator.userAgent,
      locale: navigator.language, direction: getComputedStyle(document.documentElement).direction,
      fixtureDirection: getComputedStyle(document.querySelector('[data-appearance-fixture]')??document.documentElement).direction,
      motion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'no-preference',
      rootFontSizePx: parseFloat(getComputedStyle(document.documentElement).fontSize),
      appState: (() => {
        const root = document.documentElement
        let parsed = null
        try { parsed = JSON.parse(root.dataset.appearanceState ?? 'null') } catch {}
        return { preset: root.dataset.appearancePreset, palette: root.dataset.palette, density: root.dataset.density, reading: root.dataset.readingWidth, materials: Object.fromEntries([...root.attributes].filter((attribute) => attribute.name.startsWith('data-material-')).map((attribute) => [attribute.name.slice(14), attribute.value])), scales: parsed?.scales ?? null, overrides: parsed?.overrides ?? null, mode: root.classList.contains('dark') ? 'dark' : 'light' }
      })(),
      document: { title: document.title, readyState: document.readyState, lang: document.documentElement.lang || null, storyBackdrop: getComputedStyle(document.querySelector('[data-story]') ?? document.body).backgroundColor },
      fontFaces: [...document.fonts].map((font) => ({ family: font.family, style: font.style, weight: font.weight, status: font.status })),
      resources: performance.getEntriesByType('resource').filter((entry) => /\.(woff2?|ttf|otf)(?:\?|$)/i.test(entry.name)).map((entry) => ({ name: new URL(entry.name).pathname, durationMs: entry.duration, transferSize: entry.transferSize })),
    }))
    meta.browserVersion = browser.version()
    meta.browser = `${browserName} ${browser.version()}`
    Object.assign(environment, meta)
    measurements.document = meta.document
    const assetResults = await Promise.all(FONT_ASSET_EVIDENCE.map(async (asset) => {
      const file = resolve(ROOT, 'node_modules', asset.package, asset.asset)
      try {
        const actual = createHash('sha256').update(await readFile(file)).digest('hex')
        return { ...asset, actualSha256: actual, status: actual === asset.sha256 ? 'pass' : 'fail' }
      } catch (error) { return { ...asset, status: 'not-measurable', reason: String(error).slice(0, 200) } }
    }))
    measurements.fonts = { faces: meta.fontFaces, resources: meta.resources, expectedAssets: assetResults }

    const collect = () => page.evaluate(({codeScrollProbe,editorScrollProbes}) => {
      const tracked = [...document.querySelectorAll('[data-appearance-part],[data-appearance-width-role],[data-appearance-spacing-role]')].map((element, index) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          id: element.id || null, anchorKey: `${element.id || 'anonymous'}:${element.getAttribute('data-appearance-part')}:${index}`, part: element.getAttribute('data-appearance-part'),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
          style: { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, color: style.color, backgroundColor: style.backgroundColor, padding: style.padding, paddingInline: style.paddingInline, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight, gap: style.gap, borderRadius: style.borderRadius, direction: style.direction, opacity: style.opacity, backdropFilter: style.backdropFilter, filter: style.filter, borderTopWidth: style.borderTopWidth, borderBottomWidth: style.borderBottomWidth, borderLeftWidth: style.borderLeftWidth, borderRightWidth: style.borderRightWidth, marginInline: style.marginInline, rowGap: style.rowGap },
          clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
          text: (element.textContent ?? '').trim().slice(0, 120), recipe: element.getAttribute('data-appearance-recipe'), widthRole: element.getAttribute('data-appearance-width-role'), overlay: element.getAttribute('data-overlay') === 'true', spacingRole: element.getAttribute('data-appearance-spacing-role'), radiusRole: element.getAttribute('data-appearance-radius-role'),
        }
      })
      const readingLayout=(()=>{
        const track=document.querySelector('[data-appearance-part="conversation-track"]')
        if(!track)return null
        const viewport=track.parentElement,style=getComputedStyle(track),viewportStyle=getComputedStyle(viewport)
        const resolveLength=(property)=>{const probe=document.createElement('div');probe.setAttribute('aria-hidden','true');Object.assign(probe.style,{position:'absolute',visibility:'hidden',display:'block',height:'0',minWidth:'0',maxWidth:'none',padding:'0',border:'0',margin:'0',width:`var(${property})`});track.append(probe);const value=parseFloat(getComputedStyle(probe).width);probe.remove();return Number.isFinite(value)?value:null}
        const pagePaddingPx=resolveLength('--appearance-page-padding'),avatarWidthPx=resolveLength('--appearance-avatar-width'),composerInsetPx=resolveLength('--appearance-composer-inset'),trackSidePx=resolveLength('--appearance-track-side'),proseMeasurePx=resolveLength('--appearance-prose-measure')
        const viewportPaddingInline=parseFloat(viewportStyle.paddingLeft)+parseFloat(viewportStyle.paddingRight)
        const viewportUsableInline=Math.max(0,viewport.clientWidth-viewportPaddingInline)
        const availableReadingWidth=pagePaddingPx===null||trackSidePx===null?null:Math.max(0,viewportUsableInline-2*pagePaddingPx-2*trackSidePx)
        return {viewportRect:(()=>{const r=viewport.getBoundingClientRect();return{x:r.x,width:r.width,left:r.left,right:r.right}})(),viewportClientWidth:viewport.clientWidth,viewportPaddingInline:{left:viewportStyle.paddingLeft,right:viewportStyle.paddingRight},viewportUsableInline,pagePaddingPx,avatarWidthPx,composerInsetPx,trackSidePx,proseMeasureCssPx:proseMeasurePx,availableReadingWidth,expectedTrackSidePx:avatarWidthPx===null||composerInsetPx===null?null:Math.max(avatarWidthPx,composerInsetPx),composer:{paddingInline:getComputedStyle(document.querySelector('[data-appearance-part="composer"]')??track).paddingInline,borderInlineWidth:`${getComputedStyle(document.querySelector('[data-appearance-part="composer"]')??track).borderLeftWidth} ${getComputedStyle(document.querySelector('[data-appearance-part="composer"]')??track).borderRightWidth}`}}
      })()
      const recipeElements = [...document.querySelectorAll('[data-appearance-recipe]')]
      for (const element of document.querySelectorAll('.aui-md-p')) if (!recipeElements.includes(element)) { element.dataset.oracleRecipe = 'prose'; recipeElements.push(element) }
      for (const element of document.querySelectorAll('[contenteditable="true"], textarea')) if (!recipeElements.includes(element)) { element.dataset.oracleRecipe = 'composer.content'; recipeElements.push(element) }
      const recipes = recipeElements.map((element) => {
        const style = getComputedStyle(element)
        return { id: element.id || null, tag: element.tagName, contentEditable: element.getAttribute('contenteditable') === 'true', recipe: element.getAttribute('data-appearance-recipe') || element.dataset.oracleRecipe, text: (element.textContent ?? element.value ?? '').trim().slice(0, 100), fontFamily: style.fontFamily, fontSize: parseFloat(style.fontSize), fontWeight: style.fontWeight, lineHeight: parseFloat(style.lineHeight), letterSpacing: style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing), color: style.color, rect: (() => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })() }
      })
      const semanticColorElements=[...document.querySelectorAll('[data-appearance-pair]')].map(element=>({element,kind:'semantic'}))
      const codeElements=[...document.querySelectorAll('pre code,pre code span')].filter(element=>element.textContent?.trim()).map(element=>({element,kind:'code-token'}))
      const colorElements=[...new Set([...semanticColorElements,...codeElements].map(item=>item.element))].map(element=>({element,kind:element.closest('pre code')?'code-token':'semantic'}))
      const colors = colorElements.map(({element,kind}) => {
        const style = getComputedStyle(element)
        const ancestry = []
        const opacityStack = []
        let hidden=style.display==='none'||style.visibility==='hidden'
        for (let node = element; node && node instanceof HTMLElement; node = node.parentElement) {
          const computed = getComputedStyle(node)
          const backgroundColor = computed.backgroundColor
          opacityStack.push({ element: node.id || node.getAttribute('data-appearance-part') || node.tagName.toLowerCase(), opacity: computed.opacity, backgroundColor, backgroundImage: computed.backgroundImage, filter: computed.filter, backdropFilter: computed.backdropFilter, maskImage: computed.maskImage })
          if(computed.display==='none'||computed.visibility==='hidden'||Number(computed.opacity)===0)hidden=true
          if (backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') ancestry.push({ element: node.id || node.getAttribute('data-appearance-part') || node.tagName.toLowerCase(), backgroundColor })
        }
        const rect=element.getBoundingClientRect()
        if(rect.width<=0||rect.height<=0)hidden=true
        const semanticPair=element.closest('[data-appearance-pair]')
        return { id: element.id || null, foregroundRole: kind==='code-token'?'code':element.getAttribute('data-foreground-role'), backgroundRole: kind==='code-token'?semanticPair?.getAttribute('data-background-role')??null:element.getAttribute('data-background-role'), candidateKind:kind, text:(element.textContent??'').trim().slice(0,80), state: element.getAttribute('data-interaction-state') || 'default', inactive: Boolean(element.closest(':disabled,[aria-disabled="true"]')), hidden, foreground: style.color, foregroundOpacity: style.opacity, background: style.backgroundColor, ancestry, opacityStack, backdropFilter: style.backdropFilter, maskImage: style.maskImage }
      })
      for(const editor of document.querySelectorAll('[data-placeholder-foreground-role="placeholder"]')){
        const placeholder=editor.querySelector('.crepe-placeholder')
        if(!placeholder)continue
        const pseudo=getComputedStyle(placeholder,'::before'),ancestry=[],opacityStack=[]
        let hidden=pseudo.display==='none'||pseudo.visibility==='hidden'||Number(pseudo.opacity)===0
        opacityStack.push({element:'::before',opacity:pseudo.opacity,backgroundColor:pseudo.backgroundColor,backgroundImage:pseudo.backgroundImage,filter:pseudo.filter,backdropFilter:pseudo.backdropFilter,maskImage:pseudo.maskImage})
        for(let node=placeholder;node&&node instanceof HTMLElement;node=node.parentElement){const computed=getComputedStyle(node),backgroundColor=computed.backgroundColor;opacityStack.push({element:node.id||node.getAttribute('data-appearance-part')||node.tagName.toLowerCase(),opacity:computed.opacity,backgroundColor,backgroundImage:computed.backgroundImage,filter:computed.filter,backdropFilter:computed.backdropFilter,maskImage:computed.maskImage});if(computed.display==='none'||computed.visibility==='hidden'||Number(computed.opacity)===0)hidden=true;if(backgroundColor!=='rgba(0, 0, 0, 0)'&&backgroundColor!=='transparent')ancestry.push({element:node.id||node.getAttribute('data-appearance-part')||node.tagName.toLowerCase(),backgroundColor})}
        const rect=placeholder.getBoundingClientRect();if(rect.width<=0||rect.height<=0)hidden=true
        colors.push({id:editor.id||null,foregroundRole:'placeholder',backgroundRole:'composer',candidateKind:'placeholder',text:editor.getAttribute('aria-placeholder')||pseudo.content,state:'default',inactive:Boolean(editor.closest(':disabled,[aria-disabled="true"]')),hidden,foreground:pseudo.color,foregroundOpacity:pseudo.opacity,background:getComputedStyle(editor).backgroundColor,ancestry,opacityStack,backdropFilter:pseudo.backdropFilter,maskImage:pseudo.maskImage,pseudoElement:'::before'})
      }
      const surfaces = [...document.querySelectorAll('[data-surface-role]')].map((element) => {
        const s=getComputedStyle(element),r=element.getBoundingClientRect(),paintStack=[]
        for(let node=element;node&&node instanceof HTMLElement;node=node.parentElement){const style=getComputedStyle(node);paintStack.push({element:node.id||node.getAttribute('data-surface-role')||node.tagName.toLowerCase(),background:style.backgroundColor,backgroundImage:style.backgroundImage,opacity:style.opacity,filter:style.filter,backdropFilter:style.backdropFilter,maskImage:style.maskImage})}
        return {role:element.getAttribute('data-surface-role'),material:element.getAttribute('data-material')||element.getAttribute('data-surface-material'),background:s.backgroundColor,backdropFilter:s.backdropFilter,filter:s.filter,opacity:s.opacity,paintStack,rect:{x:r.x,y:r.y,width:r.width,height:r.height}}
      })
      const controlBoundaries=[...document.querySelectorAll('[data-appearance-part="composer"],[data-appearance-part="editor-viewport"],[data-appearance-part="navigation-row"]')].map((element,index)=>{
        const s=getComputedStyle(element),r=element.getBoundingClientRect(),surface=element.closest('[data-surface-role]'),surfaceStyle=surface?getComputedStyle(surface):null
        return {id:element.id||null,index,part:element.getAttribute('data-appearance-part'),surfaceRole:surface?.getAttribute('data-surface-role')??null,selected:element.getAttribute('aria-current')==='page'||element.getAttribute('aria-selected')==='true'||element.getAttribute('data-selected')==='true',rect:{x:r.x,y:r.y,width:r.width,height:r.height},background:s.backgroundColor,border:{width:s.borderTopWidth,style:s.borderTopStyle,color:s.borderTopColor},adjacentBackground:surfaceStyle?.backgroundColor??getComputedStyle(element.parentElement??document.body).backgroundColor}
      })
      const withinControl=[...document.querySelectorAll('.appearance-composer-tools :is(button,[role="button"])')].map(element=>{const s=getComputedStyle(element);return {gap:parseFloat(s.gap),display:s.display,childCount:element.children.length,label:element.getAttribute('aria-label')||element.textContent?.trim().slice(0,40)}}).find(item=>['flex','inline-flex','grid','inline-grid'].includes(item.display)&&item.childCount>=2&&Number.isFinite(item.gap))??null
      const relatedControl=document.querySelector('[data-appearance-spacing-role="related-controls"]')
      const groupControl=document.querySelector('[data-appearance-spacing-role="group-controls"]')
      const spacingHierarchy={
        'within-controls':withinControl?{value:withinControl.gap,evidence:withinControl}:null,
        'related-controls':relatedControl?{value:parseFloat(getComputedStyle(relatedControl).gap),evidence:{selector:'[data-appearance-spacing-role="related-controls"]',part:relatedControl.getAttribute('data-appearance-part')}}:null,
        'group-gap':groupControl?{value:parseFloat(getComputedStyle(groupControl).gap),evidence:{selector:'[data-appearance-spacing-role="group-controls"]',part:groupControl.getAttribute('data-appearance-part')}}:null,
      }
      const fixtureRoots = [...document.querySelectorAll('[data-appearance-fixture]')].map((node) => node.getAttribute('data-appearance-fixture')).filter(Boolean)
      const previews = [...document.querySelectorAll('[data-appearance-part="preview"]')].map((element) => {
        const ancestorEffects=[]
        for(let node=element;node&&node instanceof HTMLElement;node=node.parentElement) { const s=getComputedStyle(node); ancestorEffects.push({opacity:s.opacity,maskImage:s.maskImage,filter:s.filter}) }
        return { text: element.textContent?.trim() ?? '', hidden: element.getAttribute('aria-hidden') === 'true', maskImage: getComputedStyle(element).maskImage, opacity: getComputedStyle(element).opacity, backgroundColor: getComputedStyle(element).backgroundColor, ancestorEffects }
      })
      const textBlocks = [...document.querySelectorAll('.aui-md-p,h1,h2,h3,h4,h5,h6')].map((element) => { const r=element.getBoundingClientRect(),s=getComputedStyle(element); return { tag:element.tagName.toLowerCase(),text:element.textContent?.trim()??'',top:r.top,bottom:r.bottom,height:r.height,marginBlockStart:parseFloat(s.marginBlockStart)||0,marginBlockEnd:parseFloat(s.marginBlockEnd)||0,lineHeight:parseFloat(s.lineHeight),fontSize:parseFloat(s.fontSize) } })
      const interactiveTargets = [...document.querySelectorAll('button,a,[role="button"],input:not([type="hidden"]),textarea,[contenteditable="true"]')].map((node) => {
        const r=node.getBoundingClientRect(),s=getComputedStyle(node),visible={left:Math.max(0,r.left),top:Math.max(0,r.top),right:Math.min(innerWidth,r.right),bottom:Math.min(innerHeight,r.bottom)}
        let scrollClipped=false, hardClipped=false
        const textRects=[]
        const textLineHeights=[]
        const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT)
        while(walker.nextNode()){
          const textNode=walker.currentNode,parent=textNode.parentElement
          if(!parent||!textNode.textContent?.trim())continue
          let excluded=false
          for(let ancestor=parent;ancestor&&ancestor!==node;ancestor=ancestor.parentElement){
            const a=getComputedStyle(ancestor)
            if(ancestor.matches('svg,.sr-only,.visually-hidden,[data-sr-only]')||a.display==='none'||a.visibility==='hidden'||a.position==='absolute'||a.position==='fixed'||a.clipPath!=='none'||a.clip!=='auto'&&a.clip!=='rect(0px, 0px, 0px, 0px)'){excluded=true;break}
          }
          if(excluded)continue
          const range=document.createRange();range.selectNodeContents(textNode)
          const style=getComputedStyle(parent),lineHeight=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.2
          for(const rect of range.getClientRects())if(rect.width>0&&rect.height>0){const codeContent=parent.closest('.cm-content'),codeScroller=codeContent?.closest('.cm-scroller');textRects.push({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,height:rect.height,lineHeight,insideCodeContent:Boolean(codeContent),codeScrollerIndex:codeScroller?[...document.querySelectorAll('.cm-scroller')].indexOf(codeScroller):-1});textLineHeights.push(lineHeight)}
        }
        const textBands=[]
        for(const rect of textRects.sort((a,b)=>a.top-b.top)){const band=textBands.find(item=>rect.top<item.bottom-0.5&&rect.bottom>item.top+0.5);if(band){band.top=Math.min(band.top,rect.top);band.bottom=Math.max(band.bottom,rect.bottom);band.lineHeight=Math.max(band.lineHeight,rect.lineHeight)}else textBands.push({top:rect.top,bottom:rect.bottom,lineHeight:rect.lineHeight})}
        const lineHeight=parseFloat(s.lineHeight)||parseFloat(s.fontSize)*1.2
        const textContentHeight=textBands.reduce((sum,band)=>sum+Math.max(band.bottom-band.top,band.lineHeight),0)
        const iconBoxes=[...node.querySelectorAll('svg,img,[data-icon]')].filter(icon=>{const iconStyle=getComputedStyle(icon),box=icon.getBoundingClientRect();return iconStyle.display!=='none'&&iconStyle.visibility!=='hidden'&&box.width>0&&box.height>0}).map(icon=>{const box=icon.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height}})
        const iconContentHeight=iconBoxes.reduce((height,box)=>Math.max(height,box.height),0)
        const contentHeight=textBands.length?textContentHeight:iconContentHeight>0?iconContentHeight:lineHeight
        const paddingTop=parseFloat(s.paddingTop),paddingBottom=parseFloat(s.paddingBottom),borderTop=parseFloat(s.borderTopWidth),borderBottom=parseFloat(s.borderBottomWidth)
        const requiredBorderBoxHeight=contentHeight+paddingTop+paddingBottom+borderTop+borderBottom
        const contentBox={top:r.top+borderTop+paddingTop,bottom:r.bottom-borderBottom-paddingBottom,height:r.height-borderTop-borderBottom-paddingTop-paddingBottom}
        // Glyph boxes can deliberately enter a control's padding (for example a
        // 16px icon in a 24px hit target). The containment boundary is the
        // control's inner border, not its text content box.
        const iconFit=iconBoxes.length>0&&iconBoxes.every(box=>box.top>=r.top+borderTop-0.5&&box.bottom<=r.bottom-borderBottom+0.5&&box.left>=r.left+parseFloat(s.borderLeftWidth)-0.5&&box.right<=r.right-parseFloat(s.borderRightWidth)+0.5)
        const contentFitApplicable=node.matches('button,a,[role="button"],input:not([type="hidden"])')&&(textBands.length>0||iconBoxes.length>0||node instanceof HTMLInputElement)
        const inlineTextLinkException=node.tagName==='A'&&Boolean(node.closest('p,.aui-md-p'))&&s.display==='inline'
        let hidden=s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0||Boolean(node.closest('[inert]'))
        for(let ancestor=node.parentElement;ancestor&&ancestor instanceof HTMLElement;ancestor=ancestor.parentElement){const a=getComputedStyle(ancestor),box=ancestor.getBoundingClientRect();if(a.display==='none'||a.visibility==='hidden'||Number(a.opacity)===0)hidden=true;const overflowX=/hidden|clip|auto|scroll/.test(a.overflowX),overflowY=/hidden|clip|auto|scroll/.test(a.overflowY),before={...visible};if(overflowX){visible.left=Math.max(visible.left,box.left);visible.right=Math.min(visible.right,box.right)}if(overflowY){visible.top=Math.max(visible.top,box.top);visible.bottom=Math.min(visible.bottom,box.bottom)}const reduced=visible.left>before.left||visible.right<before.right||visible.top>before.top||visible.bottom<before.bottom;if(reduced){if(/auto|scroll/.test(`${a.overflowX} ${a.overflowY}`))scrollClipped=true;else if(/hidden|clip/.test(`${a.overflowX} ${a.overflowY}`))hardClipped=true}}
        const width=Math.max(0,visible.right-visible.left),height=Math.max(0,visible.bottom-visible.top),visibleFraction=r.width>0&&r.height>0?width*height/(r.width*r.height):0
        if(!width||!height)hidden=true
        const codeScroller=node.matches('.cm-content')?node.closest('.cm-scroller'):null
        const codeScrollerStyle=codeScroller?getComputedStyle(codeScroller):null
        const codeScrollerRect=codeScroller?.getBoundingClientRect()
        const codeScrollerVisible=codeScrollerRect?{left:Math.max(0,codeScrollerRect.left),top:Math.max(0,codeScrollerRect.top),right:Math.min(innerWidth,codeScrollerRect.right),bottom:Math.min(innerHeight,codeScrollerRect.bottom)}:null
        if(codeScroller&&codeScrollerVisible){for(let ancestor=codeScroller.parentElement;ancestor&&ancestor instanceof HTMLElement;ancestor=ancestor.parentElement){const a=getComputedStyle(ancestor),box=ancestor.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(a.overflowX)){codeScrollerVisible.left=Math.max(codeScrollerVisible.left,box.left);codeScrollerVisible.right=Math.min(codeScrollerVisible.right,box.right)}if(/hidden|clip|auto|scroll/.test(a.overflowY)){codeScrollerVisible.top=Math.max(codeScrollerVisible.top,box.top);codeScrollerVisible.bottom=Math.min(codeScrollerVisible.bottom,box.bottom)}}}
        const codeScrollerFits=Boolean(codeScrollerRect&&codeScrollerVisible&&codeScrollerRect.left>=codeScrollerVisible.left-0.5&&codeScrollerRect.right<=codeScrollerVisible.right+0.5&&codeScrollerRect.top>=codeScrollerVisible.top-0.5&&codeScrollerRect.bottom<=codeScrollerVisible.bottom+0.5)
        const codeScrollerIndex=codeScroller?[...document.querySelectorAll('.cm-scroller')].indexOf(codeScroller):-1
        const localCodeScroll=Boolean(codeScroller&&node.closest('.cm-editor')&&codeScrollerIndex===codeScrollProbe?.scrollerIndex&&codeScrollerStyle&&/auto|scroll/.test(codeScrollerStyle.overflowX)&&codeScroller.scrollWidth>codeScroller.clientWidth&&codeScrollerFits&&document.documentElement.scrollWidth<=innerWidth)
        const editorScrollProbe=editorScrollProbes?.find(probe=>probe.index===[...document.querySelectorAll('.milkdown .ProseMirror[contenteditable="true"], .cm-content[contenteditable="true"]')].indexOf(node))
        const editorScrollStyle=getComputedStyle(node)
        const localEditorScroll=Boolean(node.matches('[contenteditable="true"]')&&(node.closest('.milkdown')||node.matches('.cm-content'))&&editorScrollProbe?.status==='pass'&&/auto|scroll/.test(editorScrollStyle.overflowY)&&node.scrollHeight>node.clientHeight&&visibleFraction>=0.999&&document.documentElement.scrollWidth<=innerWidth)
        const horizontalTextClipped=textRects.some(box=>box.left<visible.left-0.5||box.right>visible.right+0.5)
        const horizontalNonCodeTextClipped=textRects.some(box=>(box.left<visible.left-0.5||box.right>visible.right+0.5)&&!box.insideCodeContent)
        const horizontalCodeTextClipped=textRects.filter(box=>box.insideCodeContent&&(box.left<visible.left-0.5||box.right>visible.right+0.5))
        const codeClippingReachable=!horizontalCodeTextClipped.length||(codeScrollProbe?.status==='pass'&&horizontalCodeTextClipped.every(box=>box.codeScrollerIndex===codeScrollProbe.scrollerIndex))
        const verticalTextClipped=textRects.some(box=>box.top<visible.top-0.5||box.bottom>visible.bottom+0.5)
        const horizontalIconClipped=iconBoxes.some(box=>box.left<visible.left-0.5||box.right>visible.right+0.5)
        const verticalIconClipped=iconBoxes.some(box=>box.top<visible.top-0.5||box.bottom>visible.bottom+0.5)
        const ownOverflowClip=/hidden|clip/.test(s.overflow)&&(node.scrollWidth>node.clientWidth||node.scrollHeight>node.clientHeight)
        const localCodeScrollException=localCodeScroll&&codeScrollProbe?.status==='pass'&&!verticalTextClipped&&!verticalIconClipped&&!horizontalIconClipped&&!ownOverflowClip
        const localEditorScrollException=localEditorScroll&&!horizontalNonCodeTextClipped&&codeClippingReachable&&!verticalIconClipped&&!horizontalIconClipped
        const contentClipped=(horizontalTextClipped&&!localCodeScrollException&&!localEditorScrollException)||(verticalTextClipped&&!localEditorScrollException)||horizontalIconClipped||verticalIconClipped||(ownOverflowClip&&!localEditorScrollException)
        const viewportClipped=visible.left>r.left||visible.right<r.right||visible.top>r.top||visible.bottom<r.bottom
        const scrollableViewport=viewportClipped&&(document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth)
        const exclusionReason=scrollClipped&&visibleFraction<0.5?'mostly outside a scrollable ancestor; scroll the row into view':scrollableViewport&&visibleFraction<0.5?'mostly outside the scrollable viewport':undefined
        if(exclusionReason)hidden=true
        const contentFits=!contentFitApplicable||(textBands.length?r.height+0.5>=requiredBorderBoxHeight:iconBoxes.length?iconFit:r.height+0.5>=requiredBorderBoxHeight)
        const codeScrollEvidence=localCodeScroll?{container:'.cm-scroller',scrollerIndex:codeScrollerIndex,scrollWidth:codeScroller.scrollWidth,clientWidth:codeScroller.clientWidth,scrollRangeCssPx:codeScroller.scrollWidth-codeScroller.clientWidth,overflowX:codeScrollerStyle.overflowX,scrollerFitsVisibleArea:codeScrollerFits,documentScrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,probe:codeScrollProbe,reason:'fenced code is contained by its own horizontally scrollable CodeMirror viewport; the final glyph is reachable at the local scroll end and the page itself does not scroll horizontally'}:null
        return {tag:node.tagName,type:node.getAttribute('type'),label:node.getAttribute('aria-label')||node.textContent?.trim().slice(0,40)||'',width,height,originalWidth:r.width,originalHeight:r.height,visibleFraction,visibleRect:visible,role:node.getAttribute('data-appearance-target'),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,overflow:s.overflow,disabled:node.matches(':disabled,[aria-disabled="true"]'),ariaHidden:Boolean(node.closest('[aria-hidden="true"]')),hidden,exclusionReason,scrollClipped,hardClipped,contentClipped,localCodeScroll:localCodeScrollException,localEditorScroll:localEditorScrollException,editorScrollEvidence:localEditorScroll?editorScrollProbe:null,codeScrollEvidence,visibleTextBoxes:textRects,tabIndex:node.tabIndex,position:s.position,clipPath:s.clipPath,contentFitApplicable,contentFits,lineBoxCount:textBands.length,textLineHeights,contentTextHeightCssPx:textContentHeight,iconContentHeightCssPx:iconContentHeight,iconBoxes,iconFit,boxSizing:s.boxSizing,padding:{top:paddingTop,bottom:paddingBottom},border:{top:borderTop,bottom:borderBottom},contentBox,requiredBorderBoxHeightCssPx:requiredBorderBoxHeight,inlineTextLinkException}
      })
      const visibleForSpacing=interactiveTargets.filter(target=>!target.hidden&&target.width>0&&target.height>0&&!target.inlineTextLinkException)
      const targetSpacingOverlap=(target,other)=>{const center={x:target.visibleRect.left+target.width/2,y:target.visibleRect.top+target.height/2},otherSmall=other.width<24||other.height<24;if(otherSmall){const otherCenter={x:other.visibleRect.left+other.width/2,y:other.visibleRect.top+other.height/2};return Math.hypot(center.x-otherCenter.x,center.y-otherCenter.y)<24}return Math.hypot(Math.max(other.visibleRect.left-center.x,0,center.x-other.visibleRect.right),Math.max(other.visibleRect.top-center.y,0,center.y-other.visibleRect.bottom))<12}
      for(const target of visibleForSpacing){if(target.width>=24&&target.height>=24)continue;const neighbors=visibleForSpacing.filter(other=>other!==target&&!other.disabled&&targetSpacingOverlap(target,other));target.spacingException=!neighbors.length;target.exceptionNeighbors=neighbors.map(other=>other.label)}
      const excludedInteractiveTargets=interactiveTargets.filter(target=>target.hidden||target.inlineTextLinkException)
      const visibleInteractiveTargets=interactiveTargets.filter(target=>!target.hidden&&target.width>0&&target.height>0&&!target.inlineTextLinkException)
      return { tracked, recipes, colors, surfaces, controlBoundaries, spacingHierarchy, readingLayout, fixtureRoots, previews, textBlocks, interactiveTargets:visibleInteractiveTargets, excludedInteractiveTargets, bodyScrollWidth: document.body.scrollWidth, documentScrollWidth: document.documentElement.scrollWidth, visualViewport: { width: visualViewport?.width, height: visualViewport?.height, offsetTop: visualViewport?.offsetTop } }
    }, {codeScrollProbe:measurements.codeScrollProbe,editorScrollProbes:measurements.editorScrollProbes})

    let stable = false
    let firstSample
    for (let attempt = 1; attempt <= 3; attempt++) {
      const a = await collect()
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())))
      const b = await collect()
      firstSample ??= a
      const delta = a.tracked.length !== b.tracked.length ? Infinity : Math.max(0, ...b.tracked.flatMap((part, index) => {
        const previous = a.tracked[index]
        return previous?.anchorKey === part.anchorKey ? Object.keys(part.rect).map((key) => Math.abs(part.rect[key] - previous.rect[key])) : [Infinity]
      }))
      if (delta <= 0.25) {
        measurements.stability = { status: 'pass', attempts: attempt, maxEdgeDeltaCssPx: delta, samples: [a.tracked, b.tracked] }
        measurements.parts = b.tracked
        measurements.recipes = b.recipes
        measurements.colorPairs = b.colors
        measurements.surfaces = [...b.surfaces, { role:'canvas', material:'computed-story-backdrop', background:environment.document.storyBackdrop, backdropFilter:'none',filter:'none',opacity:'1',rect:{x:0,y:0,width:environment.viewport.width,height:environment.viewport.height} }]
        measurements.controlBoundaries=b.controlBoundaries
        measurements.spacingHierarchy=b.spacingHierarchy
        measurements.readingLayout=b.readingLayout
        measurements.fixtureRoots = b.fixtureRoots
        measurements.previews = b.previews
        measurements.textBlocks = b.textBlocks
        measurements.interactiveTargets = b.interactiveTargets
        measurements.excludedInteractiveTargets = b.excludedInteractiveTargets
        measurements.visualViewport = b.visualViewport
        measurements.documentScrollWidth = b.documentScrollWidth
        stable = true
        break
      }
    }
    if (!stable || !(measurements.parts?.length)) {
      measurements.stability = { status: 'not-measurable', attempts: 3, maxAllowedEdgeDeltaCssPx: 0.25, lastSample: firstSample?.tracked ?? [] }
      measurements.parts = firstSample?.tracked ?? []
      measurements.recipes = firstSample?.recipes ?? []
      measurements.colorPairs = firstSample?.colors ?? []
      measurements.surfaces = firstSample?.surfaces ?? []
      measurements.controlBoundaries = firstSample?.controlBoundaries ?? []
      measurements.spacingHierarchy = firstSample?.spacingHierarchy ?? {}
      measurements.readingLayout = firstSample?.readingLayout ?? null
      measurements.fixtureRoots = firstSample?.fixtureRoots ?? []
      measurements.previews = firstSample?.previews ?? []
      measurements.textBlocks = firstSample?.textBlocks ?? []
      measurements.interactiveTargets = firstSample?.interactiveTargets ?? []
      measurements.excludedInteractiveTargets = firstSample?.excludedInteractiveTargets ?? []
      limitations.push('Tracked geometry did not settle within 0.25 CSS px after three two-frame sample pairs.')
    }

    for (const surface of measurements.surfaces ?? []) {
      if (surface.role === 'canvas' && !surface.paintStack) {
        surface.resolvedBackground = surface.background
        surface.resolutionStatus = rgba(surface.background)?.alpha === 1 ? 'pass' : 'not-measurable'
        continue
      }
      const stack=surface.paintStack??[]
      const opaquePlaneIndex=stack.findIndex(layer=>rgba(layer.background)?.alpha===1)
      const unsafe = stack.some((layer,index) => layer.filter !== 'none' || layer.maskImage !== 'none' || (layer.backgroundImage !== 'none' && (opaquePlaneIndex<0||index<=opaquePlaneIndex)) || (layer.backdropFilter !== 'none' && (opaquePlaneIndex<0||index<opaquePlaneIndex)))
      let resolved = rgba(environment.document.storyBackdrop) ?? { mode: 'rgb', r: 1, g: 1, b: 1, alpha: 1 }
      const opacityGroups=[]
      for (const layer of [...stack].reverse()) {
        const parentBackground=resolved
        const paint = rgba(layer.background)
        if (paint) resolved = over(paint, resolved)
        opacityGroups.push({opacity:Number(layer.opacity),parentBackground})
      }
      for(const group of opacityGroups.reverse())if(group.opacity<1)resolved=over({...resolved,alpha:resolved.alpha*group.opacity},group.parentBackground)
      surface.resolvedBackground = cssRgb(resolved)
      surface.resolutionStatus = unsafe || resolved.alpha < 1 ? 'not-measurable' : 'pass'
      surface.effectFree = !unsafe
      surface.opaquePlane = opaquePlaneIndex>=0?{element:stack[opaquePlaneIndex].element,background:stack[opaquePlaneIndex].background}:null
    }
    measurements.controlBoundaries=(measurements.controlBoundaries??[]).map(boundary=>{
      const width=parseFloat(boundary.border.width)||0
      const adjacent=measurements.surfaces.find(surface=>surface.role===boundary.surfaceRole)?.resolvedBackground??boundary.adjacentBackground
      const border=rgba(boundary.border.color),background=rgba(adjacent)
      const ratio=width>0&&border&&background?contrastRatio(border,background):null
      return {...boundary,adjacentBackground:adjacent,contrastRatio:ratio,status:width>0?ratio===null?'not-measurable':ratio>=3?'pass':'fail':boundary.selected?'not-measurable':'not-applicable'}
    })

    if ((measurements.fixtureRoots?.includes('F02') || measurements.parts?.some(part => part.part === 'prose-track')) && measurements.recipes.some(recipe => recipe.recipe === 'prose' && recipe.text)) {
      try { measurements.reading = await measureReading(page) }
      catch (error) { measurements.reading = { result: 'not-measurable', reason: String(error).slice(0, 300) } }
    }

    // Resolve each required text pair through its actual computed paint stack.
    for (const pair of measurements.colorPairs) {
      if (pair.inactive||pair.hidden) {
        measurements.colorPairs[measurements.colorPairs.indexOf(pair)].contrast = { status: 'not-applicable', reason: pair.inactive?'inactive control exception explicitly classified; active/default states remain required':'text is hidden or has no rendered box in this viewport; visible state is measured separately' }
        continue
      }
      const foreground = rgba(pair.foreground)
      const opaquePlaneIndex=pair.opacityStack.findIndex(layer=>rgba(layer.backgroundColor)?.alpha===1)
      const effectsUnsupported=pair.maskImage!=='none'||pair.opacityStack.some((entry,index)=>entry.filter!=='none'||entry.maskImage!=='none'||entry.backgroundImage!=='none'&&(opaquePlaneIndex<0||index<=opaquePlaneIndex)||entry.backdropFilter!=='none'&&(opaquePlaneIndex<0||index<opaquePlaneIndex))
      if (!foreground || effectsUnsupported) {
        measurements.colorPairs[measurements.colorPairs.indexOf(pair)].contrast = { status: 'not-measurable', reason: 'computed paint cannot be reduced to a proven opaque sRGB backdrop (unresolved image, filter or mask above the nearest opaque plane)',opaquePlaneIndex }
        continue
      }
      const canvas=rgba(environment.document.storyBackdrop)
      if (!canvas || canvas.alpha < 1) {
        measurements.colorPairs[measurements.colorPairs.indexOf(pair)].contrast = { status: 'not-measurable', reason: 'no opaque backdrop was found' }
        continue
      }
      let background=canvas
      const groups=[]
      for(const layer of [...pair.opacityStack].reverse()) {
        const parentBackground=background
        const ownBackground=rgba(layer.backgroundColor)
        if(ownBackground)background=over(ownBackground,background)
        groups.push({opacity:Number(layer.opacity),parentBackground})
      }
      if(background.alpha<1) {
        measurements.colorPairs[measurements.colorPairs.indexOf(pair)].contrast={status:'not-measurable',reason:'background paint stack did not resolve to opaque sRGB'}
        continue
      }
      let resolvedForeground=over(foreground,background)
      let resolvedBackground=background
      for(const group of groups.reverse())if(group.opacity<1){resolvedForeground=over({...resolvedForeground,alpha:resolvedForeground.alpha*group.opacity},group.parentBackground);resolvedBackground=over({...resolvedBackground,alpha:resolvedBackground.alpha*group.opacity},group.parentBackground)}
      const ratio = contrastRatio(resolvedForeground, resolvedBackground)
      const threshold = /^(focus|boundary)$/.test(pair.foregroundRole ?? '') ? 3 : 4.5
      measurements.colorPairs[measurements.colorPairs.indexOf(pair)].contrast = { status: ratio >= threshold ? 'pass' : 'fail', threshold, ratio, resolvedForeground: cssRgb(resolvedForeground), resolvedBackground: cssRgb(resolvedBackground), opaquePlaneIndex, opaquePlane:opaquePlaneIndex>=0?pair.opacityStack[opaquePlaneIndex]:null, backdropEffectsBehindOpaquePlane:pair.opacityStack.flatMap((entry,index)=>entry.backdropFilter!=='none'&&opaquePlaneIndex>=0&&index>=opaquePlaneIndex?[{element:entry.element,effect:entry.backdropFilter}]:[]), opacityComposite:groups.some(group=>group.opacity<1)?groups.filter(group=>group.opacity<1).map(group=>({opacity:group.opacity,backdrop:cssRgb(group.parentBackground)})):null }
    }

    // Chromium's platform-font API distinguishes a requested family stack from the actual face.
    if (browserName === 'chromium') {
      try {
        const cdp = await context.newCDPSession(page)
        await cdp.send('DOM.enable')
        await cdp.send('CSS.enable')
        const documentNode = await cdp.send('DOM.getDocument')
        const inspect = async (selectors) => {
          for (const selector of selectors) {
            const result = await cdp.send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector })
            if (result.nodeId) {
              const evidence=await cdp.send('CSS.getPlatformFontsForNode', { nodeId: result.nodeId })
              if(evidence.fonts?.some(font=>font.glyphCount>0))return evidence
            }
          }
          return { fonts:[], status:'not-measurable' }
        }
        measurements.fonts.actualFaceEvidence = {
          prose:await inspect(['.aui-md-p','[data-appearance-part="prose-track"] p','[data-appearance-recipe="prose"]']),
          code:await inspect(['.cm-line','.cm-content','.aui-md pre[data-appearance-recipe="code"] code','[data-appearance-recipe="code"] code','code[data-appearance-recipe="code"]','pre code']),
        }
        const scriptNode=await cdp.send('Runtime.evaluate',{expression:`(() => { const node=[...document.querySelectorAll('.aui-md-p,[data-appearance-fixture] *')].find(element=>/[\\u4e00-\\u9fff]/u.test(element.textContent||'')); return node||null })()`,returnByValue:false})
        if(scriptNode.result.objectId){const requested=await cdp.send('DOM.requestNode',{objectId:scriptNode.result.objectId});measurements.fonts.actualFaceEvidence.cjk=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:requested.nodeId})}
      } catch (error) {
        measurements.fonts.actualFaceEvidence = { status: 'not-measurable', reason: String(error).slice(0, 300) }
      }
    } else {
      measurements.fonts.actualFaceEvidence = { status: 'not-measurable', reason: 'Playwright platform-font inspection is available only through Chromium CDP; use another supported browser inspector for this engine' }
    }
  } catch (error) {
    browserFailure = String(error?.stack ?? error).split('\n').slice(0, 4).join('\n')
  }
}

const paletteResults = [...resultById.values()]
let interactionEvidence = null
const interactionPaths=[resolve(reviewOutput, `${browserName}-interactions.json`),resolve(reviewOutput, 'interactions.json')]
for(const interactionPath of interactionPaths)try{interactionEvidence=JSON.parse(await readFile(resolve(ROOT,interactionPath),'utf8'));measurements.interactionSource=interactionPath;break}catch{}
if(!interactionEvidence)limitations.push('The real-settings interaction report is absent; ARC metamorphic evidence is therefore incomplete.')
const readEvidence = async (paths) => {
  for (const path of paths) try { return { path, data: JSON.parse(await readFile(resolve(ROOT, path), 'utf8')) } } catch {}
  return null
}
const continuityEvidence = await readEvidence([resolve(reviewOutput, `${browserName}-continuity.json`)])
const reflowEvidence = await readEvidence([resolve(reviewOutput, `${browserName}-reflow.json`)])
const portalEvidence = await readEvidence(['docs/plans/composable-appearance/evidence/sol-review.json'])
const runtimeEvidence = await readEvidence([resolve(reviewOutput, 'runtime.json')])
const compositionEvidence = await readEvidence([resolve(reviewOutput, `${browserName}-composition.json`)])
measurements.externalEvidence = {
  interactions: interactionEvidence ? measurements.interactionSource : null,
  continuity: continuityEvidence?.path ?? null,
  reflow: reflowEvidence?.path ?? null,
  portals: portalEvidence?.path ?? null,
  runtime: runtimeEvidence?.path ?? null,
  secondConsumer: compositionEvidence?.path ?? null,
}
for (const oracle of ORACLES) {
  if (oracle.id === 'COL-04') {
    const modeResults = paletteResults.filter((r) => r.id.startsWith('COL-04.emitted-colors.'))
    const status = !modeResults.length ? 'not-measurable' : modeResults.every((r) => r.status === 'pass') ? 'pass' : 'fail'
    resultById.set(oracle.id, basicResult(oracle, status, 'all concrete emitted colors across every palette mode are finite and in sRGB gamut', modeResults.map(({ id, status: result, observed }) => ({ id, status: result, invalidCount: observed?.invalid?.length })), { source: 'src/palettes.css parsed independently; culori@4.0.2' }))
    continue
  }
  if (oracle.id === 'COL-01') {
    const rows = [...resultById.values()].filter((r) => r.id.startsWith('COL-01.minimum.'))
    const missingPairs = measurements.colorPairs.filter((pair) => !pair.foregroundRole || !pair.backgroundRole)
    const live = measurements.colorPairs.map((pair) => {const registration=renderedRolePairRegistration(pair);return { id: pair.id, foregroundRole: pair.foregroundRole, backgroundRole: pair.backgroundRole, state: pair.state, candidateKind:pair.candidateKind,text:pair.text,status: pair.contrast?.status ?? 'not-measurable', ratio: pair.contrast?.ratio,registration }})
    const expectedPaletteCount = 8 * REQUIRED_PALETTE_PAIRS.length
    const paletteCoverage = rows.length === expectedPaletteCount
    const rowFailure = rows.some((r) => r.status === 'fail')
    const rowUnmeasured = !paletteCoverage || rows.some((r) => r.status !== 'pass')
    const liveFailure = live.some((r) => r.status === 'fail')
    const unregisteredRelationships=live.filter(pair=>pair.foregroundRole&&pair.backgroundRole&&!pair.registration.registered)
    const fixtureId=measurements.fixtureRoots?.[0]
    const requiredFixturePairs=REQUIRED_RENDERED_FIXTURE_PAIRS[fixtureId]??[]
    const measuredFixturePairs=new Set(live.filter(pair=>pair.status!=='not-applicable').map(pair=>`${pair.foregroundRole}/${pair.backgroundRole}`))
    const missingFixturePairs=requiredFixturePairs.filter(pair=>!measuredFixturePairs.has(pair))
    const requiredCandidates=REQUIRED_RENDERED_FIXTURE_CANDIDATES[fixtureId]??[]
    const missingFixtureCandidates=requiredCandidates.filter(expected=>!live.some(pair=>`${pair.foregroundRole}/${pair.backgroundRole}`===expected.pair&&pair.candidateKind===expected.kind&&pair.status!=='not-applicable'&&(!expected.requireText||pair.text?.trim())&&(!expected.textIncludes||pair.text?.includes(expected.textIncludes))))
    const missing = !paletteCoverage || live.length === 0 || missingPairs.length > 0 || unregisteredRelationships.length>0 || missingFixturePairs.length>0 || missingFixtureCandidates.length>0
    const status = rowFailure || liveFailure || unregisteredRelationships.length ? 'fail' : browserFailure || missing || live.some((r) => r.status === 'not-measurable') ? 'not-measurable' : rowUnmeasured ? 'not-measurable' : 'pass'
    resultById.set(oracle.id, basicResult(oracle, status, 'all registered pairs and supported interaction-state pairs are measured after resolved paint; each rendered semantic pair maps to the independent role manifest; fixture-specific placeholder, syntax, error, selected-row and loading text candidates are directly observed; minimum 4.5:1; Calm prose target 7:1', { fixtureId,visibilityProbes:measurements.visibilityProbes,requiredFixturePairs,measuredFixturePairs:[...measuredFixturePairs],missingFixturePairs,requiredCandidates,missingFixtureCandidates,palettePairCount: rows.length, expectedPalettePairCount: expectedPaletteCount, palettePairs: rows, renderedPairs: live,unregisteredRelationships }, { source: 'independent semantic-token alias and required-fixture-role registries, palette policy and actual DOM/pseudo-element paint pairs', missingRenderedCoverage: missing }))
    const proseRecipes=measurements.recipes.filter(recipe=>recipe.recipe==='prose'&&recipe.tag==='P'&&recipe.text)
    const targetPairs = live.filter((p) => p.foregroundRole === 'primary' && p.backgroundRole === 'assistant-reading' && p.status!=='not-applicable')
    const proseTargetStatus=!proseRecipes.length||!targetPairs.length?'not-measurable':targetPairs.some(pair=>pair.ratio<4.5)?'fail':targetPairs.every(pair=>pair.status==='pass'&&pair.ratio>=7)?'pass':targetPairs.some(pair=>pair.status==='not-measurable')?'not-measurable':'review'
    resultById.set('COL-01.prose-target', basicResult({ ...CHILD_ORACLES.find((r) => r.id === 'COL-01.prose-target'), version: '1.0', purpose: 'Primary conversation prose contrast target', fixture: 'F02', provenance: POLICY.id }, proseTargetStatus, 'actual primary prose on the assistant reading plane is >= 7:1; applicable text remains >=4.5:1', { proseRecipes, targetPairs }, { source: 'actual text-bearing prose recipe and resolved primary/assistant-reading paint pair' }))
    resultById.set('COL-01.minimum', basicResult({ ...CHILD_ORACLES.find((r) => r.id === 'COL-01.minimum'), version: '1.0', purpose: 'WCAG minimum text contrast', fixture: oracle.fixture, provenance: 'WCAG 2.2 1.4.3' }, status, 'each applicable readable pair >= 4.5:1', { palettePairs: rows.length, renderedPairs: live.length, failedPalettePairs: rows.filter((r) => r.status === 'fail').map((r) => r.id), failedRenderedPairs: live.filter((r) => r.status === 'fail') }, { source: 'actual role/state pairs and complete palette matrix' }))
    resultById.set('COL-01.product-minimum', basicResult({ ...CHILD_ORACLES.find((r) => r.id === 'COL-01.product-minimum'), version: '1.0', purpose: 'Theorem text role contrast contract', fixture: oracle.fixture, provenance: POLICY.id }, status, 'Theorem readable application text pairs >= 4.5:1', { palettePairs: rows.length, renderedPairs: live.length, failures: live.filter((r) => r.status === 'fail') }, { source: 'actual role/state pairs and complete palette matrix' }))
    continue
  }
  if (oracle.id === 'ENV-01') {
    const status = browserFailure ? 'not-measurable' : pageErrors.length ? 'fail' : measurements.stability?.status === 'pass' ? 'pass' : 'not-measurable'
    resultById.set(oracle.id, basicResult(oracle, status, 'recorded environment and tracked edge deltas <= 0.25 CSS px in two successive animation frames; retry three pairs', browserFailure ?? { ...environment, stability: measurements.stability }, { source: ORIGIN }))
    continue
  }
  if (oracle.id === 'ENV-02') {
    const expectedFilesPass = measurements.fonts?.expectedAssets?.length === FONT_ASSET_EVIDENCE.length && measurements.fonts.expectedAssets.every((asset) => asset.status === 'pass')
    const actual = measurements.fonts?.actualFaceEvidence
    const primaryFace = actual?.prose?.fonts?.some((font) => font.isCustomFont && font.glyphCount > 0 && /IBM Plex Sans/i.test(font.familyName ?? font.postScriptName ?? ''))
    const codeFace = actual?.code?.fonts?.some((font) => font.isCustomFont && font.glyphCount > 0 && /JetBrains Mono/i.test(font.familyName ?? font.postScriptName ?? ''))
    const primaryLoaded = measurements.fonts?.faces?.some((face) => /IBM Plex Sans/i.test(face.family) && face.style === 'normal' && /100\s+700/.test(face.weight))
    const codeLoaded = measurements.fonts?.faces?.some((face) => /JetBrains Mono/i.test(face.family) && face.style === 'normal' && /100\s+800/.test(face.weight))
    const enoughText = Boolean(measurements.recipes.some((recipe) => recipe.recipe === 'prose' && recipe.text) && measurements.recipes.some((recipe) => recipe.recipe === 'code' && recipe.text))
    const fixtureHasCode = measurements.fixtureRoots?.some((id)=>['F04','F05','F08'].includes(id)) && enoughText
    const status = browserFailure || !actual?.prose?.fonts ? 'not-measurable' : expectedFilesPass && primaryFace && primaryLoaded && (!fixtureHasCode || codeFace && codeLoaded) ? 'pass' : 'not-measurable'
    resultById.set(oracle.id, basicResult(oracle, status, 'pinned assets and variable weight/style face declarations, plus actual Latin primary face use and actual code face when this fixture contains representative code', { ...measurements.fonts, actualRepresentativeTextFaces:{prose:actual?.prose,code:actual?.code},faceCoverage:{primaryFaceDeclared:primaryLoaded,codeFaceDeclared:codeLoaded},enoughRepresentativeText:enoughText,fixtureHasCode }, { source: 'font asset SHA-256, CSS FontFace declarations and Chromium CSS.getPlatformFontsForNode; face use is established by actual glyph counts, not computed family alone', expectedAssets: FONT_ASSET_EVIDENCE }))
    continue
  }
  if (oracle.id === 'ENV-03') {
    const status = pageErrors.length ? 'fail' : browserFailure || measurements.parts.length === 0 || measurements.recipes.length === 0 || measurements.colorPairs.length === 0 ? 'not-measurable' : 'pass'
    resultById.set(oracle.id, basicResult(oracle, status, 'policy expectations remain independent from rendered observations; runtime errors are an explicit failure', { policySource: POLICY.id, componentObservations: measurements.parts.length, renderedPairs: measurements.colorPairs.length, paletteModeChecks: paletteResults.length,pageErrors }, { source: 'versioned local policy registry + browser DOM evidence' }))
    continue
  }
  if (oracle.id === 'TYP-01') {
    const recipeAudit = auditRecipes(measurements.recipes, environment)
    measurements.recipeAudit = recipeAudit.observations
    resultById.set(oracle.id, basicResult(oracle, recipeAudit.status, 'every authored recipe is measured on an actual text-bearing element and matches independent size/line-height/weight/tracking policy; family is verified separately in ENV-02', recipeAudit.observations, { source: 'computed styles on actual recipe elements, including transcript paragraphs and editor content' }))
    continue
  }
  if (oracle.id === 'TYP-02') {
    const prose = measurements.recipes.find((r) => r.recipe === 'prose' && r.tag === 'P' && r.text)
    const editor = measurements.recipes.find((r) => r.recipe === 'composer.content' && r.contentEditable && r.text)
    const status = !prose || !editor ? 'not-measurable' : Math.abs(prose.fontSize - editor.fontSize) <= 0.1 && Math.abs(prose.lineHeight - editor.lineHeight) <= 0.1 && prose.fontWeight === editor.fontWeight && prose.fontFamily === editor.fontFamily && Math.abs(prose.letterSpacing - editor.letterSpacing) <= 0.05 ? 'pass' : 'fail'
    resultById.set(oracle.id, basicResult(oracle, status, 'prose/editor size and line-height deltas <= 0.1px; equal weight/family and tracking delta <= 0.05px', { prose: prose ?? null, editor: editor ?? null }, { source: 'actual text-bearing DOM anchors; editor container is not substituted for editor text' }))
    continue
  }
  if (oracle.id === 'TYP-03') {
    const recipeAudit = auditRecipes(measurements.recipes, environment)
    const density = interactionEvidence?.checks?.find((check) => check.name === 'compact density: typography isolation')
    const observedRoles = recipeAudit.observations.filter((item) => item.result !== 'not-measurable')
    const requiredRoleCoverage = ['prose', 'composer.content', 'ui.label', 'metadata', 'code']
    const missingRoles = requiredRoleCoverage.filter((role) => !observedRoles.some((item) => item.role === role))
    const scaleFailures = observedRoles.filter((item) => item.result === 'fail')
    const status = scaleFailures.length || density?.pass === false ? 'fail' : missingRoles.length || !density ? 'not-measurable' : density.pass ? 'pass' : 'not-measurable'
    resultById.set(oracle.id, basicResult(oracle, status, 'computed content/UI/code recipes follow root preference and their independent alpha; changing density preserves full prose/editor recipes and does not compensate browser zoom', { rootFontSizePx: environment.rootFontSizePx, scales: environment.appState?.scales, roleMeasurements: observedRoles, missingRoles, densityInvariant: density ?? null }, { source: 'independent actual text recipe values plus real compact-density settings comparison', densityEvidence: measurements.interactionSource }))
    continue
  }
  if (oracle.id === 'TYP-04') {
    const reading = measurements.reading
    const readingMode = environment.appState?.reading === 'wide' ? 'wide' : 'comfortable'
    const actual = reading?.actual
    const preferred = reading?.profiles?.[readingMode]
    const available = actual?.trackWidth >= preferred?.preferredPxAt16 * ((environment.appState?.scales?.content ?? 1))
    const result = !corpusValid || !preferred || !actual || preferred.result === 'not-measurable' ? 'not-measurable' : preferred.result === 'review' || available && (actual.median < (readingMode === 'wide' ? 85 : 65) || actual.median > (readingMode === 'wide' ? 110 : 90) || actual.p90 > (readingMode === 'wide' ? 125 : 105)) ? 'review' : 'pass'
    resultById.set(oracle.id, basicResult(oracle, result, 'fixed Latin corpus calibration from unwrapped glyph advances; >=20 full lines; Comfortable median 65-90/P90<=105 or Wide median 85-110/P90<=125 when track capacity permits', { readingMode, corpusSha256: reading?.corpusSha256 ?? LATIN_PROSE_V1_ACTUAL_SHA256, selectedProfile: preferred, actualTrack: actual, availableForPreferredWidth: available }, { source: 'scripts/design-oracles/measure-reading.mjs uses Range rectangles + Intl.Segmenter; actual transcript track measured separately' }))
    continue
  }
  if (oracle.id === 'TYP-05') {
    const preview = measurements.previews?.[0]
    const pairs = measurements.colorPairs.filter((pair) => pair.foregroundRole === 'primary' && pair.backgroundRole === 'user-message' && pair.contrast?.status)
    const hasExpansion = measurements.interactiveTargets?.some((target) => /show (more|less)|expand/i.test(target.label))
    if (measurements.fixtureRoots?.includes('F03') && page) {
      const expand = page.getByRole('button', { name: /show more|expand/i }).first()
      if (await expand.count()) {
        await expand.click().catch(() => undefined)
        // Base UI keeps its panel mounted while the opening height transition
        // runs. Wait for the real panel to settle before reading expanded text;
        // an immediate two-frame sample can capture the first 1px of motion.
        await page.waitForFunction(() => {
          const panel = document.querySelector('[data-slot="collapsible-panel"][data-open]')
          if (!(panel instanceof HTMLElement)) return false
          const rect = panel.getBoundingClientRect()
          const style = getComputedStyle(panel)
          const target = parseFloat(style.getPropertyValue('--collapsible-panel-height'))
          return Number.isFinite(target) && Math.abs(rect.height - target) <= 0.5
        }, null, { timeout: 2500 }).catch(() => undefined)
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        measurements.previewExpansion = { controlVisible: true, expandedContent: await page.locator('[data-slot="aui_user-message-root"]').first().innerText().catch(() => ''), expandedState: await expand.getAttribute('aria-expanded').catch(() => null) }
      } else measurements.previewExpansion = { controlVisible: false }
    }
    const opaque = preview && Number(preview.opacity) === 1 && preview.maskImage === 'none' && preview.ancestorEffects.every((effect) => Number(effect.opacity) === 1 && effect.maskImage === 'none')
    const expansion = measurements.previewExpansion?.expandedContent?.length > (preview?.text?.length ?? Infinity) && measurements.previewExpansion?.controlVisible
    const contrastEvidence = pairs.length > 0 && pairs.every((pair) => pair.contrast.status === 'pass')
    const status = pairs.some((pair)=>pair.contrast?.status==='fail')||preview&&!opaque?'fail':!preview||!hasExpansion||!contrastEvidence||!expansion?'not-measurable':'pass'
    resultById.set(oracle.id, basicResult(oracle, status, 'visible preview is opaque and readable after paint effects; visible expansion control reveals the original full message', { preview, effectFree: opaque, expansion: measurements.previewExpansion, contrastPairs: pairs }, { source: 'real ChatCollapsibleMessage in fixture F03; user action via Playwright' }))
    continue
  }
  if (oracle.id === 'TYP-07') {
    const sizeCheck=interactionEvidence?.checks?.find((check)=>/200% text/.test(check.name))
    const zoomTextCheck=reflowEvidence?.data?.checks?.find((check)=>check.name==='independent 200% root text enlargement preserves prose and draft')
    const externalSpacingCheck=reflowEvidence?.data?.checks?.find((check)=>check.name==='specified spacing override at 320px preserves content')
    const reachableCheck=reflowEvidence?.data?.checks?.find((check)=>check.name==='zoomed editor remains keyboard operable')
    let resilience=null
    if(page&&measurements.fixtureRoots?.includes('F09')) {
      resilience=await page.evaluate(async()=>{
        const before=[...document.querySelectorAll('.aui-md-p,[data-appearance-part="editor-viewport"]')].map(node=>node.textContent)
        const css=document.createElement('style');css.dataset.oracleSpacing='user';css.textContent=':where(.aui-md-p,[data-appearance-part="editor-viewport"] *,[data-appearance-recipe]){line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} .aui-md-p{margin-block-end:2em!important}';document.head.append(css)
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
        const text=[...document.querySelectorAll('.aui-md-p,[data-appearance-part="editor-viewport"]')]
        const styleChecks=text.map(node=>{const s=getComputedStyle(node),size=parseFloat(s.fontSize);return {tag:node.tagName,lineHeight:parseFloat(s.lineHeight),fontSize:size,letterSpacing:parseFloat(s.letterSpacing),wordSpacing:parseFloat(s.wordSpacing),lineHeightPass:parseFloat(s.lineHeight)>=1.5*size-0.1,letterSpacingPass:parseFloat(s.letterSpacing)>=0.12*size-0.05,wordSpacingPass:parseFloat(s.wordSpacing)>=0.16*size-0.05,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight,text:node.textContent}})
        const after=[...document.querySelectorAll('.aui-md-p,[data-appearance-part="editor-viewport"]')].map(node=>node.textContent)
        const clipped=styleChecks.filter(x=>x.scrollHeight>x.clientHeight&&getComputedStyle(document.querySelector('.aui-md-p')??document.body).overflowY==='hidden')
        return {before,after,contentPreserved:JSON.stringify(before)===JSON.stringify(after),styleChecks,allSpacingApplied:styleChecks.length>0&&styleChecks.every(x=>x.lineHeightPass&&x.letterSpacingPass&&x.wordSpacingPass),clipped,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth}
      })
    }
    const externalChecks=[zoomTextCheck,externalSpacingCheck,reachableCheck]
    const status=!resilience||!sizeCheck||externalChecks.some((check)=>!check)?'not-measurable':externalChecks.some((check)=>!check.pass)||!sizeCheck.pass?'fail':!resilience.contentPreserved||!resilience.allSpacingApplied||resilience.clipped.length?'fail':resilience.scrollWidth>resilience.viewport?'review':'pass'
    resultById.set(oracle.id,basicResult(oracle,status,'200% text enlargement plus simultaneous line-height 1.5, paragraph gap 2em, tracking .12em and word spacing .16em preserve content/functionality; separate 200% and 320px checks remain usable',{ui200Percent:sizeCheck??null,spacingOverride:resilience,independentReflowChecks:externalChecks},{source:'real Settings control report plus browser reflow report and independent CSS spacing stress on actual prose/editor nodes',reflowEvidence:reflowEvidence?.path??null}))
    continue
  }
  if (oracle.id === 'COL-06') {
    const messages = measurements.parts.filter((part) => part.part === 'user-message' && part.rect.width > 0 && part.rect.height > 0)
    const canvasArea = environment.viewport.width * environment.viewport.height
    const diagnostics = messages.map((message) => {
      const color = srgbToOklch(message.style.backgroundColor)
      const canvas = srgbToOklch(measurements.surfaces?.find((surface) => surface.role === 'canvas')?.background ?? 'transparent')
      const a=srgbToOklab(message.style.backgroundColor),b=srgbToOklab(measurements.surfaces?.find((surface) => surface.role === 'canvas')?.background ?? 'transparent')
      return { element: message.id ?? message.part, areaFraction: (message.rect.width * message.rect.height) / canvasArea, background: message.style.backgroundColor, lightness: color?.l, chroma: color?.c, canvasLightness: canvas?.l, deltaEOK: a&&b ? Math.hypot(a.l-b.l,a.a-b.a,a.b-b.b) : null }
    })
    resultById.set(oracle.id, basicResult(oracle, diagnostics.length&&diagnostics.every((item)=>item.deltaEOK!==null) ? 'pass' : 'not-measurable', 'diagnostic only: report measured user-message area, lightness difference, chroma and Delta E OK', diagnostics, { source: 'actual rendered user-message box and computed story backdrop; no salience threshold' }))
    continue
  }
  if (oracle.id === 'TYP-06') {
    const blocks = measurements.textBlocks ?? []
    const paragraphGaps = blocks.slice(0,-1).flatMap((block,index)=>block.tag==='p'&&blocks[index+1]?.tag==='p'?[{from:block.text.slice(0,40),to:blocks[index+1].text.slice(0,40),gap:blocks[index+1].top-block.bottom}]:[])
    const prose = measurements.recipes.find((recipe) => recipe.recipe === 'prose')
    const expectedParagraphGap = (prose?.lineHeight ?? 0) * 0.75
    const expectedSectionGap=(prose?.lineHeight??0)*1.5
    const deviations = paragraphGaps.filter((item) => Number.isFinite(item.gap) && Math.abs(item.gap - expectedParagraphGap) > 0.25)
    const headings=blocks.flatMap((block,index)=>/^h[1-6]$/.test(block.tag)&&index>0&&index<blocks.length-1?[{tag:block.tag,text:block.text.slice(0,60),before:Math.max(0,block.top-blocks[index-1].bottom),after:Math.max(0,blocks[index+1].top-block.bottom),beforeMargin:block.marginBlockStart,afterMargin:block.marginBlockEnd}]:[])
    const sectionGaps=headings.map(item=>({tag:item.tag,text:item.text,gap:item.before,expected:expectedSectionGap}))
    const sectionDeviations=sectionGaps.filter(item=>Math.abs(item.gap-item.expected)>0.25)
    const badHeadings=headings.filter(item=>item.after>item.before+0.25)
    const status = !prose || !paragraphGaps.length || !sectionGaps.length ? 'not-measurable' : deviations.length || sectionDeviations.length || badHeadings.length ? 'review' : 'pass'
    resultById.set(oracle.id, basicResult(oracle, status, 'paragraph block gap = 0.75 × actual prose line height; section gap before heading = 1.5 × actual prose line height; heading gap after <= gap before', { actualProseLineHeight:prose?.lineHeight??null,expectedParagraphGap, actualParagraphGaps: paragraphGaps, paragraphDeviations:deviations,expectedSectionGap,sectionGaps,sectionDeviations,headingsAndNeighbors: headings,badHeadingAssociation: badHeadings }, { source: 'actual rendered adjacent block rectangles and computed text recipes; paragraphs/sections after margin collapse; headings compared only when neighboring content is present' }))
    continue
  }
  if (oracle.id === 'COL-02') {
    const rolePairs = measurements.colorPairs.filter((pair) => ['focus', 'boundary'].includes(pair.foregroundRole))
    const boundaries=(measurements.controlBoundaries??[]).filter(item=>['composer','editor-viewport'].includes(item.part)&&parseFloat(item.border.width)>0)
    const selectedRows=(measurements.controlBoundaries??[]).filter(item=>item.part==='navigation-row'&&item.selected)
    const required=[...rolePairs.map(pair=>({kind:'semantic-pair',id:pair.id,status:pair.contrast?.status,ratio:pair.contrast?.ratio,foreground:pair.foreground,background:pair.contrast?.resolvedBackground})),...boundaries.map(item=>({kind:'component-boundary',part:item.part,id:item.id,status:item.status,ratio:item.contrastRatio,border:item.border,adjacent:item.adjacentBackground})),...selectedRows.map(item=>({kind:'selected-row',part:item.part,id:item.id,status:item.status,ratio:item.contrastRatio,background:item.background,adjacent:item.adjacentBackground}))]
    const failures = required.filter((pair) => pair.status === 'fail')
    const status = !required.length ? 'not-measurable' : failures.length ? 'fail' : required.some((pair) => !['pass','not-applicable'].includes(pair.status)) ? 'not-measurable' : 'pass'
    resultById.set(oracle.id, basicResult(oracle, status, 'essential non-text identifying features >= 3:1 against the relevant adjacent paint; measured composer/editor boundaries and selected navigation rows are included; decorative separators excluded', { requiredPairs: required, measuredBoundaries:measurements.controlBoundaries, failureCount: failures.length }, { source: 'actual computed border paints on semantic composer/editor parts and selected navigation rows, plus explicit semantic foreground/background role pairs' }))
    continue
  }
  if (oracle.id === 'COL-03') {
    const translucent = (measurements.colorPairs ?? []).filter((pair) => pair.contrast?.status === 'not-measurable' || pair.backdropFilter !== 'none' || pair.maskImage !== 'none')
    const readingSurfaces = (measurements.surfaces ?? []).filter((surface) => ['assistant-reading', 'canvas', 'composer'].includes(surface.role))
    const opaqueReading = readingSurfaces.length > 0 && readingSurfaces.every((surface) => surface.resolutionStatus === 'pass' && rgba(surface.resolvedBackground)?.alpha === 1)
    const status = !readingSurfaces.length ? 'not-measurable' : opaqueReading ? 'pass' : 'not-measurable'
    resultById.set(oracle.id, basicResult(oracle, status, 'actual reading plane is opaque or every permitted final material output is bounded; finite samples do not prove arbitrary backdrops', { readingSurfaces, unresolvedPaintPairs: translucent }, { source: 'resolved computed style for semantic reading surfaces' }))
    continue
  }
  if (oracle.id === 'COL-05') {
    const surfaces = measurements.surfaces ?? []
    const byRole = Object.fromEntries(surfaces.map((surface) => [surface.role, surface]))
    const observed = Object.fromEntries(['canvas','navigation','composer','user-message','assistant-reading'].map((role) => [role, byRole[role] ?? null]))
    const neutral = Object.entries(observed).map(([role,surface]) => ({ role, paint: surface?.resolvedBackground??surface?.background, authoredPaint:surface?.background, material:surface?.material, resolutionStatus:surface?.resolutionStatus, oklch: surface?.resolvedBackground||surface?.background ? srgbToOklch(surface.resolvedBackground??surface.background) : null }))
    const mode=environment.appState?.mode==='dark'?'dark':'light'
    const values=Object.fromEntries(neutral.map((item)=>[item.role,item.oklch]))
    const failures=[]
    if(values.canvas && mode==='light' && values.canvas.l<0.999) failures.push('light canvas is not opaque white')
    if(values.canvas && mode==='dark' && (values.canvas.l<0.18||values.canvas.l>0.24)) failures.push('dark canvas L_OK outside 0.18–0.24')
    for(const role of ['canvas','navigation','composer','assistant-reading']) if(values[role] && values[role].c>0.02) failures.push(`${role} neutral chroma above 0.02`)
    if(values.navigation&&values.canvas) { const d=mode==='light'?values.canvas.l-values.navigation.l:values.navigation.l-values.canvas.l; if(d<0||d>0.04) failures.push('navigation signed lightness edge outside 0–0.04') }
    if(values.composer&&values.canvas&&mode==='dark') { const d=values.composer.l-values.canvas.l; if(d<0.015||d>0.06) failures.push('dark composer signed lightness edge outside 0.015–0.06') }
    if(values['user-message']&&values.canvas&&(Math.abs(values['user-message'].l-values.canvas.l)>0.06||values['user-message'].c>0.03)) failures.push('user-message surface exceeds lightness/chroma target')
    const checked=['canvas','navigation','composer','user-message','assistant-reading'].filter(role=>values[role]).length
    const unresolved=neutral.filter(item=>values[item.role]).some(item=>item.resolutionStatus==='not-measurable')
    const status=environment.appState?.preset!=='calm'?'not-applicable':checked<2||unresolved?'not-measurable':failures.length?'review':'pass'
    measurements.calmSurfaceCheck={status,failures,mode,values,materialAssignments:environment.appState?.materials}
    resultById.set(oracle.id, basicResult(oracle, status, 'Calm opaque canvas, neutral chroma and signed mode-specific surface edges meet theorem-appearance-v1 policy ranges', measurements.calmSurfaceCheck, { source: 'computed paints on actual semantic surface-role elements plus story backdrop' }))
    continue
  }
  if (oracle.id === 'SPC-01') {
    const density = environment.appState?.density ?? 'comfortable'
    const profiles = { compact: { within:4,related:6,group:12,padding:8,editorToolbar:6 },comfortable:{within:4,related:8,group:16,padding:12,editorToolbar:8},touch:{within:8,related:12,group:24,padding:12,editorToolbar:8} }
    const expected = profiles[density]
    const expectedByRole = { 'within-controls':expected.within, 'within-control':expected.within, 'related-controls':expected.related, 'related-control':expected.related, 'group-gap':expected.group, 'composer-padding':expected.padding, 'composer-editor-toolbar-gap':expected.editorToolbar }
    const measured = [
      ...measurements.parts.filter((part) => part.spacingRole).map((part) => ({ role:part.spacingRole, measured: ['composer-padding'].includes(part.spacingRole) ? parseFloat(part.style.padding) : ['composer-editor-toolbar-gap'].includes(part.spacingRole) ? parseFloat(part.style.rowGap ?? part.style.gap) : parseFloat(part.style.gap), expected:expectedByRole[part.spacingRole], part:part.part })),
      ...Object.entries(measurements.spacingHierarchy??{}).filter(([,item])=>item).map(([role,item])=>({role,measured:item.value,expected:expectedByRole[role],part:item.evidence.selector,evidence:item.evidence})),
    ]
    const comparable=measured.filter((item)=>Number.isFinite(item.measured)&&Number.isFinite(item.expected))
    const deviations=comparable.filter((item)=>Math.abs(item.measured-item.expected)>PREDICATE_TOLERANCES.authoredSpacingPx)
    const groupRoles=new Set(comparable.map((item)=>item.role))
    const hierarchy=['within-controls','related-controls','group-gap'].every((role)=>groupRoles.has(role))
    const values=Object.fromEntries(comparable.map((item)=>[item.role,item.measured]))
    const hierarchyPass=!hierarchy||values['within-controls']<values['related-controls']&&values['related-controls']<values['group-gap']
    const status=!comparable.length||!hierarchy?'not-measurable':deviations.length?'fail':!hierarchyPass?'review':'pass'
    resultById.set(oracle.id, basicResult(oracle, status, 'authored spacing matches selected density tokens within 0.25px; declared within < related < group hierarchy', { density, expectedTokens:expected, observed:measured, deviations, hierarchyMeasured:hierarchy, hierarchyPass }, { source: 'semantic spacing hooks and computed gaps/padding' }))
    continue
  }
  if (oracle.id === 'SPC-02') {
    const targets = measurements.interactiveTargets ?? []
    const hiddenInputExceptions=targets.filter(target=>target.tag==='INPUT'&&target.tabIndex<0&&(target.width<=2||target.height<=2)).map(target=>({...target,exception:'noninteractive visually-hidden input; visible associated control owns the hit region'}))
    const isHiddenException=target=>target.tag==='INPUT'&&target.tabIndex<0&&(target.width<=2||target.height<=2)
    const applicableTargets=targets.filter(target=>!target.disabled&&!isHiddenException(target)&&!target.inlineTextLinkException)
    const tooSmall = applicableTargets.filter((target) => (target.width < 24 || target.height < 24)&&!target.spacingException)
    const clipped = applicableTargets.filter((target) => target.contentClipped)
    const contentFitFailures=applicableTargets.filter(target=>target.contentFitApplicable&&!target.contentFits)
    const status = !applicableTargets.length ? 'not-measurable' : clipped.length||tooSmall.length||contentFitFailures.length ? 'fail' : 'pass'
    resultById.set(oracle.id, basicResult(oracle, status, 'actual visible clickable targets meet 24x24 CSS px or the 24px spacing exception; controls contain measured visible in-flow text or icon boxes, padding and borders; inline prose links are recorded as the text-spacing exception; clipped/off-viewport DOM and disabled/hidden input exceptions are excluded explicitly; fenced code and height-limited editors may scroll only within their reachable local viewport while essential composer actions remain visible', { targetCount:applicableTargets.length, tooSmall, contentFitFailures, codeScrollProbe:measurements.codeScrollProbe, editorScrollProbes:measurements.editorScrollProbes, localCodeScrollExceptions:applicableTargets.filter(target=>target.localCodeScroll).map(target=>({label:target.label,evidence:target.codeScrollEvidence})), localEditorScrollExceptions:applicableTargets.filter(target=>target.localEditorScroll).map(target=>({label:target.label,evidence:target.editorScrollEvidence})), excludedTargets:(measurements.excludedInteractiveTargets??[]).map(({label,width,height,exclusionReason,inlineTextLinkException})=>({label,width,height,reason:exclusionReason??(inlineTextLinkException?'inline prose link text spacing exception':'not visible')})), spacingExceptions:applicableTargets.filter(target=>target.spacingException).map(({label,width,height,exceptionNeighbors})=>({label,width,height,exceptionNeighbors})), clipped, hiddenInputExceptions }, { source: 'actual visible-area hit rectangles after viewport/overflow clipping; visible flow text-node line bands and rendered icon boxes plus computed padding/border fit; geometric neighbor-distance test; local editor exceptions require scroll-to-end glyph visibility and visible essential actions' }))
    continue
  }
  if (oracle.id === 'SPC-03') {
    const prose = measurements.parts.find((part) => part.part === 'prose-track')
    const editor = measurements.parts.find((part) => part.part === 'editor-track')
    const start = (part) => environment.direction === 'rtl' ? part.rect.right : part.rect.left
    const inlineStartDelta = prose && editor ? Math.abs(start(prose) - start(editor)) : null
    const widthDelta = prose && editor ? Math.abs(prose.rect.width - editor.rect.width) : null
    const status = !prose || !editor ? 'not-measurable' : inlineStartDelta > 1 || widthDelta > 1 ? 'fail' : 'pass'
    resultById.set(oracle.id, basicResult(oracle, status, 'logical inline-start and shared prose/editor track width differ by at most 1 CSS px', { prose:prose?.rect, editor:editor?.rect, direction:environment.direction, inlineStartDeltaCssPx:inlineStartDelta, widthDeltaCssPx:widthDelta }, { source: 'actual prose track and editor track border boxes' }))
    continue
  }
  if (oracle.id === 'SPC-04') {
    const terms = (measurements.parts ?? []).filter((part) => part.widthRole)
    const allOf = (role) => terms.filter((term) => term.widthRole === role && !term.overlay && term.rect.width > 0).filter((term,index,all)=>!all.slice(0,index).some(previous=>previous.rect.x===term.rect.x&&previous.rect.width===term.rect.width))
    const of = (role) => allOf(role)[0]
    const usable = of('usable'), main = of('main'), rail = of('rail'), navigation = of('navigation'), inspectors = allOf('inspector')
    const inspectorWidth=inspectors.reduce((sum,term)=>sum+term.rect.width,0)
    const sashes = terms.filter((term) => term.widthRole === 'sash').reduce((sum, term) => sum + term.rect.width, 0)
    const frame = measurements.parts.find((part) => part.part === 'sheet-frame')
    const frameMargin = frame ? (parseFloat(frame.style.marginInline) || 0) : 0
    const direction=measurements.parts.find(part=>part.part==='shell')?.style.direction??environment.direction
    const occupied=[...allOf('rail'),...allOf('navigation'),...allOf('main'),...inspectors]
    const ordered=occupied.sort((a,b)=>direction==='rtl'?b.rect.right-a.rect.right:a.rect.left-b.rect.left)
    const gapSegments=[]
    if(usable&&ordered.length){
      if(direction==='rtl'){
        gapSegments.push({from:'shell-inline-start',to:ordered[0].widthRole,px:usable.rect.right-ordered[0].rect.right})
        for(let i=0;i<ordered.length-1;i++)gapSegments.push({from:ordered[i].widthRole,to:ordered[i+1].widthRole,px:ordered[i].rect.left-ordered[i+1].rect.right})
        gapSegments.push({from:ordered.at(-1).widthRole,to:'shell-inline-end',px:ordered.at(-1).rect.left-usable.rect.left})
      }else{
        gapSegments.push({from:'shell-inline-start',to:ordered[0].widthRole,px:ordered[0].rect.left-usable.rect.left})
        for(let i=0;i<ordered.length-1;i++)gapSegments.push({from:ordered[i].widthRole,to:ordered[i+1].widthRole,px:ordered[i+1].rect.left-ordered[i].rect.right})
        gapSegments.push({from:ordered.at(-1).widthRole,to:'shell-inline-end',px:usable.rect.right-ordered.at(-1).rect.right})
      }
    }
    const overlapSegments=gapSegments.filter(segment=>segment.px<-1)
    const gap=gapSegments.reduce((sum,segment)=>sum+Math.max(0,segment.px),0)
    const usableWidth=usable?Math.max(0,usable.clientWidth-parseFloat(usable.style.paddingLeft||'0')-parseFloat(usable.style.paddingRight||'0')):null
    const expectedMain = usable && main ? usableWidth - allOf('rail').reduce((sum,item)=>sum+item.rect.width,0) - allOf('navigation').reduce((sum,item)=>sum+item.rect.width,0) - inspectorWidth - gap : null
    const residual = expectedMain !== null ? Math.abs(expectedMain - main.rect.width) : null
    const conversation=measurements.parts.find(part=>part.part==='conversation-track'),prose=measurements.parts.find(part=>part.part==='prose-track'),editor=measurements.parts.find(part=>part.part==='editor-track'),avatar=measurements.parts.find(part=>part.part==='avatar-gutter'),composer=measurements.parts.find(part=>part.part==='composer')
    const readingLayout=measurements.readingLayout
    const availableReading=readingLayout?.availableReadingWidth??null
    const profile=measurements.reading?.profiles?.[environment.appState?.reading==='wide'?'wide':'comfortable']
    const preferredReading=profile?.preferredPxAt16?profile.preferredPxAt16*environment.rootFontSizePx/16:null
    const expectedReading=preferredReading!==null&&availableReading!==null?Math.min(preferredReading,availableReading):null
    const readingResidual=expectedReading!==null&&prose?Math.abs(expectedReading-prose.rect.width):null
    const centerResidual=prose&&main?Math.abs((prose.rect.left+prose.rect.right)/2-(main.rect.left+main.rect.right)/2):null
    const editorResidual=editor&&prose?Math.abs(editor.rect.width-prose.rect.width):null
    const calibratedTokenResidual=preferredReading!==null&&readingLayout?.proseMeasureCssPx!==null&&readingLayout?.proseMeasureCssPx!==undefined?Math.abs(preferredReading-readingLayout.proseMeasureCssPx):null
    const minMain=35*environment.rootFontSizePx
    const optionalColumnsBelowThreshold=Boolean(main&&main.rect.width<minMain&&(allOf('navigation').some(item=>item.rect.width>0)||inspectors.length))
    const readingApplicable=Boolean(main&&readingLayout&&prose)
    const trackSideMismatch=readingLayout?.expectedTrackSidePx!==null&&readingLayout?.expectedTrackSidePx!==undefined&&readingLayout.trackSidePx!==null?Math.abs(readingLayout.expectedTrackSidePx-readingLayout.trackSidePx):null
    const status = !usable || !main ? 'not-measurable' : overlapSegments.length||residual > 1||optionalColumnsBelowThreshold||readingApplicable&&(readingResidual===null||readingResidual>1||centerResidual>1||editorResidual!==null&&editorResidual>1||trackSideMismatch!==null&&trackSideMismatch>0.5||calibratedTokenResidual!==null&&calibratedTokenResidual>1) ? 'fail' : readingApplicable ? 'pass' : 'not-measurable'
    resultById.set(oracle.id, basicResult(oracle, status, 'main width equals usable content width less each occupied non-overlay rail, navigation, inspector group and measured gap; available reading width uses actual thread viewport client width, computed page padding and max(avatar allocation, composer inset), each counted once; prose is min(independent calibrated preferred width, available), centered within main within 1px; optional columns are removed below 35rem', { terms: { shellUsableBorderBox:usable?.rect.width??null,shellUsableClientWidth:usable?.clientWidth??null,usablePaddingInline:usable?{left:usable.style.paddingLeft,right:usable.style.paddingRight}:null,usableContentInline:usableWidth,frameRect:frame?.rect??null,frameMargin,rail:allOf('rail').map(item=>item.rect.width),navigation:allOf('navigation').map(item=>item.rect.width),inspectors:inspectors.map(item=>item.rect.width),inspectorTotal:inspectorWidth,sashes,borderBoxGaps:gapSegments,gapTotal:gap,measuredMain:main?.rect.width??null,conversationTrack:conversation?.rect??null,readingViewport:readingLayout?.viewportRect??null,readingViewportClientWidth:readingLayout?.viewportClientWidth??null,readingViewportUsableInline:readingLayout?.viewportUsableInline??null,pagePaddingPx:readingLayout?.pagePaddingPx??null,avatarAllocationPx:readingLayout?.avatarWidthPx??null,composerInsetPx:readingLayout?.composerInsetPx??null,composerExpansionPaddingAndBorder:readingLayout?.composer??null,trackSidePx:readingLayout?.trackSidePx??null,expectedTrackSidePx:readingLayout?.expectedTrackSidePx??null,availableReadingWidth:availableReading,preferredReadingWidth:preferredReading,cssPreferredReadingWidth:readingLayout?.proseMeasureCssPx??null,calibratedTokenResidualCssPx:calibratedTokenResidual,expectedReadingWidth:expectedReading,measuredReadingWidth:prose?.rect.width??null,readingResidualCssPx:readingResidual,centeringResidualCssPx:centerResidual,editorWidthResidualCssPx:editorResidual,expandedTrack:(measurements.parts.find(part=>['artifact','code-track','expanded-track'].includes(part.part))?.rect??null),responsiveThresholdCssPx:minMain,optionalColumnsBelowThreshold }, expectedMain, residualCssPx:residual,overlapSegments }, { source: 'actual client content width and measured semantic border boxes; computed CSS variables are resolved through a hidden browser probe and checked against independently measured reading calibration' }))
    continue
  }
  if (oracle.id === 'SPC-05') {
    const composer=measurements.parts.find((part)=>part.part==='composer'), editor=measurements.parts.find((part)=>part.part==='editor-viewport'), toolbar=measurements.parts.find((part)=>part.part==='composer-actions')
    const number=(value)=>parseFloat(value)||0
    const partsHeight = composer&&editor&&toolbar ? number(composer.style.borderTopWidth)+number(composer.style.borderBottomWidth)+number(composer.style.padding.split(' ')[0])+number(composer.style.padding.split(' ')[2]??composer.style.padding.split(' ')[0])+editor.rect.height+toolbar.rect.height : null
    const gap = composer&&editor&&toolbar ? Math.max(0,toolbar.rect.top-editor.rect.bottom,editor.rect.top-toolbar.rect.bottom) : 0
    const expected=partsHeight===null?null:partsHeight+gap
    const residual=composer&&expected!==null?Math.abs(composer.rect.height-expected):null
    const status=!composer||!editor||!toolbar?'not-measurable':residual>1?'fail':'pass'
    resultById.set(oracle.id,basicResult(oracle,status,'resting composer border+padding+editor line box+editor/toolbar gap+toolbar row matches measured border box within 1px',{composer:composer?.rect,editor:editor?.rect,toolbar:toolbar?.rect,expectedHeight:expected,residualCssPx:residual},{source:'actual composer, text editor and action-row boxes'}))
    continue
  }
  if (oracle.id === 'SPC-06') {
    const radii=measurements.parts.filter((part)=>part.radiusRole).map((part)=>({part:part.part,role:part.radiusRole,computed:part.style.borderRadius}))
    const allowed={composer:12,'user-message':12,artifact:12,field:8,control:6,'navigation-row':6,rail:0}
    const evaluated=radii.map(item=>{const pieces=item.computed.split(/[\s/]+/).filter(Boolean).map(parseFloat),max=Math.max(...pieces),box=measurements.parts.find(part=>part.part===item.part)?.rect;const expected=allowed[item.role];const normalizedPill=item.role==='pill'||item.role==='circle';const pass=normalizedPill?box&&max>=Math.min(box.width,box.height)/2-1:Number.isFinite(expected)&&pieces.every(value=>Math.abs(value-expected)<=0.1);return {...item,expected:normalizedPill?'normalized to box geometry':expected,result:pass?'pass':Number.isFinite(expected)||normalizedPill?'fail':'not-measurable'}})
    const status=!evaluated.length?'not-measurable':evaluated.some(item=>item.result==='fail')?'fail':evaluated.some(item=>item.result==='not-measurable')?'not-measurable':'pass'
    resultById.set(oracle.id,basicResult(oracle,status,'declared role radii use the policy set or explicit pill/circle; CSS-normalized pill geometry is accounted for',evaluated,{source:'actual computed border radii and rendered box geometry'}))
    continue
  }
  if (oracle.id === 'SPC-07') {
    const width=environment.viewport.width
    const ordinaryPageNoOverflow=measurements.documentScrollWidth<=width
    const actions=measurements.parts.find((part)=>part.part==='composer-actions')
    const reflow=width===320&&ordinaryPageNoOverflow?'pass':width===320?'fail':'not-measurable'
    const keyboardObserved=measurements.visualViewport&&measurements.visualViewport.height<environment.viewport.height-100
    const interaction=!keyboardObserved?'not-measurable':actions&&actions.rect.bottom<=measurements.visualViewport.height?'pass':'fail'
    const zoomReflow=reflowEvidence?.data?.checks?.find((check)=>check.name==='actual 400% page zoom reflows to 320 CSS px')
    const status=reflow==='fail'||interaction==='fail'||zoomReflow?.pass===false?'fail':interaction==='not-measurable'||!zoomReflow?'not-measurable':'pass'
    measurements.reflowCheck={status:reflow,viewportWidth:width,documentScrollWidth:measurements.documentScrollWidth,actual400PercentZoom:zoomReflow??null}
    measurements.keyboardReachability={status:interaction,actions:actions?.rect,visualViewport:measurements.visualViewport}
    resultById.set(oracle.id,basicResult(oracle,status,'at 320 CSS px preserve ordinary content without horizontal page scroll; separately verify editor and actions with touch keyboard',{reflow:measurements.reflowCheck,keyboard:measurements.keyboardReachability},{source:'actual narrow browser viewport; keyboard child is N/A only when a real visual-viewport resize is observed'}))
    continue
  }
  if(oracle.id==='COL-07') {
    const fixture=measurements.fixtureRoots?.[0]
    measurements.focusEvidence=['F05','F08','F10'].includes(fixture)?page?await measureKeyboardFocus(page):{standard:'not-measurable',focusAppearance:'not-measurable',reason:browserFailure??'browser page unavailable'}:{standard:'not-applicable',focusAppearance:'not-applicable',reason:`Focus paint sampled on unmodified designated fixture F05/F08/F10; ${fixture??'no fixture'} is outside this probe set.`}
    const {standard,focusAppearance}=measurements.focusEvidence
    const status=[standard,focusAppearance].includes('fail')?'fail':[standard,focusAppearance].includes('not-measurable')?'not-measurable':'pass'
    resultById.set(oracle.id,basicResult(oracle,status,'keyboard-visible focus indicator is actually painted; measured outline pixels meet WCAG state and adjacent contrast, with qualifying pixels covering the complete 4×perimeter reference area',measurements.focusEvidence,{source:'independent focused/unfocused screenshot pixel comparison and visible focus target checks'}))
    continue
  }
  if (['ARC-01','ARC-02','ARC-03','ARC-04'].includes(oracle.id)) {
    const checks=interactionEvidence?.checks??[]
    const relevant=checks.filter((check)=>{
      if(oracle.id==='ARC-01')return /palette|dark mode|draft and mounted editor|typography isolation|geometry isolation|hit-region isolation/.test(check.name)
      if(oracle.id==='ARC-02')return /composer:|navigation material isolation|draft and mounted editor|hit-region isolation/.test(check.name)
      if(oracle.id==='ARC-03')return /compact density:|ambience on:|ambience off:/.test(check.name)
      return /draft and mounted editor|editor and draft continuity/.test(check.name)
    })
    const ambient=oracle.id==='ARC-03'?relevant.filter(check=>/ambience (on|off):/.test(check.name)):[]
    const density=oracle.id==='ARC-03'?relevant.filter(check=>/compact density:/.test(check.name)):[]
    const status=!relevant.length?'not-measurable':oracle.id==='ARC-03'&&(ambient.length<6||density.length<2)?'not-measurable':invariantCheckResult(relevant)
    resultById.set(oracle.id,basicResult(oracle,status,'all specified invariant state and geometry checks pass under the actual settings controls',{checks:relevant,uncovered:oracle.id==='ARC-01'?['hit-region deltas','active run identity/capabilities']:oracle.id==='ARC-02'?['hit-region deltas']:oracle.id==='ARC-03'?['ambient visibility/motion isolation']:['attachment/upload identity','active run identity and command semantics','logical selection offsets','IME composition','focus counterpart','logical scroll anchor'],runner:'review-interactions.mjs'},{source:measurements.interactionSource,note:'a passing subset does not imply the full group passes'}))
    continue
  }
  if (oracle.id === 'ARC-05') {
    const validation=validatePortalEvidence(portalEvidence?.data)
    resultById.set(oracle.id,basicResult(oracle,validation.status,'all 30 engine × portal-kind × appearance-state cases are present exactly once and each records theme, typography, contrast, portal, density and material predicates',validation,{source:portalEvidence?.path??'no independent portal report'}))
    continue
  }
  if (oracle.id === 'ARC-06') {
    const roundTrip=continuityEvidence?.data?.checks?.find((check)=>check.name==='versioned document round trip through settings')
    const reload=continuityEvidence?.data?.checks?.find((check)=>check.name==='reloaded renderer preserves imported settings')
    const reset=continuityEvidence?.data?.checks?.find((check)=>check.name==='explicit reset clears overrides')
    const rejection=interactionEvidence?.checks?.find((check)=>check.name==='Unknown theme fields rejected')
    const migration=continuityEvidence?.data?.checks?.find((check)=>check.name==='legacy preferences migrate in the real renderer')
    const composition=compositionEvidence?.data?.checks??[]
    const secondConsumer=composition.length>=4&&composition.every(check=>check.pass===true)
    const observed={versionedRoundTrip:roundTrip??null,reload:reload??null,rejection:rejection??null,reset:reset??null,migration:migration??null,secondComposition:{checks:composition,pass:secondConsumer}}
    const required=[roundTrip,reload,reset,rejection,migration]
    const children=['ARC-06.versioned-data','ARC-06.schema-rejection','ARC-06.second-consumer']
    const status=required.some((check)=>check?.pass===false)||composition.some(check=>check.pass===false)?'fail':required.every((check)=>check?.pass===true)&&secondConsumer?'pass':'not-measurable'
    resultById.set(oracle.id,basicResult(oracle,status,'versioned settings round-trip, reload, reset, legacy migration, unknown-field rejection and second consumer reuse are independently observed',observed,{source:`${continuityEvidence?.path??'missing continuity evidence'}; ${measurements.interactionSource??'missing interaction evidence'}; ${compositionEvidence?.path??'missing composition evidence'}`,uncovered:status==='pass'?[]:children.filter(id=>resultById.get(id)?.result!=='pass')}))
    continue
  }
  const rootSelector = measurements.fixtureRoots?.length ? measurements.fixtureRoots : []
  resultById.set(oracle.id, basicResult(oracle, 'not-measurable', oracle.purpose, browserFailure ?? { fixtureRoots: rootSelector, trackedParts: measurements.parts.map((item) => item.part), recipes: measurements.recipes.map((item) => item.recipe) }, { source: 'independent observation required', note: 'No implemented predicate produced this result; presence of hooks alone never passes an oracle.' }))
}

for (const child of CHILD_ORACLES) {
  if (resultById.has(child.id)) continue
  const parentId = child.parent
  const parent = resultById.get(parentId)
  let status='not-measurable', observed='child-specific evidence not collected', source='child predicate measured independently'
  if(child.id==='COL-01.large-text-exception') {status='not-applicable';observed={reason:'Theorem v1 requires 4.5:1 for all readable text and does not invoke the WCAG large-text exception.'};source='theorem-appearance-v1 policy'}
  if(child.id==='COL-02.identifying-controls') {const pairs=parent?.observed?.requiredPairs??[];status=pairs.length&&pairs.every(pair=>['pass','not-applicable'].includes(pair.status))?'pass':pairs.some(pair=>pair.status==='fail')?'fail':'not-measurable';observed={pairs};source='measured composer/editor boundary and selected-row paints against actual adjacent semantic surface'}
  if(child.id==='COL-02.decorative-separators') {status='not-applicable';observed={reason:'Decorative separators are excluded unless an element is explicitly identified as a necessary control boundary; no separator pair is inferred from a line color alone.'};source='semantic boundary roles distinguish decorative separators'}
  if(child.id==='COL-03.opaque-plane') {const surfaces=measurements.surfaces?.filter(surface=>['assistant-reading','canvas'].includes(surface.role))??[];const valid=surfaces.length&&surfaces.every(surface=>surface.resolutionStatus==='pass'&&rgba(surface.resolvedBackground)?.alpha===1);status=valid?'pass':'not-measurable';observed={surfaces};source='actual composed paint stacks through an opaque story/canvas backdrop; filters/group opacity are unresolved'}
  if(child.id==='COL-03.background-envelope') {const complex=measurements.surfaces?.some(surface=>surface.backdropFilter!=='none'||surface.material==='glass'||surface.material==='liquid');const readable=(measurements.colorPairs??[]).filter(pair=>!pair.hidden&&!pair.inactive);const resolved=readable.length>0&&readable.every(pair=>Number.isFinite(pair.contrast?.ratio)&&rgba(pair.contrast?.resolvedBackground)?.alpha===1&&pair.contrast?.opaquePlaneIndex>=0);status=!complex?'not-applicable':resolved?'not-applicable':'not-measurable';observed={reason:!complex?'No complex material appears in the fixture.':resolved?'Every applicable visible text pair resolved against an actual opaque plane; decorative backdrop effects behind those planes cannot affect text contrast.':'A visible text pair remains unresolved behind a complex material.',complexMaterial:complex,readablePairCount:readable.length,opaqueResolvedPairCount:readable.filter(pair=>Number.isFinite(pair.contrast?.ratio)&&rgba(pair.contrast?.resolvedBackground)?.alpha===1&&pair.contrast?.opaquePlaneIndex>=0).length,unresolved:readable.filter(pair=>!Number.isFinite(pair.contrast?.ratio)||rgba(pair.contrast?.resolvedBackground)?.alpha!==1).map(pair=>({foregroundRole:pair.foregroundRole,backgroundRole:pair.backgroundRole,contrast:pair.contrast}))};source='actual rendered readable-pair resolution and nearest opaque plane; decorative effects are excluded only when behind that plane'}
  if(child.id==='COL-05.required-flat') {const materials=environment.appState?.materials??{};const expected=['canvas','navigation','composer','user-message','assistant-reading'];const explicit=new Set(Object.keys(environment.appState?.overrides?.materials??{}));const required=expected.filter(role=>!explicit.has(role));const measuredSurfaces=(measurements.surfaces??[]).filter(surface=>required.includes(surface.role));const measuredRoles=[...new Set(measuredSurfaces.map(surface=>surface.role))];const incomplete=required.some(role=>!materials[role]);const nonFlat=required.filter(role=>materials[role]&&materials[role]!=='flat');const nonOpaque=measuredSurfaces.filter(surface=>surface.resolutionStatus!=='pass');const missingSurfaceRoles=required.filter(role=>!measuredRoles.includes(role));status=environment.appState?.preset!=='calm'?'not-applicable':nonFlat.length||nonOpaque.length?'fail':!measurements.surfaces?.length||incomplete||missingSurfaceRoles.length?'not-measurable':explicit.size?'not-measurable':'pass';observed={materials,explicitUserOverrides:[...explicit],requiredRoles:required,measuredRoles,missingSurfaceRoles,incompleteRoles:required.filter(role=>!materials[role]),nonFlat,nonOpaque};source='actual material settings plus per-role composed surface opacity; explicit user overrides are excluded from default-Calm requirements'}
  if(child.id==='COL-05.lightness-hierarchy') {status=measurements.calmSurfaceCheck?.status??'not-measurable';observed=measurements.calmSurfaceCheck??'surface roles not measured';source='signed OKLCH edge values from actual surfaces'}
  if(child.id==='SPC-01.token-consumption') {const p=parent?.observed;status=p?.observed?.length&&p.deviations?.length===0?'pass':p?.deviations?.length?'fail':'not-measurable';observed=p??'spacing-role measurements unavailable';source='authored spacing-role hook compared with independent selected-density vocabulary'}
  if(child.id==='SPC-01.group-hierarchy') {const p=parent?.observed;status=p?.hierarchyMeasured?(p.hierarchyPass?'pass':'review'):'not-measurable';observed={hierarchyMeasured:p?.hierarchyMeasured,hierarchyPass:p?.hierarchyPass,observed:p?.observed};source='effective gaps between named controls'}
  if(child.id==='SPC-02.content-fit') {const sizes=parent?.observed;status=!sizes?.targetCount?'not-measurable':sizes.clipped?.length||sizes.contentFitFailures?.length?'fail':'pass';observed={contentFitFailures:sizes?.contentFitFailures??[],clipped:sizes?.clipped??[],targetCount:sizes?.targetCount??0};source='actual target text Range line boxes plus computed padding/border and overflow/clipping measurements'}
  if(child.id==='SPC-02.target-size') {const sizes=parent?.observed;status=!sizes?.targetCount?'not-measurable':sizes.tooSmall?.length?'fail':'pass';observed=sizes?{targetCount:sizes.targetCount,tooSmall:sizes.tooSmall,spacingExceptions:sizes.spacingExceptions}:'actual target geometry not collected';source='actual visible-area hit rectangles and WCAG 2.5.8 24px spacing exception test'}
  if(child.id==='SPC-07.reflow') {const zoom=reflowEvidence?.data?.checks?.find(check=>check.name==='actual 400% page zoom reflows to 320 CSS px');const narrow=measurements.reflowCheck?.status;status=narrow==='fail'||zoom?.pass===false?'fail':narrow==='pass'||zoom?.pass===true?'pass':'not-measurable';observed={narrowViewport:measurements.reflowCheck??null,actual400PercentZoom:zoom??null};source='actual 320 CSS px viewport and Chrome browser zoom report'}
  if(child.id==='SPC-07.composer-interaction') {status=measurements.keyboardReachability?.status??'not-measurable';observed=measurements.keyboardReachability??'no real touch-keyboard visual viewport';source='visual viewport with keyboard open'}
  if(child.id==='ARC-04.document-state') {const checks=continuityEvidence?.data?.checks??[];const required=['palette: editor, document, logical selection and focus','composer material: editor, document, logical selection and focus','navigation material: editor, document, logical selection and focus','density: editor, document, logical selection and focus','content scale: editor, document, logical selection and focus','reading width: editor, document, logical selection and focus','composer layout: editor, document, logical selection and focus'];const relevant=checks.filter(check=>required.includes(check.name));const runtime=runtimeEvidence?.data?.checks??[];const runtimeRequired=runtime.filter(check=>/preserve the editor, draft, attachment and reference|same run streams a later chunk|follow-up sends one inbox command|stop sends one separate cancel command/.test(check.name));const all=relevant.length===required.length&&relevant.every(check=>check.pass)&&runtimeRequired.length>=4&&runtimeRequired.every(check=>check.passed);status=runtimeRequired.some(check=>!check.passed)||relevant.some(check=>!check.pass)?'fail':all?'pass':'not-measurable';observed={continuityChecks:relevant,runtimeChecks:runtimeRequired,uncovered:all?[]:['appearance-axis continuity or live runtime identity evidence']};source=`${continuityEvidence?.path??'missing continuity evidence'}; ${runtimeEvidence?.path??'missing runtime evidence'}`}
  if(child.id==='ARC-04.native-composition') {const check=continuityEvidence?.data?.checks?.find(item=>item.name==='CDP native composition survives appearance change');status=check?.pass===true?'pass':check?.pass===false?'fail':'not-measurable';observed=check??'trusted native IME path not available in this browser automation backend';source=continuityEvidence?.path??'missing Chromium CDP composition evidence'}
  if(child.id==='ARC-04.focus-and-anchor') {const checks=continuityEvidence?.data?.checks??[];const focus=checks.filter(check=>/logical selection and focus/.test(check.name));const anchor=portalEvidence?.data?.scrollAnchor;const anchorStable=anchor&&Math.abs(anchor.before.offset-anchor.after.offset)<=2;status=focus.length&&focus.every(check=>check.pass)&&anchorStable?'pass':focus.some(check=>!check.pass)||anchor&& !anchorStable?'fail':'not-measurable';observed={focusContinuity:focus,scrollAnchor:anchor??null,uncovered:['responsive focus handoff cross-engine',...(anchorStable?[]:['stable logical block anchor'])]};source=`${continuityEvidence?.path??'missing continuity evidence'}; ${portalEvidence?.path??'missing scroll-anchor evidence'}`}
  if(child.id==='ARC-01.palette-mode-isolation'||child.id==='ARC-02.material-isolation'||child.id==='ARC-03.density-isolation') {const checks=interactionEvidence?.checks??[];const regex=child.id==='ARC-01.palette-mode-isolation'?/palette:|dark mode:/:child.id==='ARC-02.material-isolation'?/(paper|glass|liquid|flat) composer:|navigation material isolation/:/compact density:/;const relevant=checks.filter(check=>regex.test(check.name)&&(/draft and mounted editor|typography isolation|geometry isolation|hit-region isolation|navigation material isolation/.test(check.name)));status=invariantCheckResult(relevant);observed={checks:relevant,limitation:'This child covers only the named appearance axis; it does not prove run/capability or attachment invariants.'};source=measurements.interactionSource??'missing interaction evidence'}
  if(child.id==='ARC-03.ambient-isolation') {const checks=interactionEvidence?.checks??[];const relevant=checks.filter(check=>/ambience (on|off):/.test(check.name));status=relevant.length<6?'not-measurable':invariantCheckResult(relevant);observed={checks:relevant};source=measurements.interactionSource??'missing ambient settings comparison'}
  if(child.id==='ARC-06.versioned-data') {const checks=continuityEvidence?.data?.checks??[];const names=['versioned document round trip through settings','reloaded renderer preserves imported settings','explicit reset clears overrides'];const relevant=checks.filter(check=>names.includes(check.name));status=relevant.length===names.length&&relevant.every(check=>check.pass===true)?'pass':relevant.some(check=>check.pass===false)?'fail':'not-measurable';observed={checks:relevant,uncovered:names.filter(name=>!relevant.some(check=>check.name===name))};source=continuityEvidence?.path??'missing continuity evidence'}
  if(child.id==='ARC-06.migration') {const check=continuityEvidence?.data?.checks?.find(item=>item.name==='legacy preferences migrate in the real renderer');status=check?.pass===true?'pass':check?.pass===false?'fail':'not-measurable';observed=check??'legacy renderer migration was not observed';source=continuityEvidence?.path??'missing continuity evidence'}
  if(child.id==='ARC-06.schema-rejection') {const check=interactionEvidence?.checks?.find(item=>item.name==='Unknown theme fields rejected');status=check?.pass===true?'pass':check?.pass===false?'fail':'not-measurable';observed=check??'actual settings import rejection not observed';source=measurements.interactionSource??'missing interaction evidence'}
  if(child.id==='ARC-06.second-consumer') {const checks=compositionEvidence?.data?.checks??[];status=checks.length===4&&checks.every(check=>check.pass===true)?'pass':checks.some(check=>check.pass===false)?'fail':'not-measurable';observed={checks};source=compositionEvidence?.path??'missing second-consumer report'}
  if(child.id==='COL-07.focus-standard') {status=measurements.focusEvidence?.standard??'not-measurable';observed=measurements.focusEvidence??'no keyboard focus evidence';source='keyboard Tab and computed visible indicator'}
  if(child.id==='COL-07.focus-appearance') {status=measurements.focusEvidence?.focusAppearance??'not-measurable';observed=measurements.focusEvidence??'no focus contrast/area evidence';source='focus ring width, area and contrast against adjacent paint'}
  if(child.id==='COL-07.non-color-meaning') {const checks=runtimeEvidence?.data?.checks??[];const relevant=checks.filter(check=>/non-color unread row cue|failed upload returns attachment|long translated running row/.test(check.name));status=relevant.length>=3&&relevant.every(check=>check.passed)?'pass':relevant.some(check=>!check.passed)?'fail':'not-measurable';observed={checks:relevant,uncovered:status==='pass'?[]:['actual status-cue fixture evidence']};source=runtimeEvidence?.path??'missing live-component runtime evidence'}
  resultById.set(child.id,basicResult({ ...child, version:'1.0', purpose:child.predicate, fixture:parent?.fixture??'see parent', provenance:POLICY.id },status,child.predicate,observed,{parent:parentId,source}))
}

const arcDocument=resultById.get('ARC-04.document-state'),arcFocus=resultById.get('ARC-04.focus-and-anchor'),arcNative=resultById.get('ARC-04.native-composition')
if(arcDocument&&arcFocus&&arcNative) {
  const status=[arcDocument.result,arcFocus.result,arcNative.result].includes('fail')?'fail':[arcDocument.result,arcFocus.result,arcNative.result].every(value=>value==='pass')?'pass':'not-measurable'
  const group=ORACLES.find(item=>item.id==='ARC-04')
  resultById.set('ARC-04',basicResult(group,status,'draft, attachment, run identity, logical editor selection, native composition, focus counterpart and logical scroll anchor survive the relevant appearance/layout changes',{documentState:arcDocument.result,focusAndAnchor:arcFocus.result,nativeComposition:arcNative.result,checks:{documentState:arcDocument.observed,focusAndAnchor:arcFocus.observed,nativeComposition:arcNative.observed}},{source:'continuity, controlled real-runtime stream/upload and logical scroll-anchor evidence'}))
}
const arcVersioned=resultById.get('ARC-06.versioned-data'),arcMigration=resultById.get('ARC-06.migration'),arcSchema=resultById.get('ARC-06.schema-rejection'),arcSecondConsumer=resultById.get('ARC-06.second-consumer')
if(arcVersioned&&arcMigration&&arcSchema&&arcSecondConsumer) {
  const statuses=[arcVersioned.result,arcMigration.result,arcSchema.result,arcSecondConsumer.result]
  const status=statuses.includes('fail')?'fail':statuses.every(value=>value==='pass')?'pass':'not-measurable'
  const group=ORACLES.find(item=>item.id==='ARC-06')
  resultById.set('ARC-06',basicResult(group,status,'versioned settings, migration, schema rejection and composition reuse each pass their separately classified child predicate',{children:Object.fromEntries([[arcVersioned.id,arcVersioned.result],[arcMigration.id,arcMigration.result],[arcSchema.id,arcSchema.result],[arcSecondConsumer.id,arcSecondConsumer.result]])},{source:'real renderer continuity, interaction schema rejection, and second consumer browser evidence'}))
}
const focusStandard=resultById.get('COL-07.focus-standard'),focusAppearance=resultById.get('COL-07.focus-appearance'),nonColorMeaning=resultById.get('COL-07.non-color-meaning')
if(focusStandard&&focusAppearance&&nonColorMeaning) {
  const childStatuses=[focusStandard.result,focusAppearance.result,nonColorMeaning.result]
  const status=childStatuses.includes('fail')?'fail':childStatuses.every(value=>value==='pass'||value==='not-applicable')?'pass':'not-measurable'
  resultById.set('COL-07',basicResult(ORACLES.find(item=>item.id==='COL-07'),status,'keyboard focus is visible, the qualifying indicator meets Theorem area/contrast, and meaningful states retain a non-color cue',{children:{standard:focusStandard.result,focusAppearance:focusAppearance.result,nonColorMeaning:nonColorMeaning.result},measurement:measurements.focusEvidence},{source:'actual keyboard focus paint and real unread/error/running state cues'}))
}

const measuredFixture = measurements.fixtureRoots?.[0]
const scopeApplies = (scope, fixtureId) => {
  if (scope === 'all' || scope === 'palette-matrix') return true
  if (!fixtureId) return true
  return String(scope).split(',').some((part) => {
    const range=part.match(/^(F\d{2})-(F\d{2})$/)
    if(range)return fixtureId>=range[1]&&fixtureId<=range[2]
    return part===fixtureId
  })
}
if(measuredFixture) {
  const records=new Map([...ORACLES,...CHILD_ORACLES].map(record=>[record.id,record]))
  for(const [id,result] of resultById) {
    const record=records.get(id)
    if(record&&!scopeApplies(record.fixture??ORACLES.find(item=>item.id===record.parent)?.fixture,measuredFixture)) {
      resultById.set(id,{...result,result:'not-applicable',observed:{reason:`${id} is outside this fixture's declared scope`,fixtureId:measuredFixture,declaredScope:record.fixture??ORACLES.find(item=>item.id===record.parent)?.fixture},evidence:{...result.evidence,applicability:'explicit fixture scope'}})
    }
  }
}

const fixtureResults = FIXTURES.map((fixture) => {
  const seen = measurements.fixtureRoots?.includes(fixture.id) ?? false
  const runtimeChecks=runtimeEvidence?.data?.checks??[]
  const continuityChecks=continuityEvidence?.data?.checks??[]
  const portalRows=portalEvidence?.data?.portals?.flatMap(report=>report.rows??[])??[]
  const externalEvidence={
    F05:[{path:runtimeEvidence?.path,checks:runtimeChecks.filter(check=>/F05\/F11 real Appearance controls/.test(check.name))},{path:portalEvidence?.path,cases:portalRows.length,coverage:'ARC-05 exact portal-state validation'}],
    F06:[{path:runtimeEvidence?.path,checks:runtimeChecks.filter(check=>/F06\//.test(check.name))}],
    F07:[{path:runtimeEvidence?.path,checks:runtimeChecks.filter(check=>/F07 /.test(check.name))}],
    F08:[{path:runtimeEvidence?.path,checks:runtimeChecks.filter(check=>/F08 /.test(check.name))}],
    F09:[{path:interactionEvidence?measurements.interactionSource:null,checks:(interactionEvidence?.checks??[]).filter(check=>/200%|density|reading width/.test(check.name))},{path:reflowEvidence?.path,checks:(reflowEvidence?.data?.checks??[]).filter(check=>/320|200%|zoom|spacing/.test(check.name))}],
    F10:[{path:reflowEvidence?.path,checks:(reflowEvidence?.data?.checks??[]).filter(check=>/RTL|CJK|320|keyboard/.test(check.name))}],
    F11:[{path:continuityEvidence?.path,checks:continuityChecks.filter(check=>/logical selection and focus|native composition|versioned document round trip|legacy preferences migrate/.test(check.name))},{path:runtimeEvidence?.path,checks:runtimeChecks.filter(check=>/F05\/F11|F06\/F11/.test(check.name))}],
  }[fixture.id]??[]
  const knownGaps={F03:['short response paired with short message in the same fixture story'],F04:['expanded OpenUI artifact state in this fixture story'],F05:['fixture-local reference/attachment/popover sequence (editor/reference/attachment continuity and portals are covered by linked independent browser checks)'],F06:['live stream sequence is covered separately by the real runtime browser report'],F07:['failure/retry/upload recovery is covered separately by real runtime browser checks; fixture itself is static'],F08:['unread/running/long-label transitions are covered separately by real runtime browser checks; fixture is a static navigation state'],F09:['fixture-local real settings interaction is covered by linked settings and reflow evidence'],F10:['physical keyboard and native touch keyboard are not available in browser automation; RTL, CJK, zoom and reflow have separate browser evidence'],F11:['mid-draft settings changes are covered separately by linked continuity and runtime browser checks']}[fixture.id]??[]
  return { id: fixture.id, name: fixture.name, result: seen ? 'review' : 'not-measurable', observed: seen ? { mounted:true, declaredRequirements:fixture.requirements, coverageScope:'this row reports only the named local story; supplemental evidence is linked separately and does not change the local fixture state', knownUnobservedStates:knownGaps, supplementalEvidence:externalEvidence.filter(item=>item.path&&(item.checks?.length||item.cases)) } : 'no fixture root identified on the measured page' }
})

// Every policy record is emitted even when the component or state is unavailable.
for (const oracle of ORACLES) if (!resultById.has(oracle.id)) resultById.set(oracle.id, basicResult(oracle, 'not-measurable', oracle.purpose, browserFailure ?? 'required independent observation has not been collected', { source: ORIGIN }))

const results = [...resultById.values()].map((item) => ({ ...item, result: normalizeStatus(item.status ?? item.result) }))
const report = {
  policy: POLICY,
  environment,
  corpus: { fixtureId: 'latin-prose-v1', sha256: LATIN_PROSE_V1_ACTUAL_SHA256, expectedSha256: LATIN_PROSE_V1_SHA256, valid: corpusValid, paragraphCount: 6, characters: LATIN_PROSE_V1.length, expectedFontAssets: FONT_ASSET_EVIDENCE },
  coverage: { groups: ORACLES.length, childPredicates: CHILD_ORACLES.length, fixtures: FIXTURES.length, matrix: EXECUTION_MATRIX, requestedMatrixRun: runAllViewports, browserFailure: browserFailure ?? null },
  fixtures: fixtureResults,
  observations: measurements,
  results,
  limitations: [...new Set([...(browserFailure ? [`Browser run did not complete: ${browserFailure}`] : []), 'Only selected viewport/browser run was executed; full cross-engine, viewport, zoom, text enlargement, touch keyboard, RTL and state-continuity matrix requires separate executions.', 'The report does not claim full WCAG conformance or a subjective aesthetic score.', ...limitations])],
}
await mkdir(OUTPUT, { recursive: true })
const stateSlug = `${presetArg}-${modeArg}`
await writeFile(resolve(OUTPUT, `report-${browserName}-${stateSlug}-${widthArg}-${routeSlug}.json`), `${JSON.stringify(report, null, 2)}\n`)
await writeFile(resolve(OUTPUT, `report-${browserName}-${stateSlug}-${widthArg}-${routeSlug}.md`), `${humanReport(report)}\n`)
console.log(humanReport(report))
await browser?.close()
const blocking = results.some((item) => item.result === 'fail' || item.result === 'not-measurable' && ['Contract', 'Standard', 'Standard+Contract', 'Contract+Standard'].includes(item.class))
process.exitCode = blocking ? 1 : 0
