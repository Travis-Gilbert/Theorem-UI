// Live-report regressions: shared gradient, preset round trips and real settings.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { wcagContrast } from 'culori'
import { chooseOption } from './browser-controls.mjs'

const base = process.env.ORACLE_BASE ?? 'http://127.0.0.1:3117'
const out = 'docs/plans/composable-appearance/evidence/live-repairs'
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
page.setDefaultTimeout(30_000)
const checks = [],
  errors = []
page.on('pageerror', (error) => errors.push(error.message))
const check = async (name, action) => {
  try {
    const observed = await action()
    checks.push({ name, passed: true, observed })
    console.log(`PASS ${name}`)
  } catch (error) {
    checks.push({
      name,
      passed: false,
      error: String(error.stack),
      observed: await page
        .locator('body')
        .innerText()
        .catch(() => 'Page unavailable'),
    })
    console.error(`FAIL ${name}: ${error.message}`)
  }
}
const settle = () =>
  page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
  })
const paint = () =>
  page
    .locator('[data-surface-role="assistant-reading"]')
    .first()
    .evaluate((node) => {
      const style = getComputedStyle(node)
      return {
        background: style.backgroundColor,
        image: style.backgroundImage,
        gradient: getComputedStyle(node.closest('.sheet')).backgroundImage,
        footer: getComputedStyle(
          document.querySelector('[data-slot="aui_assistant-message-footer"]'),
        ).backgroundColor,
        colors: Object.fromEntries(
          ['--ink', '--ink-muted', '--sheet-from', '--sheet-to'].map((name) => [
            name,
            style.getPropertyValue(name).trim(),
          ]),
        ),
      }
    })
