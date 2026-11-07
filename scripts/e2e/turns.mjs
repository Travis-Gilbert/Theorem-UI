// What a scenario does to a thread: read and write as the signed-in browser, pick
// a model, send a message, and read which model its run recorded.
import { randomUUID } from 'node:crypto'
import { UI } from './config.mjs'
import { READ, check } from './lib.mjs'

const LOOK_MS = 3_000
const LOOKS = 100

/** The record the agent writes as it starts: provider, model and why that one. */
function actingPayload(value) {
  if (!value || typeof value !== 'object') return undefined
  if ('model_source' in value && 'model' in value) return value
  for (const inner of Object.values(value)) {
    const found = actingPayload(inner)
    if (found) return found
  }
  return undefined
}

export function turns({ context, page }) {
  const api = (path, init) => context.request.fetch(`${UI}/api/chat/v1${path}`, { ...READ, ...init })
  const json = async (path) => (await api(path)).json()
  const pause = (ms) => page.waitForTimeout(ms)

  const pickerOn = (on) => on.locator('[aria-label="Model"]').first()
  const picker = pickerOn(page)

  /** The headers a mutation needs. */
  const writing = async (extra = {}) => ({
    'X-CSRF-Token': (await json('/bootstrap')).csrfToken,
    'Idempotency-Key': randomUUID(),
    ...extra,
  })

  async function setPreferences(starredModels, defaultModel) {
    const { revision } = await json('/preferences')
    const saved = await api('/preferences', {
      method: 'PUT',
      headers: await writing({ 'Content-Type': 'application/json', 'If-Match': String(revision) }),
      data: { starredModels, defaultModel },
    })
    check(`Theorem saved preferences (${defaultModel ?? 'no default'})`, saved.ok(), String(saved.status()))
  }

  const written = () =>
    page.waitForResponse(
      (response) => response.url().endsWith('/preferences') && response.request().method() === 'PUT',
      { timeout: 30_000 },
    )

  /** Choose an option in the composer's picker, and wait for Theorem to have it. */
  async function pick(name) {
    const option = page.getByRole('option', { name }).first()
    if (!(await option.isVisible())) await picker.click()
    const [saved] = await Promise.all([written(), option.click()])
    check(`Theorem took the pick of ${name}`, saved.ok())
  }

  const threadId = () => decodeURIComponent(new URL(page.url()).pathname.split('/').pop())
  const lastRunOf = async () => {
    if (!new URL(page.url()).pathname.startsWith('/c/')) return undefined
    return (await json(`/threads/${encodeURIComponent(threadId())}`)).thread?.lastRun
  }

  /** Send a message, wait for its run to be recorded, and say which model it ran on. */
  async function send(text) {
    const before = (await lastRunOf())?.runId
    const box = page.getByRole('textbox').first()
    await box.click()
    await box.fill(text)
    await page.keyboard.press('Enter')
    for (let look = 0; look < LOOKS; look++) {
      const run = await lastRunOf().catch(() => undefined)
      if (run?.runId && run.runId !== before) {
        const snapshot = await json(`/runs/${encodeURIComponent(run.runId)}`)
        const acting = actingPayload(snapshot.events)
        if (acting) return { run, acting }
      }
      await pause(LOOK_MS)
    }
    return { run: await lastRunOf(), acting: {} }
  }

  /** Wait for the thread's latest run to end, and return it. */
  async function ended() {
    for (let look = 0; look < LOOKS; look++) {
      const current = await json(`/threads/${encodeURIComponent(threadId())}`).catch(() => undefined)
      if (current && !current.liveRun && current.thread?.lastRun?.outcome) return current.thread.lastRun
      await pause(LOOK_MS)
    }
    return lastRunOf()
  }

  const ranOn = ({ acting }) => `${acting.provider}/${acting.model} (${acting.model_source})`

  return { api, ended, json, lastRunOf, pick, picker, pickerOn, ranOn, send, setPreferences, threadId, writing, written }
}
