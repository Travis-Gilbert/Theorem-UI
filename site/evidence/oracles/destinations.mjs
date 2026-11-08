// Possibilities and Join as interaction oracles, and the real signup: run against
// `wrangler dev` so the form talks to the actual Worker and its KV binding.
//
//   BASE=http://127.0.0.1:8799 PLAYWRIGHT_BROWSERS_PATH=0 node evidence/oracles/destinations.mjs
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://127.0.0.1:8799'
const OUT = fileURLToPath(new URL('../renders/destinations/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] })
let failed = 0
const check = (claim, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${claim}${detail !== '' ? ` (${detail})` : ''}`)
  if (!ok) failed++
}
const CAMERA = 1100
// The pad: a section of the flow, or a sheet laid on the study's pad.
const JOIN = '[data-surface=pad]'

console.log('possibilities')
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE}/#possibilities`)
  await page.waitForTimeout(1500)
  check('a URL restores the destination', await page.locator('[data-heading=possibilities]').isVisible())
  const tabs = page.getByRole('tab')
  check('three tabs', (await tabs.count()) === 3)
  const seen = new Set()
  for (let i = 0; i < 3; i++) {
    await tabs.nth(i).click()
    await page.waitForTimeout(250)
    const panel = page.getByRole('tabpanel')
    seen.add(await panel.innerText())
    check(`tab ${i + 1} changes the same surface`, seen.size === i + 1 && (await panel.locator('ol li').count()) >= 2)
    await page.screenshot({ path: `${OUT}possibilities-${i + 1}.png` })
  }
  await tabs.nth(0).focus()
  await page.keyboard.press('ArrowRight')
  check('arrow keys move between tabs', (await tabs.nth(1).getAttribute('aria-selected')) === 'true')
  const hiddenTry = await page.getByRole('button', { name: /try this in theorem/i }).count()
  check('no app configured: no promise of trying it', hiddenTry === 0, hiddenTry)
  await page.close()
}

console.log('join')
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const posts = []
  page.on('response', (r) => {
    if (r.request().method() === 'POST') posts.push(`${r.url().replace(BASE, '')} ${r.status()}`)
  })
  await page.goto(`${BASE}/`)
  await page.getByRole('link', { name: 'Join', exact: true }).first().click()
  // Before the room has loaded, focus waits for the pad's sheet to mount with it.
  await page.waitForFunction(() => document.activeElement?.dataset?.heading === 'join', null, { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(CAMERA)
  const focused = await page.evaluate(() => document.activeElement?.dataset?.heading)
  check('focus moves to the heading', focused === 'join', focused)
  await page.screenshot({ path: `${OUT}join.png` })
  const email = page.getByRole('textbox')
  const submit = page.locator(JOIN).getByRole('button', { name: 'Join', exact: true })
  await email.fill('not-an-email')
  await submit.click()
  await page.waitForTimeout(400)
  check('the browser or the Worker rejects a bad address', !(await page.locator(JOIN).innerText()).includes('joined'))
  const unique = `oracle-${Date.now()}@example.com`
  await email.fill(unique)
  await submit.click()
  await page.waitForTimeout(800)
  let text = await page.locator(JOIN).innerText()
  check('a real POST reaches the Worker', posts.some((p) => p.endsWith('200') || p.endsWith('201')), posts.join(', '))
  await page.screenshot({ path: `${OUT}join-joined.png` })
  console.log(`    joined state: ${text.split('\n').slice(2, 4).join(' | ')}`)
  await page.reload()
  await page.waitForTimeout(1500)
  await page.getByRole('textbox').fill(unique)
  await page.locator(JOIN).getByRole('button', { name: 'Join', exact: true }).click()
  await page.waitForTimeout(800)
  text = await page.locator(JOIN).innerText()
  console.log(`    second time: ${text.split('\n').slice(2, 4).join(' | ')}`)
  check('a second signup is told so', /already/i.test(text))
  for (const name of ['How it works', 'Our thinking', 'Documentation', 'Source']) {
    const href = await page.locator(JOIN).getByRole('link', { name }).getAttribute('href')
    const status = await fetch(new URL(href, BASE)).then((r) => r.status, () => 0)
    check(`${name} resolves`, status === 200, `${href} ${status}`)
  }
  await page.close()
}

console.log('reading pages')
for (const [path, heading] of [
  ['/how-it-works', 'A personal agent for the things you want to understand, try, and bring to life.'],
  ['/our-thinking', 'Computing built around people.'],
]) {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    await page.goto(`${BASE}${path}`)
    await page.waitForTimeout(800)
    check(`${path} at ${viewport.width} shows its heading`, await page.getByRole('heading', { level: 1, name: heading }).isVisible())
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    check(`${path} at ${viewport.width} has no sideways scroll`, sideways <= 0, sideways)
    await page.screenshot({ path: `${OUT}${path.slice(1)}-${viewport.width}.png`, fullPage: true })
    await page.getByRole('link', { name: 'Join', exact: true }).first().click()
    await page.waitForTimeout(CAMERA)
    check(`${path} at ${viewport.width} leads back to Join`, await page.locator('[data-heading=join]').isVisible())
    await page.close()
  }
}

console.log('failure of the signup endpoint')
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.route('**/api/**', (route) => route.abort())
  await page.goto(`${BASE}/#join`)
  await page.waitForTimeout(1500)
  await page.getByRole('textbox').fill('down@example.com')
  await page.locator(JOIN).getByRole('button', { name: 'Join', exact: true }).click()
  await page.waitForTimeout(600)
  const text = await page.locator(JOIN).innerText()
  console.log(`    says: ${text.split('\n').slice(2, 5).join(' | ')}`)
  check('says it failed', /could not|try again|did not|wrong/i.test(text))
  await page.screenshot({ path: `${OUT}join-failed.png` })
  await page.close()
}

