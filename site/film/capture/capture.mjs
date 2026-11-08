// SOURCING: Playwright for the browser and CDP Page.startScreencast for frames at the real device scale (recordVideo is capped at a low bitrate); ffmpeg assembles them. Only the shot list is ours.
//
// Records the real Theorem app against the local demo stack: a question and a
// follow-up, two real model turns at the desktop size, then the same thread at the
// phone size, then the state the embedded app opens that thread to, which is what
// the frame on the page shows. A take that did not finish, used tools or has
// corrupted text anywhere in the thread is not usable, so it tries again, up to
// TAKES times. Earlier takes are archived, the app's own reversible action, so the
// rail shows one conversation.
//
//   node film/capture/capture.mjs                from site/, with the demo stack up
//   PLAYWRIGHT_BROWSERS_PATH=0                   (browsers live in node_modules)
//   CAPTURE_THREAD=<id>                          reuse a thread: no new model turn
//   CAPTURE_FINALS=tube                          only these layouts' final stills, of the saved thread
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const APP = process.env.DEMO_URL ?? 'http://localhost:3120'
const SCENARIO =
  "I've always wanted to start a small oral-history project in my neighborhood. Help me work out a first step."
const FOLLOW_UP =
  "Say it's the old mill houses on my street, just for the neighbors at first. Sketch a short outline for the first conversation."
const TAKES = Number(process.env.TAKES ?? 8)
const OUT = fileURLToPath(new URL('../public/capture/', import.meta.url))
const STATE = fileURLToPath(new URL('../state/', import.meta.url))
mkdirSync(OUT, { recursive: true })
mkdirSync(STATE, { recursive: true })
const FILM = fileURLToPath(new URL('../../public/film/', import.meta.url))
mkdirSync(FILM, { recursive: true })

const LAYOUTS = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, isMobile: false },
  phone: { viewport: { width: 390, height: 720 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // The study's tube: the app at its raster's proportions (LOGICAL.tube on the site).
  tube: { viewport: { width: 1014, height: 732 }, deviceScaleFactor: 2, isMobile: false },
}
const COMPOSER = '.aui-composer-input'

// Vite's development overlays are not part of the product and never reach a
// production build, so they stay out of the picture.
const HIDE_DEV_TOOLS = '[data-openui-devtools-root] { display: none !important; }'

// The final stills frame the app from a page Playwright fulfils, which Chromium's
// Local Network Access checks treat as public and so refuse to let frame localhost.
const browser = await chromium.launch({
  args: ['--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksForIframes'],
})

async function open(layout) {
  const context = await browser.newContext({ ...LAYOUTS[layout], colorScheme: 'light', reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await page.addInitScript((css) => {
    const add = () => {
      const style = document.createElement('style')
      style.textContent = css
      document.documentElement.append(style)
    }
    if (document.documentElement) add()
    else addEventListener('DOMContentLoaded', add)
  }, HIDE_DEV_TOOLS)
  return page
}

/** Every painted frame, with the time it was painted. */
async function record(page, name) {
  const dir = `${OUT}${name}.frames/`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const client = await page.context().newCDPSession(page)
  const frames = []
  client.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = `${String(frames.length).padStart(6, '0')}.jpg`
    frames.push({ file, at: metadata.timestamp })
    writeFileSync(dir + file, Buffer.from(data, 'base64'))
    await client.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined)
  })
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 96, everyNthFrame: 1 })
  return async () => {
    await client.send('Page.stopScreencast')
    await page.waitForTimeout(200)
    const list = frames
      .map((frame, i) => {
        const next = frames[i + 1]?.at ?? frame.at + 0.2
        return `file '${dir}${frame.file}'\nduration ${(next - frame.at).toFixed(4)}`
      })
      .join('\n')
    const concat = `${dir}frames.txt`
    writeFileSync(concat, `${list}\nfile '${dir}${frames.at(-1).file}'\n`)
    const mp4 = `${OUT}${name}.mp4`
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', concat,
      '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', mp4])
    const seconds = frames.at(-1).at - frames[0].at
    rmSync(dir, { recursive: true, force: true })
    return { file: `capture/${name}.mp4`, frames: frames.length, seconds: Number(seconds.toFixed(2)), start: frames[0].at }
  }
}

