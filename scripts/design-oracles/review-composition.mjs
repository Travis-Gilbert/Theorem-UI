// Exercise the real artifact-side consumer and its original review transport.
import { chromium, firefox, webkit } from 'playwright-core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const engine = process.env.ORACLE_BROWSER ?? 'chromium'
const base = process.env.ORACLE_BASE ?? 'http://127.0.0.1:3117'
const out = resolve('docs/plans/composable-appearance/evidence/review')
await mkdir(out, { recursive: true })
const browser = await { chromium, firefox, webkit }[engine].launch()
const page = await browser.newPage({
  viewport: { width: 1024, height: 900 },
  reducedMotion: 'reduce',
})
const checks = [],
  errors = []
const check = (name, pass, observed) => {
  checks.push({ name, pass, observed })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`)
}
page.on('pageerror', (e) => errors.push(e.message))
try {
  await page.goto(`${base}/story/compare-pane-standalone`)
  const editor = page.getByRole('textbox', {
    name: 'Message input',
    exact: true,
  })
  await editor.waitFor()
  await page.evaluate(() => {
    const original = window.fetch
    window.__compositionCalls = []
    window.fetch = async (input, init) => {
      const request = new Request(input, init)
      if (
        request.method === 'POST' &&
        /\/submit$|\/messages$/.test(new URL(request.url).pathname)
      )
        window.__compositionCalls.push({
          path: new URL(request.url).pathname,
          body: await request.clone().json(),
        })
      return original(request)
    }
  })
  const source = await readFile(
    'src/components/review/compare-pane.tsx',
    'utf8',
  )
  check(
    'Second consumer imports shared Composer and mounts one editor',
    source.includes("from '@/components/chat/composer'") &&
      (await editor.count()) === 1 &&
      (await page
        .locator('[data-composer-layout]')
        .getAttribute('data-composer-layout')) === 'sidecar',
    {
      source: 'src/components/review/compare-pane.tsx',
      layout: 'sidecar',
      editorCount: await editor.count(),
    },
  )
  await editor.fill('Keep the artifact-side feedback across theme changes.')
  await editor.press('End')
  await editor.press('Shift+ArrowLeft')
  await editor.evaluate((e) => {
    window.__compositionEditor = e
  })
  const snapshot = () =>
    page.evaluate(() => {
      const e = document.querySelector('[contenteditable=true]')
      const actual = e.querySelector('p') ?? e
      const style = getComputedStyle(actual)
      return {
        sameEditor: e === window.__compositionEditor,
        text: e.textContent,
        selection: getSelection()?.toString(),
        focused: e.contains(document.activeElement),
        type: [style.fontFamily, style.fontSize, style.lineHeight],
        box: document
          .querySelector('[data-appearance-part="composer"]')
          .getBoundingClientRect()
          .toJSON(),
        state: JSON.parse(document.documentElement.dataset.appearanceState),
      }
    })
  const before = await snapshot()
  await page.evaluate(async () => {
    const { useAppearance } = await import('/src/lib/appearance.ts')
    useAppearance
      .getState()
      .setOverrides({ palette: 'stone', materials: { composer: 'glass' } })
    await document.fonts.ready
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
  })
  const after = await snapshot()
  check(
    'Sidecar theme change preserves document, logical selection, focus and geometry',
    after.sameEditor &&
      after.focused &&
      after.text === before.text &&
      after.selection === before.selection &&
      JSON.stringify(after.type) === JSON.stringify(before.type) &&
      ['x', 'y', 'width', 'height'].every(
        (key) => Math.abs(before.box[key] - after.box[key]) <= 0.5,
      ),
    { before, after },
  )
  await page.getByRole('button', { name: 'Send feedback', exact: true }).click()
  await page.waitForFunction(
    () =>
      document.body.textContent.includes('Replied') ||
      !document.querySelector('[contenteditable=true]'),
  )
  const calls = await page.evaluate(() => window.__compositionCalls)
  check(
    'Shared sidecar action submits feedback exactly once without chat dispatch',
    calls.length === 1 &&
      calls[0].path.endsWith('/reviews/review-app-gallery/submit') &&
      calls[0].body.reply === before.text,
    calls,
  )
  check('No runtime errors', errors.length === 0, errors)
  await writeFile(
    resolve(out, `${engine}-composition.json`),
    JSON.stringify({ engine, version: browser.version(), checks }, null, 2) +
      '\n',
  )
  if (checks.some((check) => !check.pass)) process.exitCode = 1
} finally {
  await browser.close()
}
