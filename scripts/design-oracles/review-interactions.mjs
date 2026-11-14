// Human-review companion: operate the same visible settings a user operates,
// keeping the real editor mounted. Deliberately separate from token checks.
import { launchReviewBrowser, reviewOutput } from './review-browser.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const base = process.env.ORACLE_BASE ?? 'http://127.0.0.1:3117'
const out = reviewOutput
await mkdir(out, { recursive: true })
const engine = process.env.ORACLE_BROWSER ?? 'chromium'
const browser = await launchReviewBrowser(engine)
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
const errors = [],
  checks = []
page.on('pageerror', (e) => errors.push(e.message))
const check = (name, pass, observed) => {
  checks.push({ name, pass, observed })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`)
}
const settle = async () => {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
  })
  await page.waitForFunction(() => {
    const main = document
      .querySelector('[data-appearance-part="main"]')
      ?.getBoundingClientRect()
    return main && main.width > 0 && main.width <= innerWidth + 0.5
  })
  // Dockview resizes and reparents its existing group on animation frames.
  let previous
  for (let i = 0; i < 30; i++) {
    const next = await page
      .locator('[data-appearance-part="composer"]')
      .first()
      .boundingBox()
    if (next?.width > 0 && JSON.stringify(next) === JSON.stringify(previous))
      return
    previous = next
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
  }
  throw new Error('Composer geometry did not settle')
}
try {
  await page.goto(`${base}/story/shell-compare`)
  await page.locator('[data-story-ready]').waitFor({ state: 'attached' })
  const editor = page
    .locator('[data-appearance-part="main"] [contenteditable=true]')
    .first()
  await editor.fill('A personal theme must preserve this draft.')
  await editor.press('End')
  await editor.press('Shift+ArrowLeft')
  await editor.evaluate((e) => {
    window.__reviewEditor = e
  })
  const snapshot = () =>
    page.evaluate(() => {
      const editor = document.querySelector(
        '[data-appearance-part="main"] [contenteditable=true]',
      )
      const actual = editor.querySelector('p') ?? editor
      const s = getComputedStyle(actual)
      const box = document
        .querySelector(
          '[data-appearance-part="main"] [data-appearance-part="composer"]',
        )
        ?.getBoundingClientRect()
      return {
        appearance: JSON.parse(
          document.documentElement.dataset.appearanceState ?? 'null',
        ),
        mode: document.documentElement.classList.contains('dark')
          ? 'dark'
          : 'light',
        text: editor.textContent,
        sameEditor: editor === window.__reviewEditor,
        type: [
          s.fontFamily,
          s.fontSize,
          s.fontWeight,
          s.lineHeight,
          s.letterSpacing,
        ],
        box: box && {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        },
        hitRegions: [
          ...document.querySelectorAll(
            '[data-appearance-part="main"] [data-appearance-part="composer"] button',
          ),
        ]
          .map((element) => {
            const { x, y, width, height } = element.getBoundingClientRect()
            return {
              label: element.getAttribute('aria-label') ?? element.textContent,
              x,
              y,
              width,
              height,
            }
          })
          .filter((rect) => rect.width > 0 && rect.height > 0),
        navigation: document
          .querySelector('[data-appearance-part="navigation"]')
          ?.getAttribute('data-material'),
      }
    })
  const dialog = page.getByRole('dialog', { name: 'Appearance settings' })
  const open = async () => {
    await page
      .getByRole('button', { name: 'Appearance', exact: true })
      .filter({ visible: true })
      .first()
      .click()
    await dialog
      .getByRole('combobox', { name: 'Density', exact: true })
      .waitFor()
  }
  const close = async () => {
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await settle()
  }
  for (const [name, mutate, geometry, type] of [
    [
      'palette',
      () =>
        dialog
          .getByRole('combobox', { name: 'Colors', exact: true })
          .selectOption('stone'),
      true,
      true,
    ],
    [
      'dark mode',
      () => dialog.getByRole('button', { name: 'Dark', exact: true }).click(),
      true,
      true,
    ],
    [
      'paper composer',
      () =>
        dialog
          .getByRole('combobox', { name: 'Composer material', exact: true })
          .selectOption('paper'),
      true,
      true,
    ],
    [
      'glass composer',
      () =>
        dialog
          .getByRole('combobox', { name: 'Composer material', exact: true })
          .selectOption('glass'),
      true,
      true,
    ],
    [
      'liquid composer',
      () =>
        dialog
          .getByRole('combobox', { name: 'Composer material', exact: true })
          .selectOption('liquid'),
      true,
      true,
    ],
    [
      'flat composer',
      () =>
        dialog
          .getByRole('combobox', { name: 'Composer material', exact: true })
          .selectOption('flat'),
      true,
      true,
    ],
    [
      'ambience on',
      () =>
        dialog
          .locator('[aria-label="Life field"]')
          .getByRole('button', { name: 'On', exact: true })
          .click(),
      true,
      true,
    ],
    [
      'ambience off',
      () =>
        dialog
          .locator('[aria-label="Life field"]')
          .getByRole('button', { name: 'Off', exact: true })
          .click(),
      true,
      true,
    ],
    [
      'compact density',
      () =>
        dialog
          .getByRole('combobox', { name: 'Density', exact: true })
          .selectOption('compact'),
      false,
      true,
    ],
    [
      'wide reading',
      () => dialog.getByRole('button', { name: 'Wide', exact: true }).click(),
      false,
      true,
    ],
    [
      'sidecar layout',
      () =>
        dialog
          .getByRole('button', { name: 'Tools above editor', exact: true })
          .click(),
      false,
      true,
    ],
    [
      '200% text',
      async () => {
        const input = dialog.getByRole('spinbutton', {
          name: 'Content size',
          exact: true,
        })
        await input.fill('200')
        await input.press('Tab')
      },
      false,
      false,
    ],
  ]) {
    await settle()
    const before = await snapshot()
    await open()
    await mutate()
    await close()
    const after = await snapshot()
    const residual =
      before.box && after.box
        ? Math.max(
            ...Object.keys(before.box).map((key) =>
              Math.abs(before.box[key] - after.box[key]),
            ),
          )
        : Infinity
    check(
      `${name}: draft and mounted editor`,
      after.sameEditor && after.text === before.text,
      { before, after },
    )
    if (type)
      check(
        `${name}: typography isolation`,
        JSON.stringify(before.type) === JSON.stringify(after.type),
        { before: before.type, after: after.type },
      )
    if (geometry) {
      check(`${name}: geometry isolation`, residual <= 0.5, { residual })
      const hitResidual =
        before.hitRegions.length === after.hitRegions.length
          ? Math.max(
              0,
              ...before.hitRegions.flatMap((rect, index) =>
                rect.label !== after.hitRegions[index].label
                  ? [Infinity]
                  : ['x', 'y', 'width', 'height'].map((key) =>
                      Math.abs(rect[key] - after.hitRegions[index][key]),
                    ),
              ),
            )
          : Infinity
      check(`${name}: hit-region isolation`, hitResidual <= 0.5, {
        residual: hitResidual,
        before: before.hitRegions,
        after: after.hitRegions,
      })
    }
    if (name.includes('composer'))
      check(
        `${name}: navigation material isolation`,
        before.navigation === after.navigation,
        { before: before.navigation, after: after.navigation },
      )
  }
  await open()
  await dialog
    .getByRole('button', { name: 'Reset appearance', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Light', exact: true }).click()
  await close()
  await page.screenshot({
    path: resolve(out, `${engine}-calm-light-desktop.png`),
  })
  await open()
  await dialog.getByRole('button', { name: 'Dark', exact: true }).click()
  await close()
  await page.screenshot({
    path: resolve(out, `${engine}-calm-dark-desktop.png`),
  })
  for (const width of [1024, 390, 320, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    await settle()
    const occupied = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-appearance-part="main"],[data-appearance-part="inspector"]',
        ),
      ]
        .map((element) => ({
          part: element.dataset.appearancePart,
          rect: element.getBoundingClientRect().toJSON(),
        }))
        .filter((item) => item.rect.width > 0),
    )
    check(
      `${width}px: main and inspector fit viewport`,
      occupied.every(
        (item) => item.rect.left >= -0.5 && item.rect.right <= width + 0.5,
      ),
      occupied,
    )
    const after = await snapshot()
    check(
      `${width}px: editor and draft continuity`,
      after.sameEditor &&
        after.text === 'A personal theme must preserve this draft.',
      after,
    )
    if (width <= 390) {
      await page
        .getByRole('button', { name: 'Open sidebar', exact: true })
        .click()
      const nav = page.getByRole('dialog', { name: 'Navigation', exact: true })
      const box = await nav.boundingBox()
      check(
        `${width}px: navigation fits`,
        box && box.x >= 0 && box.width <= width + 0.5,
        { box },
      )
      await nav
        .getByRole('button', { name: 'Close navigation', exact: true })
        .click()
      await settle()
      await page.screenshot({
        path: resolve(out, `${engine}-calm-dark-${width}.png`),
      })
    }
  }
  await page
    .locator('[data-appearance-part="navigation"] button')
    .first()
    .focus()
  await page.setViewportSize({ width: 320, height: 1000 })
  await settle()
  const responsiveFocus = await page.evaluate(() => ({
    label: document.activeElement?.getAttribute('aria-label'),
    visible: Boolean(document.activeElement?.getClientRects().length),
  }))
  check(
    'Hidden navigation transfers focus to responsive trigger',
    responsiveFocus.visible && responsiveFocus.label === 'Open sidebar',
    responsiveFocus,
  )
  await page.setViewportSize({ width: 1920, height: 1000 })
  await settle()
  await open()
  await dialog.getByText('Custom appearance', { exact: true }).click()
  await dialog
    .getByRole('textbox', { name: 'Custom appearance JSON' })
    .fill('{"unknown":true}')
  await dialog
    .getByRole('button', { name: 'Apply custom appearance', exact: true })
    .click()
  check(
    'Unknown theme fields rejected',
    await dialog.getByRole('alert').isVisible(),
    await dialog.getByRole('alert').textContent(),
  )
  await close()
  check('No runtime errors', errors.length === 0, errors)
} catch (error) {
  console.error(error)
  check('Review runner completed', false, String(error.stack))
} finally {
  await writeFile(
    resolve(out, `${engine}-interactions.json`),
    JSON.stringify(
      { engine, browser: browser.version(), checks, errors },
      null,
      2,
    ),
  )
  await browser.close()
}
if (checks.some((c) => !c.pass)) process.exitCode = 1