console.log('the real no-app build')
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE}/`)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Try Theorem', exact: true }).first().press('Enter')
  await page.waitForTimeout(CAMERA)
  const stage = page.locator('.stage')
  check('honest about the app', (await stage.getAttribute('data-phase')) === 'unavailable')
  check('no frame', (await page.locator('iframe').count()) === 0)
  await page.screenshot({ path: `${OUT}absent.png` })
  await stage.getByRole('link').first().click()
  await page.waitForTimeout(CAMERA)
  check('and sends the visitor to Join', page.url().endsWith('#join'))
  await page.close()
}

console.log('copy budget')
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE}/`)
  // In the room the pad's sheet mounts with the room.
  await page.waitForSelector(JOIN, { state: 'attached', timeout: 15_000 })
  await page.waitForTimeout(800)
  const words = await page.evaluate(() => {
    const count = (el) => (el?.innerText ?? '').split(/\s+/).filter(Boolean).length
    // In the room the intro's words are there for a screen reader and the keyboard, and they still count.
    return { intro: count(document.getElementById('experience')), join: count(document.querySelector('[data-surface=pad]')) }
  })
  let possibilities = 0
  await page.goto(`${BASE}/#possibilities`)
  await page.waitForTimeout(1200)
  const head = await page.locator('[data-heading=possibilities]').innerText()
  possibilities += head.split(/\s+/).length
  const tabs = page.getByRole('tab')
  for (let i = 0; i < 3; i++) {
    await tabs.nth(i).click()
    await page.waitForTimeout(120)
    possibilities += (await tabs.nth(i).innerText()).split(/\s+/).length
    possibilities += (await page.getByRole('tabpanel').innerText()).split(/\s+/).filter(Boolean).length
  }
  const total = words.intro + words.join + possibilities
  console.log(`    intro ${words.intro}, possibilities ${possibilities}, join ${words.join}: ${total}`)
  check('near 180 to 250 words', total >= 160 && total <= 270, total)
  await page.close()
}

await browser.close()
console.log(failed ? `\n${failed} failed` : '\nAll passed.')
process.exit(failed ? 1 : 0)
