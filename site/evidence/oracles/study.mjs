// The study room, as a motion and interaction oracle: the Life on the wall and the
// canvas and the film on the tube all move, a pointer paints the Life where it
// reaches the wall or the canvas and not through the computer, a held field stays still, a fresh load is clean, and
// tesseract reads all three titles off the book spines in the opening shot.
//
//   CHROME_SHELL=... node evidence/oracles/study.mjs
// Without CHROME_SHELL, Playwright's own browser: PLAYWRIGHT_BROWSERS_PATH=0.
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const OUT = fileURLToPath(new URL('../renders/study/', import.meta.url))
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({
  executablePath: process.env.CHROME_SHELL,
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})

let failed = 0
const check = (claim, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${claim}${detail !== '' ? ` (${detail})` : ''}`)
  if (!ok) failed++
}

// At this viewport and the opening shot.
const VIEWPORT = { width: 1600, height: 900 }
// The bare wall between the left casing and the canvas, and the canvas's face: the Life falls on both.
const WALL = { x: 460, y: 20, width: 190, height: 200 }
const CANVAS = { x: 700, y: 20, width: 560, height: 220 }
const TUBE = { x: 510, y: 320, width: 200, height: 140 }
const SPINES = [
  { name: 'spines', clip: { x: 940, y: 565, width: 350, height: 165 }, titles: ['This Is for Everyone', 'The Dream Machine'] },
  // Gold serif on olive: a person reads it at once, and tesseract only with its band alone.
  { name: 'spine-hamming', clip: { x: 960, y: 602, width: 190, height: 48 }, titles: ['The Art of Doing Science', 'and Engineering'] },
]

const open = async (query = '', deviceScaleFactor = 1) => {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })
  await page.goto(`${BASE}/story/study${query}`)
  await page.waitForFunction(() => window.__study?.camera)
  await page.waitForTimeout(3000)
  return { page, errors }
}
const differs = async (page, clip) => {
  const before = await page.screenshot({ clip })
  await page.waitForTimeout(400)
  const after = await page.screenshot({ clip })
  return !before.equals(after)
}
const painted = (page) => page.evaluate(() => window.__study.painted())
const stroke = async (page, x, y, dx = 180) => {
  for (let i = 0; i <= 14; i++) {
    await page.mouse.move(x + (dx * i) / 14, y)
    await page.waitForTimeout(16)
  }
}

console.log('running')
{
  const { page, errors } = await open('?seed=20261106')
  check('a fresh load is clean', errors.length === 0, errors.slice(0, 3).join(' | '))
  check('the Life moves on the wall', await differs(page, WALL))
  check('the Life moves on the canvas', await differs(page, CANVAS))
  check('the film moves on the tube', await differs(page, TUBE))

  const start = await painted(page)
  await stroke(page, 470, 150, 160)
  const onWall = (await painted(page)) - start
  check('a stroke over the wall paints cells', onWall >= 15, onWall)

  const beforeCanvas = await painted(page)
  await stroke(page, 1000, 90)
  const onCanvas = (await painted(page)) - beforeCanvas
  check('a stroke over the canvas paints cells', onCanvas >= 15, onCanvas)

  await page.mouse.move(10, 890)
  await page.waitForTimeout(100)
  const before = await painted(page)
  await stroke(page, 520, 400)
  const onComputer = (await painted(page)) - before
  check('a stroke over the computer paints nothing', onComputer === 0, onComputer)
  await page.screenshot({ path: `${OUT}live-opening.png` })
  await page.context().close()
}

console.log('held')
{
  const { page } = await open('?held&seed=20261106')
  const moved = await differs(page, { x: 0, y: 0, width: 400, height: 120 })
  check('a held field is still', !moved)
  // The control for the running checks: the same clips stand still once the field is held, so what moved there was the Life.
  check('held, the wall and the canvas are still', !(await differs(page, WALL)) && !(await differs(page, CANVAS)))
  await page.context().close()
}

console.log('titles')
{
  const { page } = await open('?held&seed=20261106', 2)
  for (const { name, clip, titles } of SPINES) {
    const shot = `${OUT}${name}.png`
    await page.screenshot({ path: shot, clip })
    const read = execFileSync('tesseract', [shot, 'stdout', '--psm', '6'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    for (const title of titles) check(`the spine reads "${title}"`, read.includes(title), read.includes(title) ? '' : JSON.stringify(read))
  }
  await page.context().close()
}

await browser.close()
if (failed > 0) {
  console.log(`${failed} failed`)
  process.exit(1)
}
console.log('all passed')
