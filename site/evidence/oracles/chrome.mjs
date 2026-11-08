// SOURCING: Playwright drives the experience story; ffmpeg stacks the before and after shots. This only names the claims.
//
// The quiet chrome, as a static, motion and interaction oracle. The header takes the
// room's paper and its links hold AA on it; Back and Expand stay in it. While the film
// plays and no one moves, its bar recedes by a transition but stays on screen and
// clickable; a pointer, a key, focus or a pause brings it back. Writes the shots and a
// before-and-after collage for each.
//
//   PLAYWRIGHT_BROWSERS_PATH=0 node evidence/oracles/chrome.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const RENDERS = fileURLToPath(new URL('../renders/chrome/', import.meta.url))
const COLLAGES = fileURLToPath(new URL('../collages/chrome@2026-11-08/', import.meta.url))
mkdirSync(RENDERS, { recursive: true })
mkdirSync(COLLAGES, { recursive: true })

let failed = 0
const check = (claim, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${claim}${detail !== '' ? ` (${detail})` : ''}`)
  if (!ok) failed++
}

/** WCAG relative luminance contrast between two computed rgb() colours. */
const contrast = (a, b) => {
  const lum = (css) => {
    const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
      const c = v / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
})
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })).newPage()
page.on('pageerror', (error) => check('no page error', false, error.message))
// The real film, long enough to idle over; the app is the fixture's.
await page.goto(`${BASE}/story/experience?film=real`)
await page.waitForSelector('.stage', { state: 'attached', timeout: 30_000 })
await page.waitForTimeout(400)
await page.getByRole('button', { name: /Watch and explore/ }).first().press('Enter')
await page.waitForFunction(() => document.querySelector('.stage').dataset.phase === 'watching')

const bar = () =>
  page.evaluate(() => {
    const el = document.querySelector('media-control-bar')
    const skip = [...el.querySelectorAll('button')].find((b) => /skip/i.test(b.textContent))
    const r = skip.getBoundingClientRect()
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return {
      opacity: Number(getComputedStyle(el).opacity),
      reachable: skip === hit || skip.contains(hit),
      transitions: document.getAnimations().filter((a) => a.transitionProperty && el.contains(a.effect?.target)).map((a) => a.transitionProperty),
    }
  })

console.log('the film bar')
{
  await page.waitForTimeout(900)
  check('full strength as the film starts', (await bar()).opacity === 1)
  // The idle clock starts at the last input, so start it here rather than at the key that pressed Watch: the film can take a while to load.
  await page.mouse.move(700, 420)
  const going = await page
    .waitForFunction(
      () => {
        const el = document.querySelector('media-control-bar')
        return document
          .getAnimations()
          .some((a) => a.transitionProperty === 'opacity' && el.contains(a.effect?.target))
      },
      undefined,
      { polling: 50, timeout: 5_000 },
    )
    .then(() => true, () => false)
  check('it recedes by a transition', going)
  await page.waitForTimeout(1_200)
  const quiet = await bar()
  check('receded, it stays on screen', quiet.opacity >= 0.4 && quiet.opacity <= 0.6, quiet.opacity.toFixed(2))
  check('receded, Skip still takes a click', quiet.reachable)
  await page.screenshot({ path: `${RENDERS}film-receded.png` })

  await page.mouse.move(700, 400)
  await page.waitForTimeout(450)
  check('a pointer anywhere brings it back', (await bar()).opacity === 1)
  await page.screenshot({ path: `${RENDERS}film-awake.png` })

  await page.waitForTimeout(3_400)
  await page.keyboard.press('Shift')
  await page.waitForTimeout(450)
  check('a key brings it back', (await bar()).opacity === 1)

  await page.getByRole('button', { name: /^skip/i }).first().focus()
  await page.waitForTimeout(3_400)
  check('focus inside keeps it', (await bar()).opacity === 1)
  await page.evaluate(() => document.activeElement.blur())

  await page.evaluate(() => document.querySelector('media-controller video').pause())
  await page.waitForTimeout(3_400)
  check('paused, it stays at full strength', (await bar()).opacity === 1)
  check('Back to scene is in the header while the film plays', await page.getByRole('button', { name: /back to scene/i }).isVisible())
  await page.getByRole('button', { name: /^skip/i }).first().click()
}

console.log('the header')
{
  await page.waitForFunction(() => document.querySelector('.room').dataset.glass === 'on', null, { timeout: 90_000 })
  await page.waitForTimeout(600)
  await page.mouse.move(720, 420)
  const header = await page.evaluate(() => {
    const nav = document.querySelector('.site-nav')
    const links = [...nav.querySelectorAll('.nav-link')].filter((a) => a.offsetParent)
    return {
      background: getComputedStyle(nav).backgroundColor,
      room: getComputedStyle(document.documentElement).getPropertyValue('--room-paper').trim(),
      links: links.map((a) => ({ text: a.textContent, current: a.hasAttribute('aria-current'), color: getComputedStyle(a).color })),
      cue: getComputedStyle(nav.querySelector('.nav-cue')).color,
    }
  })
  check('the bar takes the room\'s paper', header.background === 'rgb(224, 229, 236)' && header.room === '#e0e5ec', header.background)
  for (const link of header.links) {
    const ratio = contrast(link.color, header.background)
    check(`"${link.text}" holds AA on it`, ratio >= 4.5, ratio.toFixed(2))
  }
  const others = header.links.filter((link) => !link.current)
  const current = header.links.find((link) => link.current)
  check('links not current are quieter than the current one',
    others.every((link) => contrast(link.color, header.background) < contrast(current.color, header.background)))
  check('"Your turn" holds AA on it', contrast(header.cue, header.background) >= 4.5, contrast(header.cue, header.background).toFixed(2))
  for (const name of [/back to scene/i, /expand/i]) check(`${name.source} stays in the header`, await page.getByRole('button', { name }).isVisible())
  await page.screenshot({ path: `${RENDERS}live.png` })
}

const stack = (before, after, out) =>
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', before, '-i', after, '-filter_complex', 'hstack=inputs=2', '-frames:v', '1', out])
for (const [before, after] of [['before-film', 'film-receded'], ['before-live', 'live']]) {
  if (existsSync(`${RENDERS}${before}.png`)) stack(`${RENDERS}${before}.png`, `${RENDERS}${after}.png`, `${COLLAGES}${after}.png`)
}

await browser.close()
if (failed > 0) {
  console.log(`${failed} failed`)
  process.exit(1)
}
console.log('all passed')