const settled = async (page) => {
  await page.waitForFunction((s) => document.querySelector(s)?.clientHeight > 0, COMPOSER, { timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1200)
}

const typeInto = async (page, text, delay = 26) => {
  await page.locator(COMPOSER).click()
  await page.waitForTimeout(250)
  await page.locator(COMPOSER).pressSequentially(text, { delay, timeout: 300000 })
}

/** A run is over when the app offers Send again with nothing still working. */
const runEnded = (page, messages) =>
  page.waitForFunction(
    (n) =>
      document.querySelectorAll('[data-role="assistant"]').length >= n &&
      document.querySelector('button[aria-label="Send message"]') &&
      !/\bWorking\b/.test(document.querySelector('[data-slot="aui_thread-viewport"]')?.innerText ?? ''),
    messages,
    { timeout: 420000, polling: 250 },
  )

/** The question being typed into a new chat, on its own: no model involved. */
async function typingShot(layout) {
  const page = await open(layout)
  await page.goto(APP)
  await settled(page)
  const stop = await record(page, `typing-${layout}`)
  await page.waitForTimeout(500)
  await typeInto(page, SCENARIO)
  await page.waitForTimeout(500)
  const video = await stop()
  await page.context().close()
  return video
}

/**
 * What makes a take unusable, read across the whole thread, because a visitor can
 * scroll all of it. Tool calls would make the film about a workspace.
 */
const problemsIn = (text) =>
  Object.entries({
    unfinished: /Did not finish|step limit/,
    // Searching the web belongs in this story. Reading through source code does not.
    tools: /List directory|Grep|Read file|Page source/,
    corrupted: /\uFFFD/,
    spacing: /[a-z]{3,}[0-9]/,
  })
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name)

/** The rail starts empty, so it shows the one conversation the film is about. */
async function archiveEarlierTakes() {
  const boot = await (await fetch(`${APP}/api/chat/v1/bootstrap`)).json()
  const headers = {
    'content-type': 'application/json',
    'x-csrf-token': boot.csrfToken,
  }
  for (const { projectId } of boot.projects.items) {
    const route = `${APP}/api/chat/v1/projects/${encodeURIComponent(projectId)}/threads?limit=50`
    const { items } = await (await fetch(route)).json()
    for (const { threadId, status, revision } of items) {
      if (status === 'archived') continue
      const done = await fetch(`${APP}/api/chat/v1/threads/${encodeURIComponent(threadId)}`, {
        method: 'PATCH',
        headers: { ...headers, 'idempotency-key': crypto.randomUUID(), 'if-match': String(revision) },
        body: JSON.stringify({ archived: true }),
      })
      if (!done.ok) throw new Error(`archive ${threadId}: ${done.status}`)
    }
  }
}

