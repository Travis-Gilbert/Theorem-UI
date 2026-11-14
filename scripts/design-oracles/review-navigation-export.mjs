// PR #101 regressions: real shell/router, Base UI drawer, Milkdown and settings.
// The development story supplies deterministic SDK responses, not a live server.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { launchReviewBrowser, reviewOutput } from './review-browser.mjs'

const base = process.env.ORACLE_BASE ?? 'http://127.0.0.1:3117'
const output = reviewOutput
const browser = await launchReviewBrowser()
const checks = []
const errors = []
await mkdir(output, { recursive: true })
const run = async (name, action) => {
  try {
    await action()
    checks.push({ name, passed: true })
    console.log(`PASS ${name}`)
  } catch (error) {
    checks.push({ name, passed: false, error: String(error.stack) })
    console.error(`FAIL ${name}: ${error.message}`)
  }
}
const newPage = async (width) => {
  const page = await browser.newPage({
    viewport: { width, height: 844 },
    reducedMotion: 'reduce',
  })
  page.setDefaultTimeout(15_000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${base}/story/shell-navigation`)
  await page.locator('[data-shell-route="/vault"]').waitFor()
  return page
}
const drawerSelector = '[data-appearance-part="drawer"]'
const trigger = (page, header) =>
  page.locator(`.appearance-${header}-header button[aria-label="Open sidebar"]`)

try {
  for (const width of [320, 390]) {
    await run(
      `${width}px Vault can reopen navigation and leave for Notes/Home`,
      async () => {
        const page = await newPage(width)
        try {
          const open = trigger(page, 'vault')
          await open.waitFor()
          assert(
            await open.evaluate((button) => {
              const rect = button.getBoundingClientRect()
              return (
                !button.closest('[inert]') &&
                rect.left >= 0 &&
                rect.right <= innerWidth &&
                rect.top >= 0 &&
                button.contains(
                  document.elementFromPoint(
                    rect.x + rect.width / 2,
                    rect.y + rect.height / 2,
                  ),
                )
              )
            }),
          )
          await open.click()
          const drawer = page.locator(drawerSelector)
          await drawer
            .getByRole('button', { name: 'Close navigation', exact: true })
            .click()
          await drawer.waitFor({ state: 'hidden' })
          // Keyboard activation must also work after the drawer has been closed.
          await open.focus()
          await open.press('Enter')
          await drawer.waitFor()
          await page.keyboard.press('Escape')
          await drawer.waitFor({ state: 'hidden' })
          if (width === 390)
            await page.screenshot({
              path: `${output}/vault-phone-navigation.png`,
            })
          await open.click()
          await drawer
            .getByRole('button', { name: 'Notes', exact: true })
            .click()
          await page.locator('[data-shell-route="/notes"]').waitFor()
          await drawer.waitFor({ state: 'hidden' })
          await trigger(page, 'compact').click()
          await drawer
            .getByRole('button', { name: 'Home', exact: true })
            .click()
          await page.locator('[data-shell-route="/"]').waitFor()
          await drawer.waitFor({ state: 'hidden' })
        } finally {
          await page.close()
        }
      },
    )
    await run(
      `${width}px selecting another note closes the drawer`,
      async () => {
        const page = await newPage(width)
        try {
          const drawer = page.locator(drawerSelector)
          await trigger(page, 'vault').click()
          await drawer
            .getByRole('button', { name: 'Notes', exact: true })
            .click()
          await drawer.waitFor({ state: 'hidden' })
          const paths = []
          for (const title of ['Before shipping', 'Runs', 'Before shipping']) {
            await trigger(page, 'compact').click()
            await drawer
              .getByRole('button', { name: title, exact: true })
              .click()
            await drawer.waitFor({ state: 'hidden' })
            paths.push(
              await page
                .locator('[data-shell-route]')
                .getAttribute('data-shell-route'),
            )
            await page
              .locator('[data-appearance-part="main"] .milkdown')
              .filter({ visible: true })
              .first()
              .waitFor()
          }
          assert.notEqual(paths[0], paths[1])
          assert.equal(paths[0], paths[2])
          assert(paths.every((path) => path.startsWith('/notes/')))
        } finally {
          await page.close()
        }
      },
    )
  }
  await run(
    'Desktop Vault keeps the docked rail and hides the phone header',
    async () => {
      const page = await newPage(1440)
      try {
        assert(await page.locator('.appearance-docked-rail').isVisible())
        assert.equal(await trigger(page, 'vault').isVisible(), false)
        await page
          .locator('.appearance-docked-rail')
          .getByRole('button', { name: 'Home', exact: true })
          .click()
        await page.locator('[data-shell-route="/"]').waitFor()
      } finally {
        await page.close()
      }
    },
  )
  await run(
    'JSON applies the displayed export, stays live after import and copies current settings without losing a draft',
    async () => {
      const page = await newPage(390)
      try {
        await page
          .context()
          .grantPermissions(['clipboard-read', 'clipboard-write'])
        await page
          .locator('.appearance-vault-header')
          .getByRole('button', { name: 'Appearance', exact: true })
          .click()
        const dialog = page.getByRole('dialog', { name: 'Appearance settings' })
        await dialog.getByText('Custom appearance', { exact: true }).click()
        const field = dialog.getByRole('textbox', {
          name: 'Custom appearance JSON',
        })
        const apply = dialog.getByRole('button', {
          name: 'Apply custom appearance',
          exact: true,
        })
        const original = JSON.parse(await field.inputValue())
        await apply.click()
        await dialog
          .getByText('Appearance settings applied.', { exact: true })
          .waitFor()
        assert.deepEqual(JSON.parse(await field.inputValue()), original)

        const imported = { ...original, overrides: { density: 'compact' } }
        await field.fill(JSON.stringify(imported))
        await apply.click()
        await page.waitForFunction(
          () =>
            document.querySelector('select[aria-label="Density"]').value ===
            'compact',
        )
        await dialog
          .getByRole('combobox', { name: 'Density', exact: true })
          .selectOption('touch')
        assert.equal(
          JSON.parse(await field.inputValue()).overrides.density,
          'touch',
        )

        const draft = '{"unsaved":'
        await field.fill(draft)
        await dialog
          .getByRole('combobox', { name: 'Density', exact: true })
          .selectOption('comfortable')
        assert.equal(await field.inputValue(), draft)
        await dialog
          .getByRole('button', { name: 'Copy current settings', exact: true })
          .click()
        await dialog
          .getByRole('button', { name: 'Current settings copied', exact: true })
          .waitFor()
        const copied = JSON.parse(
          await page.evaluate(() => navigator.clipboard.readText()),
        )
        assert.equal(copied.overrides.density, 'comfortable')
        assert.equal(await field.inputValue(), draft)
        await apply.click()
        await dialog.getByText('Enter valid JSON.', { exact: true }).waitFor()
        assert.equal(await field.inputValue(), draft)
      } finally {
        await page.close()
      }
    },
  )
  await run('No uncaught browser errors', () => assert.deepEqual(errors, []))
} finally {
  await writeFile(
    `${output}/navigation-export.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        environment:
          'Local Vite, real components and router, deterministic story SDK transport',
        checks,
        errors,
      },
      null,
      2,
    ) + '\n',
  )
  await browser.close()
}
if (checks.some((check) => !check.passed)) process.exitCode = 1
