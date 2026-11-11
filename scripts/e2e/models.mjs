// The model picker, whole, as the test account and with real model calls: Theorem
// lists what it can run, a pick in the composer is the model the run uses, the
// pick follows the person to another browser and to turns that name no model, and
// "Theorem default" lets go of it.
//
// Start scripts/e2e/stack.mjs first, with THEOREMWEB_CHAT_MODEL unset. Each run
// makes new threads. Screenshots go to the stack's data directory.
import { join } from 'node:path'
import { UI } from './config.mjs'
import { SHOTS, check, finish, log, open } from './lib.mjs'
import { turns } from './turns.mjs'

const PICK = 'openrouter/deepseek/deepseek-v4-flash-0731'
const PICK_MODEL = 'deepseek/deepseek-v4-flash-0731'
const PICK_NAME = 'deepseek-v4-flash-0731'
const OTHER = 'openrouter/z-ai/glm-5.3'
const OTHER_NAME = 'glm-5.3'
const DEFAULT_REF = 'openrouter/deepseek/deepseek-v4.1-flash-1017'
const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash-1017'

const WRITE_SETTLES_MS = 1_500

const session = await open('/')
const { browser, context, page, problems } = session
const shot = (name) => page.screenshot({ path: join(SHOTS, `models-${name}.png`) })
const pause = (ms) => page.waitForTimeout(ms)
const { api, json, pick, picker, pickerOn, ranOn, send, setPreferences, threadId, written } = turns(session)

