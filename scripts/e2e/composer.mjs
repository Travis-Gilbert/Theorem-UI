// Native browser behavior around the actual ComposerEditor and assistant-ui
// form. No Theorem server or model call is made. E2E_CHROMIUM may identify an
// installed browser; otherwise install playwright-core's expected Chromium.
//
//   node scripts/e2e/composer.mjs
//   node scripts/e2e/composer.mjs --built
import { chromium } from 'playwright-core'
import { servePage } from './harness.mjs'

const served = await servePage('composer')
const checks = []
const check = (name, pass, detail) => {
  checks.push(pass)
  console.log(
    `${pass ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`,
  )
}
let browser

try {
  browser = await chromium.launch({
    executablePath: process.env.E2E_CHROMIUM || undefined,
  })
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(served.url)
  const input = page.getByRole('textbox', { name: 'Message input' })
  await input.waitFor()
  const sent = () => page.getByTestId('sent-count').textContent()
  const submits = () => page.getByTestId('submit-count').textContent()
  const draft = () => page.getByTestId('draft').textContent()
  const load = async (name) => {
    await page
      .getByRole('button', { name: `Load ${name}`, exact: true })
      .click()
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="sent-count"]').textContent ===
        '0',
    )
  }

  await load('Plain')
  await input.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Second paragraph')
  check(
    'Enter writes another paragraph without submitting',
    (await sent()) === '0' &&
      (await submits()) === '0' &&
      (await draft()) === 'First paragraph\n\nSecond paragraph',
    await draft(),
  )
  await page.keyboard.press('Control+Enter')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="sent-count"]').textContent === '1',
  )
  check(
    'Control+Enter submits exactly the document shown',
    (await submits()) === '1' &&
      (await page.getByTestId('sent').textContent()) ===
        JSON.stringify(['First paragraph\n\nSecond paragraph']),
  )

  await load('Code')
  const code = page.locator('.cm-content')
  await code.waitFor({ state: 'visible' })
  await code.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('const second = 2')
  check(
    'Enter edits the real CodeMirror block without submitting',
    (await sent()) === '0' &&
      (await submits()) === '0' &&
      (await draft()).includes('const first = 1\nconst second = 2'),
    await draft(),
  )
  await page.keyboard.press('Control+Enter')
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="sent-count"]').textContent === '1',
  )
  check(
    'Control+Enter from CodeMirror submits once and keeps its code fence',
    (await submits()) === '1' &&
      (await page.getByTestId('sent').textContent()) ===
        JSON.stringify(['```ts\nconst first = 1\nconst second = 2\n```']),
  )

  await load('List')
  await input.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Second item')
  check(
    'Enter continues a list without submitting',
    (await sent()) === '0' &&
      (await submits()) === '0' &&
      (await input.locator('li').count()) === 2,
    await draft(),
  )

  await load('Code')
  await code.waitFor({ state: 'visible' })
  await page.locator('.language-button').click()
  const language = page.getByPlaceholder('Search language')
  await language.fill('typescript')
  await language.press('Enter')
  check(
    'Enter in the language search does not submit the surrounding form',
    (await sent()) === '0' && (await submits()) === '0',
    { sent: await sent(), submits: await submits() },
  )

  await load('Code')
  await code.waitFor({ state: 'visible' })
  const copy = page.locator('.copy-button')
  await copy.click()
  await copy.focus()
  await copy.press('Enter')
  check(
    'copy button click and keyboard activation do not submit',
    (await sent()) === '0' && (await submits()) === '0',
    { sent: await sent(), submits: await submits() },
  )

  await load('Markdown')
  await input.click()
  await page.keyboard.press('Control+a')
  const bold = page.locator('[data-toolbar-item="bold"]')
  await bold.waitFor({ state: 'visible' })
  await bold.click()
  check(
    'selection toolbar formatting leaves the message in the composer',
    (await sent()) === '0' &&
      (await submits()) === '0' &&
      (await draft()) === '**Select this text**',
    await draft(),
  )

  await load('Markdown')
  await input.click()
  await page.keyboard.press('Control+a')
  const link = page.locator('[data-toolbar-item="link"]')
  await link.waitFor({ state: 'visible' })
  await link.click()
  const address = page.locator('.milkdown-link-edit .input-area')
  await address.waitFor({ state: 'visible' })
  await address.fill('https://example.com/docs')
  await address.press('Enter')
  check(
    'Enter in the link address applies the link without sending the message',
    (await sent()) === '0' &&
      (await submits()) === '0' &&
      (await draft()) === '[Select this text](https://example.com/docs)',
    await draft(),
  )
  check(
    'the composer raised no browser errors',
    pageErrors.length === 0,
    pageErrors,
  )
} finally {
  await browser?.close()
  await served.close()
}

const passed = checks.filter(Boolean).length
console.log(`\n${passed} of ${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
