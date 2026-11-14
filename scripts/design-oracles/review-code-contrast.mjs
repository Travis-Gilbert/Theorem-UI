// Actual Shiki and Crepe/CodeMirror paint in the Vite story routes.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { blend, wcagContrast } from 'culori'
import { chromium, firefox, webkit } from 'playwright-core'

const origin = process.env.ORACLE_BASE ?? 'http://127.0.0.1:3117'
const engine = process.env.ORACLE_ENGINE ?? 'chromium'
const driver = { chromium, firefox, webkit }[engine]
if (!driver) throw new Error(`Unknown browser: ${engine}`)
const out =
  process.env.ORACLE_CODE_OUT ??
  `docs/plans/composable-appearance/evidence/review/${engine}-code-contrast.json`
const browser = await driver.launch()
const results = []
const minimum = 4.5

function contrast(foreground, layers) {
  const background = blend(layers, 'normal', 'rgb')
  const text = blend([background, foreground], 'normal', 'rgb')
  return wcagContrast(text, background)
}

async function customProfile() {
  const page = await browser.newPage()
  try {
    await page.goto(`${origin}/story/design-oracle-content`)
    await page.locator('[data-appearance-fixture="F04"]').waitFor()
    return await page.evaluate(async () => {
      const { COLOR_ROLES } = await import('/src/lib/appearance-policy.ts')
      const { customPaletteSchema } = await import('/src/lib/appearance.ts')
      const root = document.documentElement
      const colors = Object.fromEntries(
        ['light', 'dark'].map((mode) => {
          root.classList.toggle('dark', mode === 'dark')
          const style = getComputedStyle(root)
          return [
            mode,
            Object.fromEntries(
              [...new Set(Object.values(COLOR_ROLES))].map((token) => [
                token,
                style.getPropertyValue(`--${token}`).trim(),
              ]),
            ),
          ]
        }),
      )
      colors.light.popover = '#e4f4ff'
      colors.dark.popover = '#26394a'
      return customPaletteSchema.parse({
        name: 'Blue paper and ink',
        ...colors,
      })
    })
  } finally {
    await page.close()
  }
}

async function measure(page, fixture, root, leaf, inline) {
  await page.goto(`${origin}/story/design-oracle-${fixture}`)
  const block = page.locator(root).first()
  await block.waitFor()
  await page.locator(`${root} ${leaf}`).first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  if (fixture === 'draft') {
    await block.click()
    await page.keyboard.press('ControlOrMeta+a')
    await block
      .locator('..')
      .locator('.cm-selectionBackground')
      .first()
      .waitFor({
        state: 'attached',
      })
  }
  const observed = await page.evaluate(
    ({ root, leaf, inline }) => {
      const first = document.querySelector(root)
      const appearance = document.documentElement
      const background = (element) => {
        const colors = []
        for (let node = element; node; node = node.parentElement) {
          const value = getComputedStyle(node).backgroundColor
          if (value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)')
            colors.push(value)
          if (!value.startsWith('rgba(') && value !== 'transparent') break
        }
        return colors.reverse()
      }
      const paint = (node) => ({
        text: node.textContent,
        foreground: getComputedStyle(node).color,
        background: background(node),
      })
      const editor = first.closest('.cm-editor')
      const selection = editor?.querySelector('.cm-selectionBackground')
      const cursor = editor?.querySelector('.cm-cursor')
      const token = first.querySelector(leaf)
      const nativeSelection = getComputedStyle(token, '::selection')
      const inlineCode = document.querySelector(inline)
      return {
        palette: appearance.dataset.palette,
        dark: appearance.classList.contains('dark'),
        base: paint(first),
        tokens: [...first.querySelectorAll(leaf)].map(paint),
        inline: inlineCode && paint(inlineCode),
        selection: editor
          ? {
              background:
                selection && getComputedStyle(selection).backgroundColor,
            }
          : {
              background: nativeSelection.backgroundColor,
              foreground: nativeSelection.color,
            },
        caret: cursor && getComputedStyle(cursor).borderLeftColor,
      }
    },
    { root, leaf, inline },
  )
  const blockPaint = [observed.base, ...observed.tokens]
  const items = [...blockPaint, observed.inline].filter(Boolean)
  for (const item of items)
    item.ratio = contrast(item.foreground, item.background)
  const selected = observed.selection.background
  const selectionColors = observed.selection.foreground
    ? [observed.selection.foreground]
    : blockPaint.map(({ foreground }) => foreground)
  observed.selection.minimumRatio = selected
    ? Math.min(...selectionColors.map((color) => contrast(color, [selected])))
    : null
  observed.caretRatio = observed.caret
    ? contrast(observed.caret, observed.base.background)
    : null
  observed.minimumRatio = Math.min(...items.map(({ ratio }) => ratio))
  observed.distinctTokenColors = new Set(
    observed.tokens.map(({ foreground }) => foreground),
  ).size
  return observed
}

try {
  const customPalette = await customProfile()
  const profiles = [
    ['calm', 'github-sharp'],
    ['expressive', 'github-sharp'],
    ['calm', 'stone'],
    ['calm', 'vitesse'],
    ['calm', 'custom', customPalette],
    [
      'expressive',
      'custom',
      {
        name: 'Reversed mode surfaces',
        light: customPalette.dark,
        dark: customPalette.light,
      },
    ],
  ]
  for (const [preset, palette, custom] of profiles) {
    for (const mode of ['light', 'dark']) {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      })
      page.setDefaultTimeout(45_000)
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.addInitScript(
        ({ mode, preset, palette, custom }) => {
          localStorage.setItem('theorem-ui-theme', mode)
          localStorage.setItem(
            'theorem-ui:appearance',
            JSON.stringify({
              version: 1,
              state: {
                preset,
                overrides: {
                  palette,
                  ...(custom && { customPalette: custom }),
                },
              },
            }),
          )
        },
        { mode, preset, palette, custom },
      )
      try {
        const transcript = await measure(
          page,
          'content',
          '.aui-shiki-base pre.shiki',
          '.line > span',
          '.aui-md-inline-code',
        )
        const editor = await measure(
          page,
          'draft',
          '.theorem-composer .cm-content',
          '.cm-line > span',
          '.ProseMirror p code',
        )
        const passed =
          errors.length === 0 &&
          [transcript, editor].every(
            (surface) =>
              surface.palette === palette &&
              surface.dark === (mode === 'dark') &&
              surface.inline &&
              surface.distinctTokenColors >= 2 &&
              surface.minimumRatio >= minimum &&
              surface.selection.minimumRatio >= minimum,
          ) &&
          editor.caretRatio >= 3
        results.push({
          preset,
          palette,
          mode,
          passed,
          errors,
          transcript,
          editor,
        })
        console.log(
          `${passed ? 'PASS' : 'FAIL'} ${preset}/${palette}/${mode} ${transcript.minimumRatio.toFixed(2)} / ${editor.minimumRatio.toFixed(2)}`,
        )
      } catch (error) {
        results.push({
          preset,
          palette,
          mode,
          passed: false,
          errors,
          error: String(error),
        })
        console.log(`FAIL ${preset}/${palette}/${mode} ${error}`)
      } finally {
        await page.close()
      }
    }
  }
} finally {
  const version = browser.version()
  await browser.close()
  await mkdir(dirname(out), { recursive: true })
  await writeFile(
    out,
    JSON.stringify({ engine, version, minimum, results }, null, 2) + '\n',
  )
}

if (!results.length || results.some(({ passed }) => !passed))
  process.exitCode = 1
