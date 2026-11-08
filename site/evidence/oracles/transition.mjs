// The brief's Pass 1 proof, as an interaction oracle: end, skip, app delay, media
// failure, app failure, return navigation, mobile resizing and reduced motion,
// driven through /story/experience against the fixture app. Screenshots land in
// evidence/renders/transition/.
//
//   PLAYWRIGHT_BROWSERS_PATH=0 node evidence/oracles/transition.mjs [case ...]
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const OUT = fileURLToPath(new URL('../renders/transition/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 375, height: 812 }
const CAMERA_MS = 800

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'],
})

const failures = []
let current = ''
const check = (claim, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : `FAIL [${current}]`} ${claim}${detail ? ` (${detail})` : ''}`)
  if (!ok) failures.push(`${current}: ${claim} ${detail}`)
}

async function open(query = '', { viewport = DESKTOP, reducedMotion } = {}) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  page.on('pageerror', (error) =>
    failures.push(`${current}: page error ${error.message}`),
  )
  await page.goto(`${BASE}/story/experience?${query}`)
  // In the room the stage lies on the tube, out of sight until the camera reaches it.
  await page.waitForSelector('.stage', { state: 'attached', timeout: 30_000 })
  await page.waitForTimeout(300)
  return page
}

const read = (page) =>
  page.evaluate(() => {
    const stage = document.querySelector('.stage')
    const frame = document.querySelector('iframe')
    const video = document.querySelector('video[slot=media]')
    const cover = document.querySelector('.stage-cover')
    return {
      phase: stage.dataset.phase,
      film: stage.dataset.film,
      app: stage.dataset.app,
      active: stage.dataset.active === 'true',
      layout: stage.dataset.layout,
      cover: cover?.dataset.up === 'true',
      frames: document.querySelectorAll('iframe').length,
      frameInert: frame?.inert ?? null,
      paused: video?.paused ?? null,
      time: video?.currentTime ?? null,
      history: history.length,
      hash: location.hash,
      mode: document.documentElement.dataset.mode,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
    }
  })

const child = (page) =>
  page.frames().find((frame) => frame.url().includes('demo-fixture'))
const childState = async (page) =>
  child(page).evaluate(() => {
    const main = document.querySelector('[data-fixture]')
    return {
      active: main.dataset.active === 'true',
      focusAsked: Number(main.dataset.focusAsked),
      focused: document.activeElement?.tagName === 'TEXTAREA',
      draft: document.querySelector('textarea').value,
    }
  })

const waitPhase = (page, phase, timeout = 15000) =>
  page.waitForFunction(
    (want) => document.querySelector('.stage').dataset.phase === want,
    phase,
    { timeout },
  )
// A headless clock can run a film slower than real time, so the film's end is
// awaited for what it is, and only the reveal after it is held to a deadline.
const waitFilmDone = (page) =>
  page.waitForFunction(
    () => document.querySelector('.stage').dataset.film === 'done',
    null,
    { timeout: 60000 },
  )
// In the room the reveal also waits for the camera to settle square to the tube
// (the tube's layer comes up then), so the deadline runs from the camera's arrival.
const waitReveal = async (page, timeout) => {
  const from = Date.now()
  if (await page.evaluate(() => document.documentElement.dataset.mode === 'scene'))
    await page.waitForSelector('.room[data-tube=true]', { state: 'attached', timeout: 10000 })
  const arrived = Date.now()
  await waitPhase(page, 'live', timeout)
  console.log(`    camera ${arrived - from} ms, then live ${Date.now() - arrived} ms`)
}
const waitActive = (page, timeout = 15000) =>
  page.waitForFunction(
    () => document.querySelector('.stage').dataset.active === 'true',
    null,
    { timeout },
  )
// In the room the objects are the ways in; the buttons wait for the keyboard, so they are pressed.
const watch = (page) =>
  page.getByRole('button', { name: /Watch and explore/ }).first().press('Enter')
const tryIt = (page) =>
  page.getByRole('button', { name: 'Try Theorem', exact: true }).first().press('Enter')
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` })
// A screenshot's mean grey, 0 to 255, by ffmpeg's area average.
const level = (png) =>
  execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=1:1:flags=area,format=gray', '-f', 'rawvideo', 'pipe:1'], { input: png })[0]
