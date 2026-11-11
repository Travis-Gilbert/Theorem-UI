// Bringing your own key, whole, as the test account and with real model calls: with
// no key nothing runs on OpenRouter; a key the provider refuses is not kept; a good
// one fills the picker and runs the person's turns, default or picked, as Theorem's
// agent with its tools, and its delegated work too; removing it takes all of that away.
//
// Start the stack with E2E_KEY_STANDIN=1, which leaves the deployment without an
// OpenRouter key and puts scripts/e2e/provider-standin.mjs in OpenRouter's place. The
// key typed into the page is the stand-in's generated test key, never a real one.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR, STANDIN, UI } from './config.mjs'
import { SHOTS, check, finish, log, open } from './lib.mjs'
import { turns } from './turns.mjs'

const DEFAULT_REF = 'openrouter/deepseek/deepseek-v4.1-flash-1017'
const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash-1017'
const PICK_MODEL = 'deepseek/deepseek-v4-flash-0731'
const PICK_NAME = 'deepseek-v4-flash-0731'
const AGENT_TOOL = 'delegate'
const REFUSED_KEY = 'sk-or-this-key-is-not-one-the-provider-knows'
const DELEGATION_LOOKS = 60
const LOOK_MS = 3_000

const TEST_KEY = JSON.parse(readFileSync(join(DATA_DIR, 'secrets.json'), 'utf8')).testProviderKey
const CREDENTIALS = '/credentials/openrouter'

const session = await open('/settings/keys')
const { page, problems } = session
const { api, ended, json, pick, picker, ranOn, send, setPreferences, writing } = turns(session)
const shot = (name) => page.screenshot({ path: join(SHOTS, `keys-${name}.png`) })

const calls = async () => (await fetch(`${STANDIN}/__calls`)).json()
const openrouterRow = async () =>
  (await json('/credentials')).credentials.find((row) => row.provider === 'openrouter')
const runnableOnOpenRouter = async () =>
  (await json('/models')).models.filter((model) => model.ref.startsWith('openrouter/'))
const keyField = page.getByLabel('OpenRouter API key')
const badge = (text) => page.getByText(text, { exact: true }).first()

/** Save a key through the page and return Theorem's answer. */
async function saveKey(key) {
  await keyField.fill(key)
  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith(CREDENTIALS) && response.request().method() === 'PUT',
      { timeout: 60_000 },
    ),
    page.getByRole('button', { name: 'Save key' }).click(),
  ])
  return saved
}

/** Every call a turn made reached the stand-in as the person's, as Theorem's agent. */
function checkAgentCalls(name, made, model) {
  const onModel = made.filter((call) => call.model === model)
  check(`${name}: the provider was asked for ${model}`, onModel.length > 0, `${made.length} calls`)
  check(`${name}: every call carried the person's key`, made.every((call) => call.carriedTestKey))
  const asked = onModel[0]
  check(
    `${name}: the model was asked as the harnessed agent, with Theorem's tools`,
    Boolean(asked?.tools?.includes(AGENT_TOOL)),
    `${asked?.tools?.length ?? 0} tools`,
  )
  check(`${name}: and with Theorem's system prompt`, Boolean(asked?.systemHead))
  return asked
}

// Start from no key and no pick.
const cleared = await api(CREDENTIALS, { method: 'DELETE', headers: await writing() })
check('Theorem takes a removal when there is nothing to remove', cleared.status() === 204, String(cleared.status()))
await setPreferences([], null)