/** Load a page and wait until it has read the person's preferences and shows `ready`. */
async function load(on, path, ready = pickerOn(on)) {
  const read = on.waitForResponse(
    (response) => response.url().endsWith('/preferences') && response.request().method() === 'GET',
    { timeout: 120_000 },
  )
  await on.goto(UI + path, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await read
  await ready.waitFor({ timeout: 120_000 })
  await on.keyboard.press('Escape')
}

// What Theorem can run.
const list = await json('/models')
const refs = list.models.map((model) => model.ref)
log('listed', refs.join(', '))
check('Theorem serves the model list', refs.length > 0, `${refs.length} models`)
check('the list has no Together route', !refs.some((ref) => /together/i.test(ref)))
check('the pick is on the list', refs.includes(PICK))
check('the default is the organization, not a pin', list.defaultRef === DEFAULT_REF, list.defaultRef)
check(
  'no route or credential crosses the wire',
  !/credential_ref|api_key|"endpoint"|openrouter\.ai/.test(JSON.stringify(list)),
)

// With no stars, the composer offers all of it.
await setPreferences([], null)
const { revision: untouched } = await json('/preferences')
await load(page, '/')
await pause(WRITE_SETTLES_MS)
check('reading preferences writes nothing back', (await json('/preferences')).revision === untouched)
await picker.click()
const offered = await page.getByRole('option').allInnerTexts()
log('offered', offered.map((text) => text.replace(/\n/g, ' ')).join(', '))
check(
  'with no stars the composer offers every runnable model',
  offered.length === refs.length + 1,
  `${offered.length} options for ${refs.length} models`,
)
await shot('1-picker-open')
await page.keyboard.press('Escape')

// A pick is the model the run uses.
await pick(PICK_NAME)
check('the composer shows the pick', (await picker.innerText()).includes(PICK_NAME), await picker.innerText())
const picked = await send('Reply with the single word: ready.')
log('first run', picked.run?.runId, ranOn(picked))
check('the run used the picked model', picked.acting.provider === 'openrouter' && picked.acting.model === PICK_MODEL, ranOn(picked))
check('because the turn named it', picked.acting.model_source === 'request', picked.acting.model_source)
await shot('2-picked-run')

// It follows the person.
const saved = await json('/preferences')
check('Theorem holds the pick', saved.defaultModel === PICK, saved.defaultModel)
await load(page, `/c/${threadId()}`)
check('it survives a reload', (await picker.innerText()).includes(PICK_NAME), await picker.innerText())
const elsewhere = await browser.newContext({
  storageState: { cookies: (await context.storageState()).cookies, origins: [] },
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
})
const otherPage = await elsewhere.newPage()
await load(otherPage, '/')
for (let look = 0; look < 10 && !(await pickerOn(otherPage).innerText()).includes(PICK_NAME); look++) await pause(500)
check(
  'another browser with nothing stored shows it',
  (await pickerOn(otherPage).innerText()).includes(PICK_NAME),
  await pickerOn(otherPage).innerText(),
)
await otherPage.screenshot({ path: join(SHOTS, 'models-3-other-browser.png') })
await elsewhere.close()

// A turn that names no model still runs on it, and that is the person's choice.
await page.route('**/api/chat/v1/threads/*/messages', async (route) => {
  const request = route.request()
  if (request.method() !== 'POST') return route.continue()
  const { model: _named, ...body } = request.postDataJSON()
  return route.continue({ postData: JSON.stringify(body) })
})
const unnamed = await send('Reply with the single word: again.')
log('unnamed run', unnamed.run?.runId, ranOn(unnamed))
check('a turn naming no model runs on the saved choice', unnamed.acting.model === PICK_MODEL, ranOn(unnamed))
check('as the person\'s choice', unnamed.acting.model_source === 'user', unnamed.acting.model_source)
await page.unroute('**/api/chat/v1/threads/*/messages')

// Going to Settings and back inside the app keeps it.
const starButton = page.getByRole('button', { name: `Star ${PICK_NAME}`, exact: true })
await picker.click()
await page.getByRole('link', { name: 'Star more models' }).click()
await starButton.waitFor()
await pause(WRITE_SETTLES_MS)
check('going to Settings keeps the pick', (await json('/preferences')).defaultModel === PICK)
await page.goBack()
await picker.waitFor()
check('and so does coming back', (await picker.innerText()).includes(PICK_NAME), await picker.innerText())

// A change from another browser reaches this one when it comes back to the front.
await setPreferences([], OTHER)
await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
await picker.getByText(OTHER_NAME).waitFor({ timeout: 10_000 }).catch(() => {})
check('another browser\'s change arrives on focus', (await picker.innerText()).includes(OTHER_NAME), await picker.innerText())
await setPreferences([], PICK)
await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
await pause(WRITE_SETTLES_MS)
check('and is not written back', (await json('/preferences')).defaultModel === PICK)

// "Theorem default" lets go.
await pick('Theorem default')
check('the composer shows Theorem default', (await picker.innerText()).includes('Theorem default'))
const released = await json('/preferences')
check('Theorem no longer holds a pick', released.defaultModel === null, String(released.defaultModel))
const defaulted = await send('Reply with the single word: default.')
log('default run', defaulted.run?.runId, ranOn(defaulted))
check('a default turn runs on the organization', defaulted.acting.model === DEFAULT_MODEL, ranOn(defaulted))
check('with the organization as the reason', defaulted.acting.model_source === 'organization', defaulted.acting.model_source)

// Stars narrow the composer's list.
await load(page, '/settings/ai', starButton)
const [starred] = await Promise.all([written(), starButton.click()])
check('a star is saved', starred.ok())
check('Theorem holds the star', (await json('/preferences')).starredModels.includes(PICK))
await load(page, '/')
await picker.click()
const narrowed = await page.getByRole('option').allInnerTexts()
check('stars narrow the composer to those models', narrowed.length === 2, narrowed.join(', ').replace(/\n/g, ' '))
await page.getByPlaceholder('Find a model').fill('no such model')
check('a search with no match says so', await page.getByText('No model matches.').isVisible())
await shot('4-starred')
await page.keyboard.press('Escape')

await setPreferences([], null)
check(
  'the picker asked nothing that went unanswered',
  !problems.some((problem) => /(404|503) .*\/(models|preferences)/.test(problem)),
)
await finish(session)
