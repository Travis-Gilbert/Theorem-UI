// Observe the real Milkdown DOM, browser composition events, settings form and
// persisted document. Store actions are the existing commands, not a test runtime.
import { launchReviewBrowser, reviewOutput } from './review-browser.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const engine = process.env.ORACLE_BROWSER ?? 'chromium'
const base = process.env.ORACLE_BASE ?? 'http://127.0.0.1:3117'
const output = reviewOutput
const browser = await launchReviewBrowser(engine)
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
})
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
const attach = async () => {
  await page.evaluate(async () => {
    window.__appearance = (await import('/src/lib/appearance.ts')).useAppearance
  })
  await settle()
}
const apply = async (patch) => {
  await page.evaluate(
    (patch) => window.__appearance.getState().setOverrides(patch),
    patch,
  )
  await settle()
}
const readState = () =>
  page.evaluate(() => {
    const editor = document.querySelector(
      '[data-appearance-part="main"] [contenteditable="true"]',
    )
    const selection = getSelection()
    const offset = (node, value) => {
      if (!node || !editor?.contains(node)) return null
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.setEnd(node, value)
      return range.toString().length
    }
    return {
      text: editor?.textContent,
      sameEditor: editor === window.__editor,
      focused:
        editor?.contains(document.activeElement) ||
        document.activeElement === editor,
      selection: [
        offset(selection?.anchorNode, selection?.anchorOffset),
        offset(selection?.focusNode, selection?.focusOffset),
      ],
      document: editor?.innerHTML,
      state: JSON.parse(
        document.documentElement.dataset.appearanceState ?? 'null',
      ),
    }
  })
