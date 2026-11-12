// The review path, whole, as the test account and with a real model: sign in,
// attach two images, have the agent offer them with show_options, choose in the
// Compare pane, write the feedback in the conversation's composer, and see the
// answer and the agent's reply arrive on the open page.
// Then again in a new thread, answering the moment the card appears, while the
// run that offered the options is still finishing.
//
// Start scripts/e2e/stack.mjs first. Each run makes a new thread. Screenshots go
// to the stack's data directory.
import { join, resolve } from 'node:path'
import { UI } from './config.mjs'
import { READ, SHOTS, check, finish, log, open } from './lib.mjs'

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

const open_card = page.getByRole('button', { name: /Needs your choice/ }).first()
const answered = page.getByRole('button', { name: /Answered/ }).first()
// Write feedback has the conversation's composer answer the review.
const writeFeedback = page.getByRole('button', { name: 'Write feedback' })
const composer = (surface) => surface.getByLabel('Message input').filter({ visible: true }).first()
const feedback = composer(page)
// Real key presses, over whatever a restored draft left there.
const write = async (words) => {
  await feedback.press('ControlOrMeta+a')
  await feedback.pressSequentially(words)
}
const threadPath = () =>
  `${UI}/api/chat/v1/threads/${new URL(page.url()).pathname.split('/').pop()}`
const thread = () => context.request.get(threadPath(), READ).then((response) => response.json())
const reviewCount = () =>
  context.request
    .get(`${threadPath()}/reviews`, READ)
    .then((response) => response.json())
    .then(({ items }) => items.length)

/** Send the two files and the prompt, and wait for the agent to offer the options. */
async function offerOptions() {
  await page.getByRole('button', { name: 'Add Attachment' }).first().waitFor({ timeout: 90_000 })
  await page.keyboard.press('Escape')
  for (const name of CANDIDATES) await attach(name)
  check('two files in the tray', (await page.locator('.aui-attachment-tile').count()) === 2)
  const box = page.getByRole('textbox').first()
  await box.click()
  await box.fill(PROMPT)
  const sent = Date.now()
  await page.keyboard.press('Enter')
  let offered = false
  for (let look = 0; look < LOOKS && !offered; look++) {
    offered = (await open_card.count()) > 0
    if (!offered) await pause(LOOK_MS)
  }
  check('review card appeared', offered, seconds(sent))
  if (!offered) {
    log('transcript', (await transcript()).slice(-600))
    await finish(session)
  }
}

/** The run after the answer has finished: its reply is the newest message. */
async function replyToTheAnswer() {
  for (let look = 0; look < LOOKS; look++) {
    const current = await thread()
    const last = current.messages.at(-1)
    if (!current.liveRun && last?.role === 'assistant' && current.messages.length >= 4) {
      const text = last.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.payload.text)
        .join(' ')
      return { current, text }
    }
    await pause(LOOK_MS)
  }
  return { current: await thread(), text: '' }
}

/** What holds for any answer, however early it came. */
async function checkTheAnswered({ current, text }, answering) {
  check('agent replied to the answer', Boolean(text), seconds(answering))
  check('its run did not fail', current.thread?.lastRun?.outcome === 'completed', current.thread?.lastRun?.outcome)
  check('reply shows no raw upload id', !/chatupload_sha256/.test(text), text.slice(0, 160))
  const order = current.messages.map((message) => message.role).join(' ')
  check('reads request, offer, answer, reply', order === 'user assistant user assistant', order)
  check('the agent did not offer again', (await reviewCount()) === 1)
  const words = text.match(/[A-Za-z][A-Za-z ,']{23,}/)?.[0]
  let onPage = false
  for (let look = 0; look < 12 && words && !onPage; look++) {
    onPage = (await transcript()).includes(words)
    if (!onPage) await pause(LOOK_MS / 2)
  }
  check('reply reached the open page without a reload', onPage, seconds(answering))
  const live = await transcript()
  check('answer message reached the open page', live.includes(FEEDBACK))
  check('answer message hides the review id', !live.includes('Review: '))
  check('the conversation kept its opening message', live.includes(PROMPT.slice(0, 40)))
  check('no second branch appeared', !/\b\d+ \/ \d+\b/.test(live))
  return words
}

// Send, and the agent offers the options.
await offerOptions()
await shot('1-card')
const inSidebar = await sidebar()
check('first message named the thread', /These two screenshots/.test(inSidebar))
check('Review badge on the row', /Review/.test(inSidebar))

// A draft survives everything short of sending it.
const checkDraft = async (name, input) => {
  // The composer is an editor: it has text where a text area had a value.
  const words = (await input.innerText().catch(() => '')).trim()
  check(name, words === FEEDBACK, words === FEEDBACK ? '' : JSON.stringify(words))
}
await open_card.click()
await writeFeedback.waitFor()
await page.getByLabel(/^Pick /).last().click()
await pause(450)
await writeFeedback.click()
await write(FEEDBACK.slice(0, 10))
await pause(450)
await write(FEEDBACK)
await pause(150)
await page.reload({ waitUntil: 'domcontentloaded' })
await open_card.waitFor({ timeout: 90_000 })
await open_card.click()
await writeFeedback.waitFor()
await pause(800)
await writeFeedback.click()
await checkDraft('draft survives an immediate reload', feedback)

const popupOpened = context.waitForEvent('page', { timeout: 15_000 }).catch(() => undefined)
await page.getByRole('button', { name: 'Detach' }).click()
const popup = await popupOpened
if (popup) await popup.waitForLoadState('domcontentloaded').catch(() => {})
await pause(2_500)
// Away from the conversation the pane carries the composer itself.
const detached = popup && (await popup.getByLabel('Message input').count()) ? popup : page
await checkDraft('detached keeps the draft', composer(detached))
const dock = detached.getByRole('button', { name: 'Dock beside the conversation' })
check('dock offered', (await dock.count()) > 0)
if (await dock.count()) await dock.click()
await pause(2_000)
await checkDraft('docked keeps the draft', feedback)
await page.getByRole('button', { name: 'Close', exact: true }).click()
await pause(700)
await open_card.click()
await pause(900)
await checkDraft('close keeps the draft', feedback)

// The answer and the reply arrive on the open page, with no reload.
const answering = Date.now()
await page.getByRole('button', { name: 'Send feedback' }).click()
await answered.waitFor({ timeout: 60_000 }).catch(() => {})
check('card reads Answered', (await answered.count()) > 0, seconds(answering))
await shot('2-answered')

const words = await checkTheAnswered(await replyToTheAnswer(), answering)
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

// Answering at once: the run that offered the options is still writing its reply.
await page.goto(UI, { waitUntil: 'domcontentloaded', timeout: 120_000 })
await offerOptions()
await open_card.click()
await writeFeedback.waitFor()
await writeFeedback.click()
await write(FEEDBACK)
const early = Date.now()
await page.getByRole('button', { name: 'Send feedback' }).click()
await answered.waitFor({ timeout: 60_000 }).catch(() => {})
check('an early answer reads Answered', (await answered.count()) > 0, seconds(early))
await shot('6-early-answer')
await checkTheAnswered(await replyToTheAnswer(), early)
await shot('7-early-reply')

await finish(session)