// With no key, nothing runs on OpenRouter.
const listing = await json('/credentials')
log('credentials', listing.credentials.map((row) => `${row.provider}:${row.source}`).join(', '))
check('OpenRouter comes first', listing.credentials[0]?.provider === 'openrouter')
check('it says there is no key', listing.credentials[0]?.configured === false && listing.credentials[0]?.source === null)
check('no OpenRouter model is on offer', (await runnableOnOpenRouter()).length === 0)
await page.goto(`${UI}/settings/keys`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
await keyField.waitFor({ timeout: 120_000 })
check('the page says so', await badge('No key').isVisible())
await shot('1-no-key')

// A key the provider refuses is not kept.
const refused = await saveKey(REFUSED_KEY)
const refusal = await refused.json()
check('the provider refuses a bad key', refused.status() === 422, String(refused.status()))
check('with a code the UI can name', refusal.code === 'credential_rejected', refusal.code)
await page.getByText(refusal.detail ?? refusal.title).first().waitFor()
check('the page says why', true)
check('nothing was kept', (await openrouterRow()).source === null)
await shot('2-refused')

// A good one is kept, and only its last characters ever come back.
const accepted = await saveKey(TEST_KEY)
const acceptedText = await accepted.text()
check('Theorem takes a good key', accepted.ok(), String(accepted.status()))
check('the answer does not hold the key', !acceptedText.includes(TEST_KEY))
const row = await openrouterRow()
check('it is the person\'s own', row.source === 'personal' && row.configured === true, row.source)
check('the listing does not hold the key', !JSON.stringify(row).includes(TEST_KEY))
check('its ending is the key\'s', row.last4 === TEST_KEY.slice(-4))
await badge(`Your key, ending ${row.last4}`).waitFor()
await shot('3-saved')

// It fills the picker, without a reload.
const list = await json('/models')
check('its models are on offer', (await runnableOnOpenRouter()).length > 0, `${list.models.length} models`)
check('with the default among them', list.defaultRef === DEFAULT_REF, list.defaultRef)
await page.getByRole('link', { name: 'Exit settings' }).click()
await picker.click()
check('the picker lists them', await page.getByRole('option', { name: PICK_NAME }).first().isVisible())
await page.keyboard.press('Escape')
await shot('4-picker')

// A default turn runs on the person's key, as the agent.
let seen = (await calls()).length
const defaulted = await send('Reply with the single word: ready.')
log('default run', defaulted.run?.runId, ranOn(defaulted))
check('a default turn runs on the default', defaulted.acting.model === DEFAULT_MODEL, ranOn(defaulted))
check('with the organization as the reason', defaulted.acting.model_source === 'organization', defaulted.acting.model_source)
const defaultEnded = await ended()
check('and it finishes', defaultEnded?.outcome === 'completed', defaultEnded?.outcome)
const asDefault = checkAgentCalls('default turn', (await calls()).slice(seen), DEFAULT_MODEL)

// A picked model only changes who sits in that role.
await pick(PICK_NAME)
seen = (await calls()).length
const picked = await send('Reply with the single word: again.')
log('picked run', picked.run?.runId, ranOn(picked))
check('a picked turn runs on the pick', picked.acting.model === PICK_MODEL, ranOn(picked))
const pickedEnded = await ended()
check('and it finishes', pickedEnded?.outcome === 'completed', pickedEnded?.outcome)
const asPicked = checkAgentCalls('picked turn', (await calls()).slice(seen), PICK_MODEL)
check(
  'a picked model has the same tools as the default',
  JSON.stringify([...(asPicked?.tools ?? [])].sort()) === JSON.stringify([...(asDefault?.tools ?? [])].sort()),
)
await pick('Theorem default')

// Delegated work runs on the person's key too.
seen = (await calls()).length
await send(
  'Use your delegate tool now: hand a specialist the task of replying with the single word "done". Then tell me what it said.',
)
let specialist = []
for (let look = 0; look < DELEGATION_LOOKS && !specialist.length; look++) {
  specialist = (await calls()).slice(seen).filter((call) => call.tools && !call.tools.includes(AGENT_TOOL))
  if (!specialist.length) await page.waitForTimeout(LOOK_MS)
}
log('specialist calls', specialist.map((call) => call.model).join(', '))
check('the specialist reached the provider', specialist.length > 0)
check('on the person\'s key', specialist.length > 0 && specialist.every((call) => call.carriedTestKey))
await ended()
await shot('5-delegated')

// Removing it takes all of that away.
await page.goto(`${UI}/settings/keys`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
await page.getByRole('button', { name: 'Remove' }).click()
await badge('No key').waitFor()
check('the page says the key is gone', true)
check('Theorem no longer holds it', (await openrouterRow()).source === null)
check('its models are off offer', (await runnableOnOpenRouter()).length === 0)
await shot('6-removed')

// A turn with no key is refused, by name, rather than run on someone else's.
await page.getByRole('link', { name: 'Exit settings' }).click()
const box = page.getByRole('textbox').first()
await box.click()
await box.fill('This should not run.')
seen = (await calls()).length
const [noKey] = await Promise.all([
  page.waitForResponse(
    (response) => /\/(threads|messages)/.test(response.url()) && response.request().method() === 'POST' && response.status() >= 400,
    { timeout: 60_000 },
  ),
  page.keyboard.press('Enter'),
])
const noKeyProblem = await noKey.json().catch(() => ({}))
log('no key', noKey.status(), noKeyProblem.code)
check('a turn with no key is refused by name', noKeyProblem.code === 'chat_model_credential_missing', noKeyProblem.code)
check('and nothing reached the provider', (await calls()).length === seen)
await shot('7-refused-turn')

await setPreferences([], null)
await finish(session)
