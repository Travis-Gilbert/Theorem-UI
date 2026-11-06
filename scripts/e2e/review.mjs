// The review path, whole, as the test account and with a real model: sign in,
// attach two images, have the agent offer them with show_options, choose in the
// Compare pane, and see the answer and the agent's reply arrive on the open page.
//
// Start scripts/e2e/stack.mjs first. Each run makes a new thread. Screenshots go
// to the stack's data directory.
import { join, resolve } from 'node:path'
import { UI } from './config.mjs'
import { SHOTS, check, finish, log, open } from './lib.mjs'

const CANDIDATES = ['compare-pane.png', 'review-card.png']
const PROMPT =
  "These two screenshots are candidate layouts for a review pane. Do not describe them and do not ask me anything. Call show_options now with the title 'Review pane layout' and one option per screenshot, titled 'Close up' and 'Whole canvas'."
const FEEDBACK = 'Close up reads better; keep the whole-canvas minimap.'

const LOOK_MS = 5_000
const LOOKS = 150

const session = await open('/')
const { context, page } = session
const shot = (name) => page.screenshot({ path: join(SHOTS, `review-${name}.png`) })
const pause = (ms) => page.waitForTimeout(ms)
const seconds = (since) => `${Math.round((Date.now() - since) / 1000)}s`

const transcript = () =>
  page.evaluate(() =>
    (
      document.querySelector('[data-slot="aui_thread-viewport"]') ??
      document.querySelector('main') ??
      document.body
    ).innerText.replace(/\n+/g, ' | '),
  )
const sidebar = () =>
  page.evaluate(() => {
    const label = [...document.querySelectorAll('*')].find(
      (node) =>
        node.children.length === 0 &&
        node.textContent.trim() === 'Attention Worthy',
    )
    let box = label
    for (let up = 0; up < 8 && box; up++) {
      box = box.parentElement
      if (box && box.innerText.length > 200) break
    }
    return box ? box.innerText.replace(/\n+/g, ' | ') : ''
  })

const attach = async (name) => {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add Attachment' }).first().click()
  await (await chooser).setFiles(
    resolve(import.meta.dirname, '../../docs/plans/evidence/collages', name),
  )
  await pause(1_500)
}

// Send.
await page.getByRole('button', { name: 'Add Attachment' }).first().waitFor({ timeout: 90_000 })
await page.keyboard.press('Escape')
for (const name of CANDIDATES) await attach(name)
check('two files in the tray', (await page.locator('.aui-attachment-tile').count()) === 2)
const box = page.getByRole('textbox').first()
await box.click()
await box.fill(PROMPT)
const sent = Date.now()
await page.keyboard.press('Enter')

// The agent offers the options.
const open_card = page.getByRole('button', { name: /Needs your choice/ }).first()
let offered = false
for (let look = 0; look < LOOKS && !offered; look++) {
  offered = (await open_card.count()) > 0
  if (!offered) await pause(LOOK_MS)
}
check('review card appeared', offered, seconds(sent))
await shot('1-card')
if (!offered) {
  log('transcript', (await transcript()).slice(-600))
  await finish(session)
}
const threadId = decodeURIComponent(new URL(page.url()).pathname.split('/').pop())
const thread = () =>
  context.request
    .get(`${UI}/api/chat/v1/threads/${encodeURIComponent(threadId)}`)
    .then((response) => response.json())
const inSidebar = await sidebar()
check('first message named the thread', /These two screenshots/.test(inSidebar))
check('Review badge on the row', /Review/.test(inSidebar))

// A draft survives everything short of sending it.
await open_card.click()
const feedback = page.getByLabel('Feedback')
await feedback.waitFor()
await page.getByLabel(/^Pick /).last().click()
await pause(450)
await feedback.fill(FEEDBACK.slice(0, 10))
await pause(450)
await feedback.fill(FEEDBACK)
await pause(150)
await page.reload({ waitUntil: 'domcontentloaded' })
await open_card.waitFor({ timeout: 90_000 })
await open_card.click()
await feedback.waitFor()
await pause(800)
check('draft survives an immediate reload', (await feedback.inputValue()) === FEEDBACK)

const popupOpened = context.waitForEvent('page', { timeout: 15_000 }).catch(() => undefined)
await page.getByRole('button', { name: 'Detach' }).click()
const popup = await popupOpened
if (popup) await popup.waitForLoadState('domcontentloaded').catch(() => {})
await pause(2_500)
const detached = popup && (await popup.getByLabel('Feedback').count()) ? popup : page
check(
  'detached keeps the draft',
  (await detached.getByLabel('Feedback').first().inputValue().catch(() => '')) === FEEDBACK,
)
const dock = detached.getByRole('button', { name: 'Dock beside the conversation' })
check('dock offered', (await dock.count()) > 0)
if (await dock.count()) await dock.click()
await pause(2_000)
check('docked keeps the draft', (await feedback.inputValue().catch(() => '')) === FEEDBACK)
await page.getByRole('button', { name: 'Close', exact: true }).click()
await pause(700)
await open_card.click()
await pause(900)
check('close keeps the draft', (await feedback.inputValue()) === FEEDBACK)

// The answer and the reply arrive on the open page, with no reload.
const answering = Date.now()
await page.getByRole('button', { name: 'Send feedback' }).click()
const answered = page.getByRole('button', { name: /Answered/ }).first()
await answered.waitFor({ timeout: 60_000 }).catch(() => {})
check('card reads Answered', (await answered.count()) > 0, seconds(answering))
await shot('2-answered')

let current
let reply = ''
for (let look = 0; look < LOOKS && !reply; look++) {
  current = await thread()
  const last = current.messages.at(-1)
  if (!current.liveRun && last?.role === 'assistant' && current.messages.length >= 4)
    reply = last.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.payload.text)
      .join(' ')
  else await pause(LOOK_MS)
}
check('agent replied to the answer', Boolean(reply), seconds(answering))
check('its run did not fail', current?.thread?.lastRun?.outcome === 'completed', current?.thread?.lastRun?.outcome)
check('reply shows no raw upload id', !/chatupload_sha256/.test(reply), reply.slice(0, 160))
const words = reply.match(/[A-Za-z][A-Za-z ,']{23,}/)?.[0]
let onPage = false
for (let look = 0; look < 12 && words && !onPage; look++) {
  onPage = (await transcript()).includes(words)
  if (!onPage) await pause(LOOK_MS / 2)
}
check('reply reached the open page without a reload', onPage, seconds(answering))
const live = await transcript()
check('answer message reached the open page', live.includes(FEEDBACK))
check('answer message hides the review id', !live.includes('Review: '))
await shot('3-reply')

// All of it after a reload.
await page.reload({ waitUntil: 'domcontentloaded' })
await answered.waitFor({ timeout: 90_000 }).catch(() => {})
check('answer persists after a reload', (await answered.count()) > 0)
check('reply persists after a reload', !words || (await transcript()).includes(words))
await shot('4-reload')

// Highlights, on what really happened.
const tab = page.getByRole('tab', { name: 'Highlights' })
await tab.click()
await pause(2_000)
const highlights = await page.evaluate(() =>
  (document.querySelector('main') ?? document.body).innerText.replace(/\n+/g, ' | '),
)
check('Highlights names the files', CANDIDATES.every((name) => highlights.includes(name)), highlights.slice(0, 400))
await tab.hover()
await pause(300)
const fill = await tab.evaluate((node) => getComputedStyle(node).backgroundColor)
check('hovering the selected tab adds no fill', /rgba\(0, 0, 0, 0\)|transparent/.test(fill), fill)
await shot('5-highlights')

await finish(session)
