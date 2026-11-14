// chrome.tabs.setZoom drives actual browser page zoom, including CSS viewport
// and DPR changes. A pinch-scale emulation would not establish this requirement.
import { chromium } from 'playwright-core'
import { reviewOutput } from './review-browser.mjs'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { contrastRatio } from './colors.mjs'

const base = process.env.ORACLE_BASE ?? 'http://127.0.0.1:3117'
const output = reviewOutput
const extension = await mkdtemp(join(tmpdir(), 'theorem-appearance-zoom-'))
await writeFile(
  join(extension, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'Appearance zoom verification',
    version: '1.0',
    permissions: ['tabs'],
    background: { service_worker: 'background.js' },
  }),
)
await writeFile(
  join(extension, 'background.js'),
  'chrome.runtime.onInstalled.addListener(()=>{});',
)
const context = await chromium.launchPersistentContext('', {
  headless: true,
  channel: 'chromium',
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
  viewport: { width: 1280, height: 1000 },
  reducedMotion: 'reduce',
})
const worker =
  context.serviceWorkers()[0] ??
  (await context.waitForEvent('serviceworker', { timeout: 15000 }))
const page = await context.newPage()
const checks = [],
  errors = []
page.on('pageerror', (error) => errors.push(error.message))
const check = (name, pass, observed) => {
  checks.push({ name, pass, observed })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`)
}
const settle = () =>
  page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    )
  })
const snapshot = () =>
  page.evaluate(() => {
    const editor = document.querySelector('[contenteditable=true]'),
      prose = document.querySelector('.aui-md-p'),
      actions = document.querySelector(
        '[data-appearance-part=composer-actions]',
      )
    const rect = (element) => element?.getBoundingClientRect().toJSON()
    return {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      pageWidth: document.documentElement.scrollWidth,
      text: [...document.querySelectorAll('.aui-md-p')]
        .map((p) => p.textContent)
        .join('\n'),
      draft: editor?.textContent,
      editor: rect(editor),
      actions: rect(actions),
      prose: prose && {
        size: getComputedStyle(prose).fontSize,
        line: getComputedStyle(prose).lineHeight,
        tracking: getComputedStyle(prose).letterSpacing,
        word: getComputedStyle(prose).wordSpacing,
        margin: getComputedStyle(prose).marginBottom,
      },
    }
  })
try {
  await mkdir(output, { recursive: true })
  await page.goto(`${base}/story/design-oracle-long`)
  await page.locator('[contenteditable=true]').waitFor()
  await settle()
  const initial = await snapshot()
  const zoom = await worker.evaluate(async () => {
    const tab = (await chrome.tabs.query({})).find((tab) =>
      tab.url?.includes('/story/design-oracle-long'),
    )
    await chrome.tabs.setZoom(tab.id, 4)
    return chrome.tabs.getZoom(tab.id)
  })
  await page.waitForFunction(() => innerWidth === 320)
  await settle()
  const enlarged = await snapshot()
  check(
    'actual 400% page zoom reflows to 320 CSS px',
    Math.abs(zoom - 4) < 0.001 &&
      enlarged.width === 320 &&
      enlarged.dpr === 4 &&
      enlarged.pageWidth <= 320 &&
      enlarged.text === initial.text &&
      enlarged.draft === initial.draft,
    { zoom, initial, enlarged },
  )
  const input = page.getByRole('textbox', { name: 'Message input' })
  await input.click()
  await input.press('End')
  await input.press('Shift+ArrowLeft')
  const focused = await page.evaluate(() => ({
    inside: document.activeElement?.closest('[contenteditable=true]') !== null,
    selection: getSelection()?.toString(),
  }))
  check(
    'zoomed editor remains keyboard operable',
    focused.inside && Boolean(focused.selection),
    focused,
  )
  await page.screenshot({ path: resolve(output, 'chromium-page-zoom400.png') })
  await worker.evaluate(async () => {
    const tab = (await chrome.tabs.query({})).find((tab) =>
      tab.url?.includes('/story/design-oracle-long'),
    )
    await chrome.tabs.setZoom(tab.id, 1)
  })
  await page.waitForFunction(() => innerWidth === 1280)
  await page.evaluate(() => (document.documentElement.style.fontSize = '32px'))
  await settle()
  const text200 = await snapshot()
  check(
    'independent 200% root text enlargement preserves prose and draft',
    text200.prose.size === '32px' &&
      text200.pageWidth <= text200.width &&
      text200.text === initial.text &&
      text200.draft === initial.draft,
    text200,
  )
  await page.evaluate(() =>
    document.documentElement.style.removeProperty('font-size'),
  )
  await page.addStyleTag({
    content:
      '* {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p {margin-bottom:2em!important}',
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await settle()
  const spaced = await snapshot()
  check(
    'specified spacing override at 320px preserves content',
    spaced.pageWidth <= 320 &&
      spaced.text === initial.text &&
      spaced.draft === initial.draft &&
      Math.abs(parseFloat(spaced.prose.tracking) - 1.92) < 0.05 &&
      Math.abs(parseFloat(spaced.prose.word) - 2.56) < 0.05 &&
      parseFloat(spaced.prose.margin) === 32,
    spaced,
  )
  const controls = await page
    .locator('.appearance-composer-toolbar button')
    .evaluateAll((buttons) =>
      buttons
        .map((button) => ({
          name: button.getAttribute('aria-label') || button.textContent,
          rect: button.getBoundingClientRect().toJSON(),
          clientWidth: button.clientWidth,
          scrollWidth: button.scrollWidth,
        }))
        .filter((button) => button.rect.width > 0),
    )
  check(
    'spacing override leaves composer controls reachable',
    controls.length > 0 &&
      controls.every(
        (button) =>
          button.rect.left >= 0 &&
          button.rect.right <= 320 &&
          button.rect.bottom <= 720 &&
          button.scrollWidth <= button.clientWidth + 1,
      ),
    controls,
  )
  await page.screenshot({ path: resolve(output, 'chromium-spacing-320.png') })
  await page.goto(`${base}/story/design-oracle-content`)
  await page.locator('.aui-md-p').first().waitFor()
  await settle()
  const wide = await snapshot()
  check(
    'code, table, long URL and artifact do not widen the ordinary page',
    wide.pageWidth <= 320,
    wide,
  )
  await page.screenshot({
    path: resolve(output, 'chromium-expanded-content-320.png'),
  })
  await page.goto(`${base}/story/design-oracle-rtl`)
  await page.locator('.aui-md-p').first().waitFor()
  await settle()
  const rtl = await page.evaluate(() => {
    const p = document.querySelector('[data-appearance-part=prose-track]'),
      e = document.querySelector('[data-appearance-part=editor-track]')
    return {
      direction: getComputedStyle(p).direction,
      prose: p.getBoundingClientRect().toJSON(),
      editor: e.getBoundingClientRect().toJSON(),
      text: p.textContent,
      pageWidth: document.documentElement.scrollWidth,
    }
  })
  check(
    'RTL and CJK content reflows with logical track alignment',
    rtl.direction === 'rtl' &&
      rtl.pageWidth <= 320 &&
      Math.abs(rtl.prose.right - rtl.editor.right) <= 1 &&
      /日本語/.test(rtl.text),
    rtl,
  )
  await page.emulateMedia({ forcedColors: 'active' })
  await page.getByRole('textbox', { name: 'Message input' }).focus()
  await page.keyboard.press('ArrowRight')
  await settle()
  const forced = await page.evaluate(() => {
    const editor = document.activeElement
    const plane = editor.closest('.appearance-reading-plane')
    const style = getComputedStyle(editor), paint = getComputedStyle(plane)
    return { active: matchMedia('(forced-colors: active)').matches, focused: editor.matches(':focus-visible'), outline: style.outlineColor, outlineWidth: parseFloat(style.outlineWidth), background: paint.backgroundColor, foreground: paint.color, backdrop: paint.backdropFilter }
  })
  check('forced colors preserves an opaque reading plane and visible keyboard focus', forced.active && forced.focused && forced.outlineWidth >= 2 && forced.backdrop === 'none' && contrastRatio(forced.outline, forced.background) >= 3, forced)
  check('No runtime errors', errors.length === 0, errors)
} catch (error) {
  check('Reflow runner completed', false, String(error.stack))
} finally {
  await writeFile(
    resolve(output, 'chromium-reflow.json'),
    JSON.stringify(
      {
        engine: 'chromium',
        checks,
        errors,
        limitations: [
          'Native touch keyboard and physical OS IME were not exercised.',
        ],
      },
      null,
      2,
    ),
  )
  await context.close()
  await rm(extension, { recursive: true, force: true })
}
if (checks.some((check) => !check.pass)) process.exitCode = 1
