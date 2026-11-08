// SOURCING: Playwright drives the real page and the real app; ffmpeg's ssim and blend filters compare the pictures and make the collage. This only names the claim.
//
// The brief's central claim, as a static and interaction oracle: the film's final
// still and the live app it turns into agree on dimensions, theme, content, scroll,
// selection and initial state. Runs the whole film at each layout against the real
// app, then writes reference, render and difference into one collage.
//
//   PLAYWRIGHT_BROWSERS_PATH=0 node evidence/oracles/handoff.mjs
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const FILM = fileURLToPath(new URL('../../public/film/', import.meta.url))
const RENDERS = fileURLToPath(new URL('../renders/handoff/', import.meta.url))
const COLLAGES = fileURLToPath(new URL('../collages/handoff@2026-11-06/', import.meta.url))
const STATE = fileURLToPath(new URL('../../film/state/thread.json', import.meta.url))
mkdirSync(RENDERS, { recursive: true })
mkdirSync(COLLAGES, { recursive: true })

// At a desktop window the page is the room and the app is on the tube; with reduced
// motion the same window is the flat page, with the desktop monitor.
const LAYOUTS = {
  tube: {
    logical: [1014, 732],
    context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  },
  desktop: {
    logical: [1280, 720],
    context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' },
  },
  phone: {
    logical: [390, 720],
    context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  },
}

const failures = []
const check = (claim, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${claim}${detail ? ` (${detail})` : ''}`)
  if (!ok) failures.push(`${claim} ${detail}`)
}

const ssim = (a, b, [width, height]) => {
  const { stderr } = spawnSync(
    'ffmpeg',
    ['-v', 'info', '-i', a, '-i', b, '-lavfi',
      `[0:v]scale=${width}:${height},format=yuv420p[a];[1:v]scale=${width}:${height},format=yuv420p[b];[a][b]ssim`,
      '-f', 'null', '-'],
    { encoding: 'utf8' },
  )
  return Number(stderr.match(/All:([\d.]+)/)?.[1] ?? 0)
}

/** Reference, render, and their difference made four times brighter. */
const collage = (still, live, out, [width, height]) =>
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', still, '-i', live, '-filter_complex',
    `[0:v]scale=${width}:${height},format=rgb24,split[a][a2];[1:v]scale=${width}:${height},format=rgb24,split[b][b2];` +
    `[a2][b2]blend=all_mode=difference,lutrgb=r='val*4':g='val*4':b='val*4'[d];[a][b][d]hstack=inputs=3`,
    '-frames:v', '1', out])

const { threadId } = JSON.parse(readFileSync(STATE, 'utf8'))
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })

for (const [layout, { logical, context }] of Object.entries(LAYOUTS)) {
  console.log(`\n${layout}`)
  const page = await (await browser.newContext({ ...context, colorScheme: 'light' })).newPage()
  page.on('pageerror', (error) => failures.push(`page error: ${error.message}`))
  await page.goto(`${BASE}/story/experience?real&film=real`)
  // In the room the stage lies on the tube, out of sight until the camera reaches it.
  await page.waitForSelector('.stage', { state: 'attached', timeout: 30_000 })
  await page.waitForTimeout(400)
  // In the room the ways in wait for the keyboard, so Watch is pressed.
  await page.getByRole('button', { name: /watch/i }).first().press('Enter')
  await page.waitForFunction(() => document.querySelector('.stage').dataset.phase === 'watching')
  await page.waitForFunction(() => document.querySelector('.stage').dataset.phase === 'live', undefined, {
    timeout: 90000,
  })
  // The moment of the reveal, and the settled frame a little later.
  await page.waitForTimeout(700)
  const stage = page.locator('.stage')
  const shot = `${RENDERS}live-${layout}.png`
  await stage.screenshot({ path: shot })

  const frame = page.frames().find((candidate) => candidate.url().includes('site-embed='))
  check('the frame is the real thread', decodeURIComponent(frame.url()).includes(threadId), decodeURIComponent(frame.url()))
  const facts = await frame.evaluate(() => {
    const box = document.querySelector('[data-slot="aui_thread-viewport"]')
    const composer = document.querySelector('.aui-composer-input')
    return {
      width: innerWidth,
      height: innerHeight,
      dark: document.documentElement.classList.contains('dark'),
      gap: Math.round(box.scrollHeight - box.clientHeight - box.scrollTop),
      draft: composer.value,
      focused: document.activeElement === composer,
      selection: String(getSelection()),
      assistants: document.querySelectorAll('[data-role="assistant"]').length,
    }
  })
  const [width, height] = logical
  check('the page laid out this layout', (await stage.getAttribute('data-layout')) === layout, await stage.getAttribute('data-layout'))
  check('dimensions: the same logical size', facts.width === width && facts.height === height, `${facts.width}x${facts.height}`)
  check('theme: the same light theme', !facts.dark)
  check('content: both answers are there', facts.assistants === 2, String(facts.assistants))
  check('scroll: at the end of the thread', facts.gap <= 2, `${facts.gap} px from the end`)
  check('selection: nothing selected', facts.selection === '')
  check('initial state: an empty message box', facts.draft === '')
  check('the end of the film took no focus', !facts.focused)

  const still = `${FILM}final-${layout}.png`
  const match = ssim(still, shot, logical)
  check('the picture matches the still', match >= 0.9, `ssim ${match.toFixed(4)}`)
  collage(still, shot, `${COLLAGES}${layout}.png`, logical)
  await page.context().close()
}

await browser.close()
console.log(failures.length ? `\n${failures.length} failed:\n${failures.join('\n')}` : '\nAll passed.')
process.exit(failures.length ? 1 : 0)