const glassOf = (page) => page.evaluate(() => document.querySelector('.room').dataset.glass)
const blendOf = (page) => page.evaluate(() => getComputedStyle(document.querySelector('.room-layer-screen')).mixBlendMode)

const cases = {
  async ambient() {
    const page = await open()
    const s = await read(page)
    check('opens ambient in the scene', s.phase === 'ambient' && s.mode === 'scene')
    check('no frame and no app load on mount', s.frames === 0 && s.app === 'idle')
    check('nothing has played', s.film === 'idle')
    await shot(page, 'ambient-wide')
    await page.context().close()
  },

  async computer() {
    const page = await open()
    // A visitor's way in is the computer itself: a click where the tube lies on its screen.
    await page.waitForSelector('.room canvas', { timeout: 20_000 })
    await page.waitForTimeout(1500)
    const tube = await page.locator('[data-surface=monitor]').first().boundingBox()
    const computer = () => page.mouse.click(tube.x + tube.width / 2, tube.y + tube.height / 2)
    await computer()
    await page.waitForTimeout(500)
    let s = await read(page)
    check('a click on the computer plays the film, with sound', s.phase === 'watching' && !s.paused && s.film === 'playing', `${s.phase}, ${s.film}, paused ${s.paused}`)
    check('the app loads behind it', s.app !== 'idle' && s.frames === 1)
    await waitFilmDone(page)
    await waitReveal(page, 1000)
    s = await read(page)
    check('Theorem is on the screen when the film ends', s.phase === 'live' && s.active && !s.frameInert)
    // Back to the room, then the computer again: the app as it was, never the film again.
    await page.getByRole('button', { name: 'Back to scene' }).click()
    await page.waitForTimeout(2600)
    await computer()
    await waitReveal(page, 5000)
    s = await read(page)
    check('a second click goes back to the app, with no replay', s.phase === 'live' && s.paused !== false && s.film === 'done', `${s.phase}, ${s.film}, paused ${s.paused}`)
    await page.context().close()
  },

  async glass() {
    // The app on the glass fades in over the film's last frame; the tube goes dark under it, and only then is the
    // app screened over the glass, so the picture never brightens past where it settles. Expanded, it is not screened.
    const page = await open()
    await page.waitForSelector('.room canvas', { timeout: 20_000 })
    await page.waitForTimeout(1500)
    await watch(page)
    // The middle of the tube, square on under the bar, from the first frame it is up.
    const clip = { x: DESKTOP.width / 2 - 320, y: 332, width: 640, height: 300 }
    await page.waitForFunction(() => document.querySelector('.room')?.dataset.tube === 'true', undefined, { timeout: 60_000, polling: 'raf' })
    const frames = []
    for (const from = Date.now(); Date.now() - from < 1600; )
      frames.push({ glass: await glassOf(page), png: await page.screenshot({ clip }) })
    const steps = frames.map((f) => f.glass).filter((glass, i, all) => glass !== all[i - 1]).join(' ')
    check('the glass goes off, dark, on, in that order', steps === 'off dark on', steps)
    const levels = frames.map((f) => level(f.png))
    const peak = Math.max(...levels)
    const settled = levels.at(-1)
    check('the reveal never brightens past where it settles', peak <= Math.max(levels[0], settled) + 2, `from ${levels[0]}, peak ${peak}, settled ${settled}`)
    check('on the glass the app is screened over the tube', (await blendOf(page)) === 'screen')
    await shot(page, 'glass-live')
    await page.getByRole('button', { name: 'Expand' }).click()
    await page.waitForTimeout(50)
    check('expanded, it lies over the room as it is', (await glassOf(page)) === 'dark' && (await blendOf(page)) === 'normal')
    await page.getByRole('button', { name: 'Back to the monitor' }).click()
    await page.waitForFunction(() => document.querySelector('.room').dataset.glass === 'on', undefined, { timeout: 2000 })
    check('back on the glass, it is screened again', (await blendOf(page)) === 'screen')
    await page.context().close()
  },

  async end() {
    const page = await open()
    await watch(page)
    await page.waitForTimeout(500)
    let s = await read(page)
    check('watching with sound-allowed play', s.phase === 'watching' && !s.paused, `paused=${s.paused}`)
    check('the app loads behind the film', s.app !== 'idle' && s.frames === 1)
    await page.waitForTimeout(CAMERA_MS + 400)
    s = await read(page)
    check('app ready during the film does not reveal it', s.phase === 'watching', s.app)
    await shot(page, 'end-watching')
    await waitFilmDone(page)
    await waitReveal(page, 1000)
    s = await read(page)
    check('live after the film ends', s.phase === 'live' && s.active && !s.frameInert)
    check('still is down', !s.cover)
    await page.waitForTimeout(200)
    const c = await childState(page)
    check('child activated', c.active)
    check('film end does not steal focus', !c.focused && c.focusAsked === 0)
    check('turn cue shown', (await page.locator('.nav-cue').textContent()) === 'Your turn')
    await shot(page, 'end-live')
    await page.context().close()
  },

  async skip() {
    const page = await open()
    await watch(page)
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: /^skip/i }).click()
    await waitPhase(page, 'live', 4000)
    const s = await read(page)
    check('skip completes the film condition', s.film === 'done' && s.paused === true)
    check('live with no wait for the end', s.time < 4 - 0.5, `t=${s.time}`)
    const c = await childState(page)
    check('skip does not move focus into the app', !c.focused)
    await page.context().close()
  },

  async delay() {
    const page = await open('delay=7000')
    await watch(page)
    await waitFilmDone(page)
    await page.waitForTimeout(400)
    let s = await read(page)
    check('film over, app not ready: preparing', s.phase === 'preparing', s.phase)
    check('still holds the frame', s.cover)
    check('frame stays inert', s.frameInert === true && !s.active)
    await page.waitForSelector('[role=status]')
    await shot(page, 'delay-preparing')
    await waitPhase(page, 'live', 6000)
    s = await read(page)
    check('reveals on ready and not before', s.phase === 'live' && !s.cover)
    await page.context().close()
  },

  async slow() {
    const page = await open('silent')
    await tryIt(page)
    await page.waitForTimeout(10000)
    let s = await read(page)
    check('silent app stays preparing', s.phase === 'preparing')
    check('slow state offers retry', await page.getByRole('button', { name: /retry|try again/i }).isVisible())
    await shot(page, 'slow-preparing')
    await page.waitForTimeout(11000)
    s = await read(page)
    check('a timeout is a failure, never readiness', s.phase === 'unavailable', s.phase)
    await page.context().close()
  },

  async mediaFailure() {
    const page = await open('film=broken')
    await watch(page)
    await page.waitForFunction(
      () => document.querySelector('.stage').dataset.film === 'failed',
      null,
      { timeout: 5000 },
    )
    let s = await read(page)
    check('film failure returns to ambient', s.phase === 'ambient')
    // The notice is on the stage in the flow, and in the viewport in the room, where the tube is out of sight.
    const notice = page.getByRole('alert').filter({ hasText: 'could not play' })
    check('the visitor is told, where they can see it', await notice.isVisible())
    await shot(page, 'media-failure')
    await notice.getByRole('button', { name: 'Try Theorem', exact: true }).click()
    await waitReveal(page, 4000)
    s = await read(page)
    check('direct entry still works', s.phase === 'live' && s.active)
    await page.waitForTimeout(200)
    const c = await childState(page)
    check('explicit Try may focus the message box', c.focused && c.focusAsked === 1, JSON.stringify({ focused: c.focused, asked: c.focusAsked }))
    await page.context().close()
  },

  async appFailure() {
    const page = await open('fail=down')
    await watch(page)
    await page.waitForTimeout(1500)
    let s = await read(page)
    check('app failure leaves the film running', s.phase === 'watching' && !s.paused)
    await waitPhase(page, 'unavailable', 60000)
    s = await read(page)
    check('then unavailable, over the still', s.phase === 'unavailable' && s.cover && !s.active)
    await shot(page, 'app-failure')
    const before = s.history
    await page.locator('.stage').getByRole('button', { name: /try again|retry/i }).click()
    await page.waitForTimeout(600)
    s = await read(page)
    check('retry adds no history', s.history === before, `${before} -> ${s.history}`)
    check('retry reused one frame', s.frames === 1)
    await page.context().close()
  },

  async returnNavigation() {
    const page = await open()
    const start = (await read(page)).history
    await tryIt(page)
    await waitReveal(page, 5000)
    await page.waitForTimeout(300)
    await child(page).evaluate(() => {
      window.__mark = 'same document'
    })
    await page.frameLocator('iframe').locator('textarea').fill('my own draft')
    await page.getByRole('link', { name: 'Possibilities', exact: true }).first().click()
    await page.waitForFunction(() => location.hash === '#possibilities')
    await page.waitForTimeout(CAMERA_MS + 300)
    let c = await childState(page)
    check('leaving deactivates the app', !c.active)
    await shot(page, 'return-possibilities')
    await page.goBack()
    await page.waitForTimeout(CAMERA_MS + 400)
    let s = await read(page)
    check('browser Back returns to the live app', s.phase === 'live' && s.active, s.phase)
    check('it never replays', s.film === 'done' && s.paused === true)
    c = await childState(page)
    check('the visitor draft survives', c.draft === 'my own draft' && c.active)
    check('same document, not reloaded', (await child(page).evaluate(() => window.__mark)) === 'same document')
    check('app loads added no history beyond the hash moves', s.history - start <= 3, `${start} -> ${s.history}`)
    await page.getByRole('button', { name: 'Back to scene' }).click()
    await page.waitForTimeout(CAMERA_MS + 300)
    s = await read(page)
    check('Back to scene goes wide', s.phase === 'ambient' && !s.active)
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? '')
    check('focus returns to the originating control', focused.includes('Try Theorem'), focused)
    await shot(page, 'return-wide')
    await page.context().close()
  },

  async replay() {
    const page = await open()
    await tryIt(page)
    await waitActive(page)
    await page.waitForTimeout(200)
    await child(page).evaluate(() => {
      window.__mark = 'kept'
    })
    await page.frameLocator('iframe').locator('textarea').fill('my own draft')
    await page.getByRole('button', { name: 'Back to scene' }).click()
    await page.waitForTimeout(800 + 300)
    await watch(page)
    await page.waitForTimeout(800 + 400)
    let s = await read(page)
    let c = await childState(page)
    check('replay covers and deactivates the app', s.phase === 'watching' && !s.active && !c.active)
    check('film is on top', await page.locator('.film').isVisible())
    await shot(page, 'replay-watching')
    await page.getByRole('button', { name: /^skip/i }).click()
    await waitActive(page)
    await page.waitForTimeout(200)
    c = await childState(page)
    check('the app comes back as it was', c.active && c.draft === 'my own draft')
    check('not reloaded', (await child(page).evaluate(() => window.__mark)) === 'kept')
    check('replay does not steal focus', !c.focused)
    await page.context().close()
  },

  async controls() {
    const page = await open()
    await watch(page)
    await page.waitForTimeout(1500)
    const bar = await page.evaluate(() => getComputedStyle(document.querySelector('media-control-bar')).opacity)
    check('controls stay visible with no pointer movement', bar === '1', bar)
    for (const name of [/^skip/i, /transcript/i]) {
      check(`labelled: ${name}`, await page.getByRole('button', { name }).first().isVisible())
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800 + 300)
    const s = await read(page)
    check('Escape leaves the film, in the parent', s.phase === 'ambient' && s.paused === true)
    await page.context().close()
  },

  async leaveDuringFilm() {
    const page = await open()
    await watch(page)
    await page.waitForTimeout(1200)
    await page.getByRole('link', { name: 'Join', exact: true }).first().click()
    await page.waitForTimeout(CAMERA_MS + 300)
    let s = await read(page)
    check('navigation stops the film', s.film === 'idle' && s.paused === true)
    await page.getByRole('link', { name: 'Experience', exact: true }).first().click()
    await page.waitForTimeout(CAMERA_MS + 300)
    s = await read(page)
    check('no replay on return', s.phase === 'ambient' && s.paused === true, s.phase)
    await page.context().close()
  },

  async draft() {
    const page = await open()
    await page.getByRole('link', { name: 'Possibilities', exact: true }).first().click()
    await page.waitForTimeout(CAMERA_MS + 300)
    const frames = (await read(page)).frames
    check('browsing examples loads no app', frames === 0)
    await page.getByRole('button', { name: /try this in theorem/i }).click()
    await waitActive(page)
    await page.waitForTimeout(400)
    let c = await childState(page)
    check('explicit click sets the draft', c.draft.length > 0)
    check('nothing submitted, frame URL unchanged', child(page).url().includes('site-embed='))
    await page.frameLocator('iframe').locator('textarea').fill('mine')
    await page.getByRole('link', { name: 'Possibilities', exact: true }).first().click()
    await page.waitForTimeout(CAMERA_MS + 300)
    await page.getByRole('button', { name: /try this in theorem/i }).click()
    await waitActive(page)
    await page.waitForTimeout(400)
    c = await childState(page)
    check('never overwrites a visitor draft', c.draft === 'mine', c.draft)
    check('the site says so', (await page.locator('.nav-cue').textContent())?.length > 0)
    await page.context().close()
  },

  async absent() {
    const page = await open('absent')
    await tryIt(page)
    await waitPhase(page, 'unavailable', 2500)
    const s = await read(page)
    check('no app configured: unavailable with no frame', s.app === 'absent' && s.frames === 0)
    // In the room the stage is on the tube, which the camera reaches after the phase is known.
    const join = page.locator('.stage').getByRole('link').first()
    await join.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    check('offers Join', await join.isVisible())
    await shot(page, 'absent')
    await page.context().close()
  },

  async mobile() {
    const page = await open('', { viewport: PHONE })
    let s = await read(page)
    check('phone is flow', s.mode === 'flow' && s.layout === 'phone')
    check('no sideways scroll', s.scrollWidth <= s.innerWidth, `${s.scrollWidth} > ${s.innerWidth}`)
    await shot(page, 'phone-top')
    await page.screenshot({ path: `${OUT}phone-full.png`, fullPage: true })
    await watch(page)
    await page.waitForTimeout(500)
    const seen = await page.evaluate(() => {
      const r = document.querySelector('.stage').getBoundingClientRect()
      return r.top >= 0 && r.bottom <= innerHeight
    })
    check('Watch brings the phone monitor into view', seen)
    await page.setViewportSize(DESKTOP)
    await page.waitForTimeout(CAMERA_MS + 400)
    s = await read(page)
    check('resizing to desktop keeps the film going', s.film === 'playing' && !s.paused && s.mode === 'scene', `${s.film} ${s.paused}`)
    await waitFilmDone(page)
    await waitReveal(page, 2000)
    await child(page).evaluate(() => {
      window.__mark = 'kept'
    })
    await page.setViewportSize(PHONE)
    await page.waitForTimeout(600)
    s = await read(page)
    check('resizing to phone keeps the app', s.phase === 'live' && s.layout === 'phone')
    check('frame is not reloaded', (await child(page).evaluate(() => window.__mark)) === 'kept')
    check('no sideways scroll when live', s.scrollWidth <= s.innerWidth, `${s.scrollWidth} > ${s.innerWidth}`)
    await page.locator('.stage').scrollIntoViewIfNeeded()
    await shot(page, 'phone-live')
    await page.context().close()
  },

  async reduced() {
    const page = await open('', { reducedMotion: true })
    let s = await read(page)
    check('reduced motion lands on flow', s.mode === 'flow')
    check('layout stays desktop at this width', s.layout === 'desktop')
    const running = await page.evaluate(() => document.querySelectorAll('video[autoplay]').length)
    check('nothing plays by itself', running === 0)
    await shot(page, 'reduced-top')
    await watch(page)
    await page.waitForTimeout(400)
    s = await read(page)
    check('film is still available on request', s.film === 'playing')
    await waitFilmDone(page)
    await waitPhase(page, 'live', 1000)
    s = await read(page)
    check('reveal with no camera condition', s.phase === 'live')
    await page.context().close()
  },
}

const wanted = process.argv.slice(2)
for (const [name, run] of Object.entries(cases)) {
  if (wanted.length && !wanted.includes(name)) continue
  current = name
  console.log(name)
  await run().catch((error) => {
    failures.push(`${name}: threw ${error.message.split('\n')[0]}`)
    console.log(`  FAIL [${name}] threw ${error.message.split('\n')[0]}`)
  })
}
await browser.close()
console.log(failures.length ? `\n${failures.length} failed:\n${failures.join('\n')}` : '\nAll passed.')
process.exit(failures.length ? 1 : 0)
