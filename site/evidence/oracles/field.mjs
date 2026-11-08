// The Life field's behaviour, as a motion and interaction oracle: it moves, what
// dies fades in gold, the pointer brings real cells to life over empty paper and
// only there, each load is a new field, it goes quiet at the monitor, and it
// holds under reduced motion.
//
//   PLAYWRIGHT_BROWSERS_PATH=0 node evidence/oracles/field.mjs
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const OUT = fileURLToPath(new URL('../renders/field/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_SHELL })

let failed = 0
const check = (claim, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${claim}${detail !== '' ? ` (${detail})` : ''}`)
  if (!ok) failed++
}
const open = async (path, { reducedMotion } = {}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  await page.goto(`${BASE}${path}`)
  await page.waitForFunction(() => window.__field)
  await page.waitForTimeout(1200)
  return page
}
const measure = (page, ms = 1500) => page.evaluate((m) => window.__field.measure(m), ms)
const painted = (page) => page.evaluate(() => window.__field.painted())
const alive = (page, x, y, r) => page.evaluate(([a, b, c]) => window.__field.aliveNear(a, b, c), [x, y, r])
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
const stroke = async (page, x, y, dx = 180) => {
  for (let i = 0; i <= 14; i++) {
    await page.mouse.move(x + (dx * i) / 14, y + Math.sin(i / 2) * 10)
    await page.waitForTimeout(16)
  }
}

console.log('alone')
{
  const page = await open('/story/field')
  const before = await measure(page, 2500)
  check('it moves', before.moved > 0, before.moved.toFixed(3))
  check('cells are 7 to 9 px', Math.abs(1440 / before.cols - 8) < 1.1, (1440 / before.cols).toFixed(1))
  check('a modest population', before.density > 0.003 && before.density < 0.08, before.density.toFixed(4))
  check('what dies fades in gold', before.gilded > 0.6, before.gilded.toFixed(2))
  await page.screenshot({ path: `${OUT}alone.png` })

  const paintedBefore = await painted(page)
  // A window around the whole stroke, and the cells new in it: colonies already there come and go by themselves, so a count alone says nothing.
  const aliveBefore = await alive(page, 590, 450, 14)
  await stroke(page, 500, 450)
  const paintedNow = await painted(page)
  const aliveNow = await alive(page, 590, 450, 14)
  const fresh = aliveNow.filter((cell) => !aliveBefore.includes(cell))
  check('the pointer brings cells to life', paintedNow - paintedBefore >= 15, paintedNow - paintedBefore)
  check('they are alive in the simulation', fresh.length >= 10, `${fresh.length} new, ${aliveNow.length} in all`)
  await page.screenshot({
    path: `${OUT}pointer-stroke.png`,
    clip: { x: 440, y: 330, width: 400, height: 240 },
  })
  await page.mouse.move(10, 10)
  await page.waitForTimeout(800)
  const later = await alive(page, 590, 450, 14)
  check('they go on by the rule', !same(aliveNow, later), `${aliveNow.length} to ${later.length}`)
  await page.screenshot({
    path: `${OUT}pointer-stroke-later.png`,
    clip: { x: 440, y: 330, width: 400, height: 240 },
  })
  const settled = await measure(page, 1500)
  check('injection stays bounded', settled.density < before.density + 0.04, settled.density.toFixed(4))
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(200)
  const hidden = await Promise.race([
    measure(page, 400).then((m) => m.frames),
    new Promise((resolve) => setTimeout(() => resolve(0), 1500)),
  ])
  check('a hidden page does no work', hidden <= 1, hidden)
  await page.context().close()
}

console.log('on the page')
{
  const page = await open('/story/experience')
  // A control a pointer can reach on either page: the bar's link to Join.
  const box = await page.getByRole('link', { name: 'Join', exact: true }).first().boundingBox()
  const from = await painted(page)
  await page.mouse.move(box.x + 4, box.y + box.height / 2)
  await page.waitForTimeout(100)
  await stroke(page, box.x + 4, box.y + box.height / 2, box.width - 8)
  check('quiet over a control', (await painted(page)) === from)
  // The flat page's words; the room has none over it, only its objects.
  if (await page.locator('.intro-heading').count()) {
    const words = await page.locator('.intro-heading').boundingBox()
    await page.mouse.move(words.x + 10, words.y + 40)
    await stroke(page, words.x + 10, words.y + 40, words.width - 20)
    check('quiet over the words', (await painted(page)) === from)
  }
  // Across the middle of the monitor's screen: in the room, the tube on the computer.
  const monitor = await page.locator('[data-surface=monitor]').first().boundingBox()
  const across = { x: monitor.x + monitor.width * 0.2, y: monitor.y + monitor.height / 2 }
  await page.mouse.move(across.x, across.y)
  await stroke(page, across.x, across.y, monitor.width * 0.6)
  check('quiet over the monitor', (await painted(page)) === from)
  const a = await page.evaluate(() => window.__field.aliveNear(innerWidth / 2, innerHeight / 2, 400))
  await page.screenshot({ path: `${OUT}page-wide.png` })

  // The click starts the frame loading; nothing here is waiting on that load.
  await page.getByRole('button', { name: 'Try Theorem', exact: true }).first().press('Enter')
  await page.waitForTimeout(1400)
  const quiet = await Promise.race([
    measure(page, 500).then((m) => m.frames),
    new Promise((resolve) => setTimeout(() => resolve(0), 1500)),
  ])
  check('held at the monitor', quiet <= 2, quiet)
  await page.context().close()
  const again = await open('/story/experience')
  const b = await again.evaluate(() => window.__field.aliveNear(innerWidth / 2, innerHeight / 2, 400))
  check('each load is a new field', !same(a, b), `${a.length} and ${b.length} cells`)
  await again.context().close()
}

console.log('reduced motion')
{
  const page = await open('/story/experience', { reducedMotion: true })
  const held = await Promise.race([
    measure(page, 500).then((m) => m.frames),
    new Promise((resolve) => setTimeout(() => resolve(0), 1500)),
  ])
  check('starts static', held <= 2, held)
  await page.getByRole('button', { name: /start the motion|resume|motion/i }).first().click()
  await page.waitForTimeout(400)
  const moving = await measure(page, 2000)
  check('the motion control opts in', moving.frames > 3, moving.frames)
  await page.context().close()
}

await browser.close()
console.log(failed ? `\n${failed} failed` : '\nAll passed.')
process.exit(failed ? 1 : 0)