async function modelTurn() {
  const page = await open('desktop')
  await page.goto(APP)
  await settled(page)
  await page.locator(COMPOSER).fill(SCENARIO)
  await page.waitForTimeout(400)
  const stop = await record(page, 'turn-desktop')
  const started = Date.now()
  const marks = {}
  const mark = (label) => {
    marks[label] = Number(((Date.now() - started) / 1000).toFixed(2))
  }
  await page.waitForTimeout(200)
  await page.locator(COMPOSER).press('Enter')
  mark('sent')
  await page.waitForURL(/\/c\//, { timeout: 60000 })
  await runEnded(page, 1)
  mark('answered')
  const threadId = new URL(page.url()).pathname.split('/').at(-1)
  const threadText = () => page.locator('[data-slot="aui_thread-viewport"]').innerText()
  // A follow-up under an answer that cannot be used would only cost another model turn.
  const first = problemsIn(await threadText())
  if (first.length) {
    await stop()
    await page.context().close()
    return { threadId, problems: first }
  }
  await page.waitForTimeout(500)
  mark('typing')
  await typeInto(page, FOLLOW_UP)
  mark('typed')
  await page.waitForTimeout(250)
  await page.locator(COMPOSER).press('Enter')
  mark('resent')
  await runEnded(page, 2)
  await page.waitForTimeout(600)
  mark('done')
  const video = await stop()
  const text = await threadText()
  await page.screenshot({ path: `${OUT}turn-end-desktop.png` })
  await page.context().close()
  return { threadId, text, problems: problemsIn(text), video, marks }
}

/** The same thread on a phone: the real page, scrolled from the question down to where it ends. */
async function phoneScroll(threadId) {
  const page = await open('phone')
  await page.goto(`${APP}/c/${threadId}`)
  await settled(page)
  const stop = await record(page, 'thread-phone')
  await page.evaluate(async () => {
    const box = document.querySelector('[data-slot="aui_thread-viewport"]')
    const end = box.scrollHeight - box.clientHeight
    box.scrollTo({ top: 0, behavior: 'instant' })
    await new Promise((r) => setTimeout(r, 500))
    const started = performance.now()
    await new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min((now - started) / 6000, 1)
        box.scrollTo({ top: end * (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2), behavior: 'instant' })
        if (t < 1) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
  })
  await page.waitForTimeout(500)
  const video = await stop()
  await page.context().close()
  return video
}

/**
 * What the embedded app shows when it opens this thread, through the same code the
 * site's frame runs: the document is a guest, inert, opened where the app opens the thread.
 * The handshake has nobody to answer it here, and nothing in the picture depends on it.
 */
async function finals(threadId, layouts = Object.keys(LAYOUTS)) {
  const parent = 'http://localhost:3100/final-still'
  for (const layout of layouts) {
    const page = await open(layout)
    await page.route(parent, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><style>html,body{margin:0;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style><iframe src="${APP}/c/${threadId}?site-embed=1.capture"></iframe>`,
      }),
    )
    await page.goto(parent)
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame())
    // Where the app leaves the thread once it has stopped scrolling: the published stills
    // open a little above the end, under the app's own jump-to-end control.
    await frame.waitForFunction(
      () => {
        const box = document.querySelector('[data-slot="aui_thread-viewport"]')
        if (!box || document.querySelectorAll('[data-role="assistant"]').length < 2) return false
        const at = `${box.scrollTop}/${box.scrollHeight}`
        const still = window.__finalAt === at
        window.__finalAt = at
        return still
      },
      undefined,
      { timeout: 60000, polling: 1500 },
    )
    await frame.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}final-${layout}.png` })
    await page.screenshot({ path: `${FILM}final-${layout}.png` })
    await page.context().close()
  }
}

const statePath = `${STATE}thread.json`
const earlier = JSON.parse(readFileSync(statePath, 'utf8'))
if (process.env.CAPTURE_FINALS) {
  await finals(encodeURIComponent(earlier.threadId), process.env.CAPTURE_FINALS.split(','))
  await browser.close()
  process.exit(0)
}
let state = process.env.CAPTURE_THREAD ? earlier : null
let typing = earlier.typing
let phoneTyping = earlier.phone?.typing
if (!state) {
  const rejected = []
  // Footage is overwritten from here on, so the old marks must not outlive it: an unfinished run leaves shots.mjs nothing to cut with.
  rmSync(statePath)
  await archiveEarlierTakes()
  // Before any turn, so the rail is as empty behind the typing as it is in the story.
  typing = await typingShot('desktop')
  phoneTyping = await typingShot('phone')
  for (let take = 1; take <= TAKES; take++) {
    const result = await modelTurn()
    console.log(`take ${take}: ${result.threadId} ${result.problems.join(', ') || 'usable'}`)
    state = {
      threadId: decodeURIComponent(result.threadId),
      question: SCENARIO,
      followUp: FOLLOW_UP,
      answer: result.text,
      capturedAt: new Date().toISOString(),
      appCommit: process.env.DEMO_APP_REF ?? null,
      video: result.video,
      marks: result.marks,
      take,
      rejected,
    }
    if (!result.problems.length) break
    rejected.push({ thread: decodeURIComponent(result.threadId), problems: result.problems })
    if (take === TAKES) throw new Error(`No usable take in ${TAKES}.`)
    await archiveEarlierTakes()
  }
}
const phone = { typing: phoneTyping, scroll: await phoneScroll(encodeURIComponent(state.threadId)) }
await finals(encodeURIComponent(state.threadId))
writeFileSync(statePath, `${JSON.stringify({ ...state, typing, phone }, null, 2)}\n`)
await browser.close()
console.log(`thread ${state.threadId}`)
