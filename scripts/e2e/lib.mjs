// SOURCING: playwright-core, which the story oracle already drives.
//
// A browser signed in as the test account, through the real sign-in page, with
// a running tally so a scenario exits non-zero when anything it checks fails.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, firefox } from 'playwright-core'
import { ACCOUNT, DATA_DIR, UI } from './config.mjs'

const BROWSER_STATE = join(DATA_DIR, 'browser-state.json')
export const SHOTS = join(DATA_DIR, 'shots')

// Playwright's own error messages carry the request log, session cookie included,
// so a crash says only what went wrong and where.
function crash(error) {
  const lines = String(error?.stack ?? error).split('\n')
  console.error(lines[0])
  console.error(lines.filter((line) => line.trim().startsWith('at ')).join('\n'))
  process.exit(1)
}
process.on('uncaughtException', crash)
process.on('unhandledRejection', crash)

// How long one read may take. A busy machine or a debug server can make a read
// slow; the scenario's own patience and its checks decide what that means.
export const READ = { timeout: 120_000 }

const failed = []

export function check(name, passed, detail = '') {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`)
  if (!passed) failed.push(name)
}

export function log(...parts) {
  console.log(new Date().toISOString().slice(11, 19), ...parts)
}

async function signIn(page) {
  await page.getByRole('button', { name: /sign in|continue/i }).first().click()
  await page.locator('input[name="login"]').waitFor()
  await page.locator('input[name="login"]').fill(ACCOUNT)
  // The development login takes any password; this one is thrown away.
  await page
    .locator('input[name="password"]')
    .fill(randomBytes(12).toString('hex'))
  await page.getByRole('button', { name: 'Sign-in' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL((url) => url.href.startsWith(UI) && !url.pathname.startsWith('/login'))
}

/** `browser: 'firefox'` is the Firefox installed on this machine, for what only Gecko does. */
export async function open(path = '/', { browser: name = 'chromium' } = {}) {
  mkdirSync(SHOTS, { recursive: true })
  // Full Chromium in new headless mode. The separate headless shell (Playwright
  // 1.64, revision 1248) never paints a frame on macOS 27, so every screenshot
  // and click waits forever. Firefox is the stock one, driven over WebDriver BiDi.
  const browser =
    name === 'firefox'
      ? await firefox.launch({ channel: 'moz-firefox' })
      : await chromium.launch({ channel: 'chromium' })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    storageState: existsSync(BROWSER_STATE) ? BROWSER_STATE : undefined,
  })
  const problems = []
  // Vite covers the page whenever a reload cuts off a request. A page that is
  // really broken still fails its checks, so say what it showed and carry on.
  context.on('page', (page) =>
    page.addLocatorHandler(page.locator('vite-error-overlay'), async (overlay) => {
      problems.push(`Vite: ${await overlay.locator('.message-body').innerText()}`)
      await overlay.evaluate((node) => node.remove())
    }),
  )
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  page.on('pageerror', (error) => problems.push(String(error).slice(0, 300)))
  page.on('response', async (response) => {
    if (response.status() < 400 || !response.url().includes('/api/')) return
    const method = response.request().method()
    // A refused write says why; a missing read needs no more than its address.
    const why =
      method === 'GET'
        ? ''
        : ` ${(await response.text().catch(() => '')).slice(0, 400)}`
    problems.push(
      `${response.status()} ${method} ${response.url().replace(UI, '').slice(0, 90)}${why}`,
    )
  })
  // A cold Vite or a server replaying its journal can take a while to answer.
  const asked = await context.request
    .get(`${UI}/api/chat/v1/bootstrap`, READ)
    .catch(() => {
      throw new Error(`${UI} did not answer the bootstrap request`)
    })
  if (asked.status() === 401) {
    // On a page of its own: the app is still starting when sign-in lands, and
    // Firefox drops a navigation asked for in the middle of that.
    const door = await context.newPage()
    await door.goto(`${UI}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await signIn(door)
    log('signed in as', ACCOUNT)
    await context.storageState({ path: BROWSER_STATE })
    await door.close()
  }
  await page.goto(UI + path, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  return { browser, context, page, problems }
}

/** Close the browser, say what went wrong along the way, and set the exit code. */
export async function finish({ browser, problems }) {
  console.log(
    problems.length
      ? `Errors seen:\n  ${[...new Set(problems)].join('\n  ')}`
      : 'No page or API errors',
  )
  await browser.close()
  console.log(failed.length ? `FAILED: ${failed.join('; ')}` : 'All checks passed')
  process.exit(failed.length ? 1 : 0)
}
