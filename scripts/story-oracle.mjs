#!/usr/bin/env node
// SOURCING: playwright-core drives the story URLs, pixelmatch and pngjs make the perceptual diff, sharp reads the references and lays out the collage. This is the one driver ui-graph-plans asks for; it never navigates the app or picks selectors of its own.
//
//   node scripts/story-oracle.mjs list
//   node scripts/story-oracle.mjs shot <id|all>
//   node scripts/story-oracle.mjs diff <id|all>      reference, render and heatmap in one collage
//   node scripts/story-oracle.mjs motion <id>        animation names, and two frames 400ms apart
//
// STORY_ORIGIN picks the dev server. A collage's number is reported, never a verdict: a person seals it.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright-core'
import { PNG } from 'pngjs'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EVIDENCE = join(ROOT, 'docs/plans/evidence')
const ORIGIN = process.env.STORY_ORIGIN ?? 'http://localhost:3102'
/** Pixelmatch's per-pixel threshold, the declared tolerance. */
const THRESHOLD = 0.2

/** The dev server's own floating buttons are not part of any component. */
const DEV_OVERLAYS = 'body > div:not(:has([data-story])):not([data-story]) { display: none !important; }'

const list = async () => {
  const response = await fetch(`${ORIGIN}/stories.json`)
  if (!response.ok) throw new Error(`${ORIGIN}/stories.json answered ${response.status}`)
  return response.json()
}

async function withPage(story, run, { reducedMotion = 'reduce' } = {}) {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({
      // Desktop width either way, so responsive classes read as they do in the shell.
      viewport: { width: Math.max(story.viewport.width, 1280), height: story.viewport.height },
      colorScheme: 'dark',
      reducedMotion,
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()
    const failures = []
    page.on('pageerror', (error) => failures.push(String(error).slice(0, 400)))
    await page.goto(`${ORIGIN}/story/${story.id}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-story-ready]', { state: 'attached', timeout: 90_000 })
    await page.addStyleTag({ content: DEV_OVERLAYS })
    // Query data has landed; lazy viewers and media decode on their own time.
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('video, audio')].every((m) => m.readyState >= 2) &&
          ![...document.querySelectorAll('[data-story] *')].some(
            (el) => !el.children.length && el.textContent === 'Loading…',
          ),
        null,
        { timeout: 20_000 },
      )
      .catch(() => console.error(`${story.id}: media or viewers still loading`))
    await page.waitForTimeout(600)
    const result = await run(page)
    if (failures.length) console.error(`${story.id}: page errors\n${failures.join('\n')}`)
    return result
  } finally {
    await browser.close()
  }
}

const renderPath = (id) => join(EVIDENCE, 'renders', `${id}.png`)

async function shot(story) {
  mkdirSync(join(EVIDENCE, 'renders'), { recursive: true })
  const clip = { x: 0, y: 0, ...story.viewport }
  await withPage(story, (page) => page.screenshot({ path: renderPath(story.id), clip }))
  console.log(`${story.id}: ${renderPath(story.id)}`)
}

const label = (text, width) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24"><rect width="100%" height="100%" fill="#101010"/><text x="8" y="16" font-family="sans-serif" font-size="12" fill="#e6e6e6">${text}</text></svg>`,
  )

async function diff(story) {
  await shot(story)
  const { width, height } = story.viewport
  let reference = sharp(join(EVIDENCE, 'refs', story.reference))
  if (story.region) {
    const [left, top, w, h] = story.region
    reference = reference.extract({ left, top, width: w, height: h })
  }
  const flat = { fit: 'contain', background: '#000000' }
  const asPng = (input) =>
    sharp(input).resize(width, height, flat).ensureAlpha().png().toBuffer()
  const referenceBytes = await asPng(await reference.png().toBuffer())
  const renderBytes = await asPng(renderPath(story.id))
  const a = PNG.sync.read(referenceBytes)
  const b = PNG.sync.read(renderBytes)
  const heat = new PNG({ width, height })
  const mismatched = pixelmatch(a.data, b.data, heat.data, width, height, { threshold: THRESHOLD })
  const ratio = mismatched / (width * height)

  const gap = 12
  const collage = sharp({
    create: {
      width: width * 3 + gap * 2,
      height: height + 24,
      channels: 4,
      background: '#101010',
    },
  }).composite([
    { input: label(`Reference: ${story.reference}`, width), left: 0, top: 0 },
    { input: label(`Render: /story/${story.id}`, width), left: width + gap, top: 0 },
    { input: label(`Diff at ${THRESHOLD}: ${(ratio * 100).toFixed(1)}% differs`, width), left: (width + gap) * 2, top: 0 },
    { input: referenceBytes, left: 0, top: 24 },
    { input: renderBytes, left: width + gap, top: 24 },
    { input: PNG.sync.write(heat), left: (width + gap) * 2, top: 24 },
  ])
  const out = join(EVIDENCE, 'collages', `${story.id}.png`)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, await collage.png().toBuffer())
  console.log(`${story.id}: ${(ratio * 100).toFixed(1)}% differs at ${THRESHOLD}, ${out}`)
}

async function motion(story) {
  const seen = await withPage(
    story,
    async (page) => {
      const names = await page.evaluate(() =>
        document.getAnimations().map((animation) => animation.animationName ?? animation.id ?? animation.constructor.name),
      )
      const first = await page.screenshot()
      await page.waitForTimeout(400)
      const second = await page.screenshot()
      const a = PNG.sync.read(first)
      const b = PNG.sync.read(second)
      const moved = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.05 })
      return { names, moved }
    },
    { reducedMotion: 'no-preference' },
  )
  console.log(JSON.stringify({ id: story.id, ...seen }))
}

const [command = 'list', target] = process.argv.slice(2)
// Stories judged against a committed reference; the terminal's are scripts/stories/shoot.cjs's.
const stories = (await list()).filter((story) => story.reference)
if (command === 'list') {
  for (const story of stories) console.log(`${story.id}\t${story.lane}\t${story.reference}`)
  process.exit(0)
}
const chosen = target === 'all' ? stories : stories.filter((story) => story.id === target)
if (chosen.length === 0) throw new Error(`No story named ${target}`)
const run = { shot, diff, motion }[command]
if (!run) throw new Error(`Unknown command ${command}`)
for (const story of chosen) await run(story)
