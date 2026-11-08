// The real Theorem app inside the monitor, against the local demo stack: it stays
// inert until activated, it says ready only after the composer is laid out, and
// mounting it starts no model turn.
//
//   PLAYWRIGHT_BROWSERS_PATH=0 node evidence/oracles/app-bridge.mjs
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const OUT = fileURLToPath(new URL('../renders/app-bridge/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] })
let failed = 0
const check = (claim, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${claim}${detail !== '' ? ` (${detail})` : ''}`)
  if (!ok) failed++
}

/**
 * Runs in every frame from creation: each change of what the app has laid out,
 * whether it is inert, and whether its composer has focus. A log kept by the frame
 * itself cannot race the site's phase the way sampling from outside can.
 */
const record = () => {
  if (window.parent === window) return
  const log = (window.__log = [])
  let last = ''
  const tick = () => {
    const composer = document.querySelector('.aui-composer-input')
    const now = [
      composer?.clientHeight ? 'composer' : 'empty',
      document.documentElement?.inert ? 'inert' : 'live',
      composer && document.activeElement === composer ? 'focused' : 'unfocused',
    ].join(' ')
    if (now !== last) log.push((last = now))
    requestAnimationFrame(tick)
  }
  tick()
}

async function open(viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport })
  await page.addInitScript(record)
  page.requests = []
  page.on('request', (r) => {
    if (r.frame() !== page.mainFrame() && r.resourceType() === 'fetch')
      page.requests.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  page.on('pageerror', (e) => console.log('  page error:', e.message.slice(0, 160)))
  return page
}
const childOf = (page) => page.frames().find((f) => f !== page.mainFrame())
const phaseOf = (page) => page.locator('.stage').getAttribute('data-phase')
const waitPhase = (page, phase, timeout = 60000) =>
  page.waitForFunction((p) => document.querySelector('.stage').dataset.phase === p, phase, { timeout })
const composer = (page) => page.frameLocator('iframe').locator('.aui-composer-input')
const tryButton = (page) => page.getByRole('button', { name: 'Try Theorem', exact: true }).first()

console.log('try: the real app')
{
  const page = await open()
  await page.goto(`${BASE}/story/experience?real`)
  // In the room the stage lies on the tube, out of sight until the camera reaches it.
  await page.waitForSelector('.stage', { state: 'attached', timeout: 30_000 })
  check('no frame before the visitor asks', (await page.locator('iframe').count()) === 0)
  const started = Date.now()
  await tryButton(page).press('Enter')
  // From the moment the frame exists: in the room it is in sight only at the reveal, by when a warm app is live.
  await page.waitForSelector('iframe', { state: 'attached' })
  check('the frame is inert from the site side until the reveal', await page.evaluate(() => document.querySelector('iframe').inert))
  await waitPhase(page, 'live')
  console.log(`    ready after ${Date.now() - started} ms`)
  await page.waitForTimeout(500)
  const child = childOf(page)
  const log = await child.evaluate(() => window.__log)
  console.log(`    ${log.join(' > ')}`)
  const shown = log.findIndex((l) => l.startsWith('composer'))
  check('the composer was not laid out at first', shown > 0)
  check('it was laid out inert', log[shown]?.includes('inert'), log[shown])
  check('input opens only after that', log.slice(shown).findIndex((l) => l.includes(' live')) > 0)
  const after = await child.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    url: location.search,
  }))
  check('explicit Try focused the composer', log.at(-1) === 'composer live focused', log.at(-1))
  // Each layout's logical size, as experience.tsx's LOGICAL: in the room the app lays out at the tube's.
  const layout = await page.evaluate(() => document.querySelector('.stage').dataset.layout)
  const want = { desktop: '1280x720', phone: '390x720', tube: '1014x732' }[layout]
  check('the logical size holds', `${after.width}x${after.height}` === want, `${layout}: ${after.width}x${after.height}, want ${want}`)
  check('the site chose the channel', /^\?site-embed=1\.[\w-]+$/.test(after.url), after.url)
  const writes = page.requests.filter((r) => !r.startsWith('GET'))
  console.log(`    fetches from the frame: ${[...new Set(page.requests)].join(', ')}`)
  check('nothing was written on mount', writes.length === 0, writes.join(', '))
  await page.screenshot({ path: `${OUT}real-live.png` })

  await composer(page).fill('A draft I have started')
  await page.getByRole('button', { name: 'Back to scene' }).click()
  await waitPhase(page, 'ambient')
  check('Back to scene deactivates the app', await child.evaluate(() => document.documentElement.inert))
  await page.getByRole('link', { name: 'Possibilities', exact: true }).first().click()
  await page.waitForTimeout(1100)
  await page.getByRole('button', { name: /try this in theorem/i }).click()
  await waitPhase(page, 'live')
  await page.waitForTimeout(600)
  let draft = await composer(page).inputValue()
  check('a visitor draft is never overwritten', draft === 'A draft I have started', draft)
  await composer(page).fill('')
  await page.getByRole('button', { name: 'Back to scene' }).click()
  await waitPhase(page, 'ambient')
  await page.getByRole('link', { name: 'Possibilities', exact: true }).first().click()
  await page.waitForTimeout(1100)
  await page.getByRole('button', { name: /try this in theorem/i }).click()
  await waitPhase(page, 'live')
  await page.waitForTimeout(600)
  draft = await composer(page).inputValue()
  check('an empty box takes the draft, unsent', draft.length > 20, draft.slice(0, 40))
  await page.screenshot({ path: `${OUT}real-draft.png` })

  await composer(page).fill('/')
  const menu = page.frameLocator('iframe').locator('[role="listbox"]').first()
  const opened = await menu.waitFor({ timeout: 15000 }).then(() => true, () => false)
  if (opened) {
    await composer(page).press('Escape')
    await page.waitForTimeout(500)
    check('Escape closes the app\'s own menu and stays', (await phaseOf(page)) === 'live')
  } else check('the slash menu opened', false)
  await composer(page).fill('')
  await menu.waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined)
  await composer(page).press('Escape')
  await waitPhase(page, 'ambient', 5000).catch(() => undefined)
  check('Escape in the frame reaches the site', (await phaseOf(page)) === 'ambient', await phaseOf(page))
  check('still nothing written', page.requests.filter((r) => !r.startsWith('GET')).length === 0)

  await page.getByRole('button', { name: /^Try Theorem|^Back to Theorem|^Open Theorem/ }).first().press('Enter')
  await waitPhase(page, 'live')
  const before = await page.evaluate(() => history.length)
  const href = await child.evaluate(() => location.href)
  const screen = () => child.evaluate(() => document.body.innerText.slice(0, 400))
  const was = await screen()
  await page.frameLocator('iframe').getByRole('button', { name: 'Index', exact: true }).click()
  await page.waitForTimeout(1500)
  check('the app really moved', (await screen()) !== was)
  check('app navigation adds nothing to the visitor\'s Back', (await page.evaluate(() => history.length)) === before)
  check('and leaves the frame\'s address alone', (await child.evaluate(() => location.href)) === href)
  await page.screenshot({ path: `${OUT}real-index.png` })
  await page.close()
}

console.log('watch: focus stays where it was')
{
  const page = await open()
  await page.goto(`${BASE}/story/experience?real`)
  await page.getByRole('button', { name: /^Watch/ }).first().press('Enter')
  await waitPhase(page, 'live', 120000)
  await page.waitForTimeout(500)
  const log = await childOf(page).evaluate(() => window.__log)
  check('the film\'s end takes no focus', log.at(-1) === 'composer live unfocused', log.at(-1))
  check('the page keeps it', await page.evaluate(() => document.activeElement?.tagName !== 'IFRAME'))
  await page.close()
}

for (const [claim, status] of [
  ['a signed-out visitor', 401],
  ['an unreachable service', 503],
]) {
  console.log(`failure: ${claim}`)
  const page = await open()
  await page.route('**/*', (route) => {
    const r = route.request()
    if (r.frame() !== page.mainFrame() && r.resourceType() === 'fetch')
      return route.fulfill({ status, contentType: 'application/json', body: '{"error":"no"}' })
    return route.continue()
  })
  await page.goto(`${BASE}/story/experience?real`)
  await tryButton(page).press('Enter')
  await waitPhase(page, 'unavailable', 60000).catch(() => undefined)
  const phase = await phaseOf(page)
  check('the site shows its own recovery', phase === 'unavailable', phase)
  // A quick refusal can land before the camera settles; the tube, and its retry, come up when it does.
  const retry = page.getByRole('button', { name: /try again/i })
  check('a retry is offered', await retry.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false))
  await page.screenshot({ path: `${OUT}failure-${status}.png` })
  await page.close()
}

await browser.close()
console.log(failed ? `\n${failed} failed` : '\nAll passed.')
process.exit(failed ? 1 : 0)