try {
  await page.goto(`${base}/story/shell-compare`)
  await page.locator('[data-story-ready]').waitFor({ state: 'attached' })
  await attach()
  const editor = page
    .locator('[data-appearance-part="main"] [contenteditable="true"]')
    .first()
  await editor.fill(
    'Keep this draft and its selection across appearance changes.',
  )
  await editor.press('End')
  await editor.press('Shift+ArrowLeft')
  await editor.press('Shift+ArrowLeft')
  await editor.evaluate((element) => {
    window.__editor = element
  })
  const initial = await readState()
  for (const [name, patch] of [
    ['palette', { palette: 'stone' }],
    ['composer material', { materials: { composer: 'glass' } }],
    ['navigation material', { materials: { navigation: 'paper' } }],
    ['density', { density: 'compact' }],
    ['content scale', { scales: { content: 1.6 } }],
    ['reading width', { reading: 'wide' }],
    ['composer layout', { layout: 'sidecar' }],
  ]) {
    await apply(patch)
    const actual = await readState()
    check(
      `${name}: editor, document, logical selection and focus`,
      actual.sameEditor &&
        actual.document === initial.document &&
        actual.focused &&
        JSON.stringify(actual.selection) === JSON.stringify(initial.selection),
      actual,
    )
  }
  await page.evaluate(() =>
    window.__appearance.getState().selectPreset('expressive'),
  )
  await settle()
  const preset = await readState()
  check(
    'preset retains deliberate overrides',
    preset.state.scales.content === 1.6 &&
      preset.state.density === 'compact' &&
      preset.state.materials.composer === 'glass' &&
      preset.sameEditor,
    preset,
  )

  if (engine === 'chromium') {
    await editor.press('End')
    await editor.evaluate((element) => {
      window.__compositionEvents = []
      for (const type of [
        'compositionstart',
        'compositionupdate',
        'compositionend',
      ])
        element.addEventListener(type, (event) =>
          window.__compositionEvents.push({
            type,
            data: event.data,
            trusted: event.isTrusted,
          }),
        )
    })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.imeSetComposition', {
      text: 'に',
      selectionStart: 1,
      selectionEnd: 1,
    })
    await apply({
      materials: { composer: 'flat' },
      density: 'touch',
      layout: 'conversation',
    })
    const composing = await readState()
    const beforeCommit = await page.evaluate(() => window.__compositionEvents)
    await cdp.send('Input.insertText', { text: '日本' })
    await settle()
    const after = await readState()
    const events = await page.evaluate(() => window.__compositionEvents)
    check(
      'CDP native composition survives appearance change',
      composing.sameEditor &&
        composing.text.includes('に') &&
        !beforeCommit.some((event) => event.type === 'compositionend') &&
        after.sameEditor &&
        after.text.includes('日本') &&
        events.some((event) => event.type === 'compositionend'),
      {
        composing,
        after,
        events,
        scope:
          'Chromium native event path driven by CDP; physical OS input method not established',
      },
    )
  }
  // Exercise data portability through the visible form, then inspect persisted
  // values and the freshly loaded renderer rather than calling its schema.
  await page
    .getByRole('button', { name: 'Appearance', exact: true })
    .filter({ visible: true })
    .first()
    .click()
  const dialog = page.getByRole('dialog', { name: 'Appearance settings' })
  await dialog.getByText('Custom appearance', { exact: true }).click()
  const field = dialog.getByRole('textbox', { name: 'Custom appearance JSON' })
  const data = {
    version: 1,
    preset: 'calm',
    mode: 'dark',
    life: false,
    overrides: {
      palette: 'vitesse',
      density: 'compact',
      reading: 'wide',
      layout: 'sidecar',
      scales: { content: 1.25, ui: 1.1, code: 1.2 },
      materials: { composer: 'paper', navigation: 'flat' },
    },
  }
  await field.fill(JSON.stringify(data))
  await dialog
    .getByRole('button', { name: 'Apply custom appearance', exact: true })
    .click()
  await dialog
    .getByText('Appearance settings applied.', { exact: true })
    .waitFor()
  const exported = JSON.parse(await field.inputValue())
  check(
    'versioned document round trip through settings',
    isDeepStrictEqual(exported, data),
    { input: data, exported },
  )
  await page.reload()
  await page.locator('[data-story-ready]').waitFor({ state: 'attached' })
  await attach()
  const persisted = await page.evaluate(() => ({
    appearance: JSON.parse(localStorage.getItem('theorem-ui:appearance')),
    theme: document.documentElement.classList.contains('dark'),
    life: JSON.parse(localStorage.getItem('theorem-ui:life')),
    resolved: JSON.parse(document.documentElement.dataset.appearanceState),
  }))
  check(
    'reloaded renderer preserves imported settings',
    persisted.appearance.version === 1 &&
      persisted.resolved.palette === 'vitesse' &&
      persisted.resolved.scales.content === 1.25 &&
      persisted.resolved.materials.composer === 'paper' &&
      persisted.resolved.materials.navigation === 'flat' &&
      persisted.theme &&
      persisted.life.state.shown === false,
    persisted,
  )
  await page
    .getByRole('button', { name: 'Appearance', exact: true })
    .filter({ visible: true })
    .first()
    .click()
  await dialog
    .getByRole('button', { name: 'Reset appearance', exact: true })
    .click()
  const reset = await page.evaluate(() =>
    JSON.parse(document.documentElement.dataset.appearanceState),
  )
  check(
    'explicit reset clears overrides',
    reset.scales.content === 1 &&
      reset.materials.composer === 'flat' &&
      reset.density === 'comfortable',
    reset,
  )
  const legacyContext = await browser.newContext()
  await legacyContext.addInitScript(() => {
    localStorage.setItem(
      'theorem-ui:palette',
      JSON.stringify({ state: { palette: 'vitesse' }, version: 0 }),
    )
    localStorage.setItem(
      'theorem-ui:surfaces',
      JSON.stringify({ state: { composer: 'liquid' }, version: 0 }),
    )
    localStorage.setItem(
      'theorem-ui:life',
      JSON.stringify({ state: { shown: false }, version: 0 }),
    )
    localStorage.setItem('theorem-ui-theme', 'dark')
  })
  const legacyPage = await legacyContext.newPage()
  legacyPage.on('pageerror', (error) => errors.push(error.message))
  await legacyPage.goto(`${base}/story/shell-compare`)
  await legacyPage.waitForFunction(
    () => document.documentElement.dataset.appearanceState,
  )
  const migrated = await legacyPage.evaluate(() => ({
    resolved: JSON.parse(document.documentElement.dataset.appearanceState),
    dark: document.documentElement.classList.contains('dark'),
    life: JSON.parse(localStorage.getItem('theorem-ui:life')).state.shown,
  }))
  check(
    'legacy preferences migrate in the real renderer',
    migrated.resolved.preset === 'expressive' &&
      migrated.resolved.palette === 'vitesse' &&
      migrated.resolved.materials.composer === 'liquid' &&
      migrated.resolved.materials.navigation === 'liquid' &&
      migrated.dark &&
      migrated.life === false,
    migrated,
  )
  await legacyContext.close()
  check('No runtime errors', errors.length === 0, errors)
} catch (error) {
  check('Continuity runner completed', false, String(error.stack))
} finally {
  await mkdir(output, { recursive: true })
  await writeFile(
    resolve(output, `${engine}-continuity.json`),
    JSON.stringify(
      { engine, browser: browser.version(), checks, errors },
      null,
      2,
    ),
  )
  await browser.close()
}
if (checks.some((check) => !check.pass)) process.exitCode = 1