try {
  await page.goto(`${base}/story/shell-compare`)
  await page
    .locator('[data-story-ready]')
    .waitFor({ state: 'attached', timeout: 60_000 })
  const editor = page
    .getByRole('textbox', { name: 'Message input', exact: true })
    .filter({ visible: true })
    .first()
  await editor.fill('Keep this draft while switching presets.')
  await editor.evaluate((element) => {
    window.__repairEditor = element
  })
  for (const palette of ['github-sharp', 'stone', 'vitesse']) {
    for (const dark of [false, true]) {
      await check(
        `${palette} ${dark ? 'dark' : 'light'}: Expressive shares the unchanged gradient across preset switches`,
        async () => {
          await page.evaluate(
            async ({ palette, dark }) => {
              const { useAppearance } = await import('/src/lib/appearance.ts')
              useAppearance.getState().loadSelection({
                preset: 'expressive',
                overrides: {
                  palette,
                  materials: { 'assistant-reading': 'liquid' },
                },
              })
              document.documentElement.classList.toggle('dark', dark)
            },
            { palette, dark },
          )
          await settle()
          const before = await paint()
          assert(before.gradient.startsWith('linear-gradient('))
          assert.equal(before.background, 'rgba(0, 0, 0, 0)')
          assert.equal(before.footer, 'rgba(0, 0, 0, 0)')
          assert.equal(before.image, 'none')
          const contrast = ['--ink', '--ink-muted'].flatMap((ink) =>
            ['--sheet-from', '--sheet-to'].map((bg) =>
              wcagContrast(before.colors[ink], before.colors[bg]),
            ),
          )
          assert(
            Math.min(...contrast) >= 4.5,
            `Gradient endpoint text contrast: ${Math.min(...contrast)}`,
          )
          await page.evaluate(async () =>
            (await import('/src/lib/appearance.ts')).useAppearance
              .getState()
              .selectPreset('calm'),
          )
          await settle()
          assert.equal((await paint()).gradient, 'none')
          await page.evaluate(async () =>
            (await import('/src/lib/appearance.ts')).useAppearance
              .getState()
              .selectPreset('expressive'),
          )
          await settle()
          assert.deepEqual(await paint(), before)
          assert(
            await editor.evaluate(
              (element) => element === window.__repairEditor,
            ),
          )
          assert.equal(
            await editor.textContent(),
            'Keep this draft while switching presets.',
          )
          if (palette === 'stone')
            await page.screenshot({
              path: `${out}/expressive-${dark ? 'dark' : 'light'}.png`,
            })
          return {
            paint: before,
            minimumEndpointContrast: Math.min(...contrast),
          }
        },
      )
    }
  }
  await check(
    'Appearance uses coss controls with keyboard selection and bounded numeric input',
    async () => {
      await page
        .getByRole('button', { name: 'Appearance', exact: true })
        .filter({ visible: true })
        .first()
        .click()
      const dialog = page.getByRole('dialog', { name: 'Appearance settings' })
      assert.equal(
        await dialog
          .getByRole('combobox', { name: 'Replies material', exact: true })
          .count(),
        0,
      )
      await chooseOption(page, dialog, 'Background material', 'Frosted glass')
      await page.waitForFunction(
        () => document.documentElement.dataset.materialCanvas === 'glass',
      )
      assert.equal((await paint()).background, 'rgba(0, 0, 0, 0)')
      const overrides = await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('theorem-ui:appearance')).state
            .overrides,
      )
      assert.equal(overrides.materials.canvas, 'glass')
      assert.equal(overrides.materials['assistant-reading'], undefined)
      await chooseOption(page, dialog, 'Background material', 'Paper')
      const density = dialog.getByRole('combobox', {
        name: 'Density',
        exact: true,
      })
      assert.equal(await density.getAttribute('data-slot'), 'select-trigger')
      await density.focus()
      await density.press('Enter')
      await page.getByRole('option', { name: 'Touch', exact: true }).focus()
      await page.keyboard.press('Enter')
      await settle()
      assert.equal(
        await page.locator('html').getAttribute('data-density'),
        'touch',
      )
      await chooseOption(page, dialog, 'Density', 'Comfortable')
      const size = dialog.getByRole('textbox', {
        name: 'Content size',
        exact: true,
      })
      await size.fill('125')
      await size.press('Tab')
      await settle()
      assert.equal(
        await page.evaluate(
          () =>
            JSON.parse(document.documentElement.dataset.appearanceState).scales
              .content,
        ),
        1.25,
      )
      await size.fill('100')
      await size.press('Tab')
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    },
  )
  await page.goto(`${base}/story/settings-ai`)
  await page
    .getByRole('textbox', { name: 'Search models', exact: true })
    .waitFor()
  await check(
    'AI settings give the TanStack table a wide page and retain working coss controls',
    async () => {
      await page.setViewportSize({ width: 1920, height: 1080 })
      await settle()
      const width = await page
        .getByRole('textbox', { name: 'Search models' })
        .evaluate(
          (node) => node.closest('section').getBoundingClientRect().width,
        )
      assert(width > 1000, `AI content width: ${width}`)
      const effort = page.getByRole('combobox', {
        name: 'Default reasoning effort',
      })
      assert.equal(await effort.getAttribute('data-slot'), 'select-trigger')
      await chooseOption(page, page, 'Default reasoning effort', 'High')
      assert((await effort.textContent()).includes('High'))
      await page
        .getByRole('textbox', { name: 'Search models' })
        .fill('Research')
      await page.getByText('1 of 8 models', { exact: true }).waitFor()
      await page.getByRole('textbox', { name: 'Search models' }).fill('')
      await page.getByText('8 of 8 models', { exact: true }).waitFor()
      await page.screenshot({ path: `${out}/ai-settings-wide.png` })
      return { contentWidth: width }
    },
  )
  for (const width of [390, 320]) {
    await check(
      `${width}px settings wrap controls without document overflow`,
      async () => {
        await page.setViewportSize({ width, height: 844 })
        await settle()
        const observed = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }))
        assert(observed.scroll <= width + 1)
        const controls = await page
          .locator(
            'main [data-slot="number-field"], main [aria-label="Response detail"], main [aria-label="Default reasoning effort"]',
          )
          .evaluateAll((nodes) =>
            nodes.map((node) => {
              const box = node.getBoundingClientRect()
              return { left: box.left, right: box.right }
            }),
          )
        assert(
          controls.length > 0 &&
            controls.every((box) => box.left >= 0 && box.right <= width + 1),
        )
        return { ...observed, controls }
      },
    )
  }
  await check('No uncaught browser errors', () => assert.deepEqual(errors, []))
} finally {
  await writeFile(
    `${out}/expressive-settings.json`,
    JSON.stringify({ browser: browser.version(), checks, errors }, null, 2) +
      '\n',
  )
  await browser.close()
}
if (checks.some((entry) => !entry.passed)) process.exitCode = 1
