import { afterEach, beforeEach, expect, test } from 'bun:test'
import { installFakeTheorem } from './fake-theorem'

const platform = window.fetch
const answered = (calls: string[], name: string) => async () => {
  calls.push(name)
  return new Response('from the platform')
}

let calls: string[] = []
beforeEach(() => {
  calls = []
  window.fetch = Object.assign(answered(calls, 'platform'), {
    preconnect: platform.preconnect,
  })
})
afterEach(() => {
  window.fetch = platform
})

const routes = { 'GET /api/ping': () => ({ ok: true }) }

test('answers /api/ from its routes and passes other requests to the platform', async () => {
  const restore = installFakeTheorem({
    'GET /api/thing/:id': ({ id }) => ({ id }),
  })
  const thing = await window.fetch('http://localhost/api/thing/7')
  expect(await thing.json()).toEqual({ id: '7' })
  const missing = await window.fetch('http://localhost/api/other')
  expect(missing.status).toBe(404)
  await window.fetch('http://localhost/assets/app.js')
  expect(calls).toEqual(['platform'])
  restore()
})

// React runs a story's first render twice in development, and its effects
// again after a simulated remount, so the fake is installed more than once.
test('a second install replaces the first, and restoring either gives the page its fetch back', () => {
  const own = window.fetch
  const restoreFirst = installFakeTheorem(routes)
  const restoreSecond = installFakeTheorem(routes)
  expect(window.fetch).not.toBe(own)
  restoreSecond()
  expect(window.fetch).toBe(own)
  installFakeTheorem(routes)
  restoreFirst()
  expect(window.fetch).toBe(own)
})

test('a second install answers over the platform, not over the first fake', async () => {
  const before = window.fetch
  installFakeTheorem({ 'GET /api/who': () => 'first' })
  const second = installFakeTheorem({ 'GET /api/who': () => 'second' })
  expect(await (await window.fetch('http://localhost/api/who')).json()).toBe(
    'second',
  )
  await window.fetch('http://localhost/assets/app.js')
  expect(calls).toEqual(['platform'])
  second()
  expect(window.fetch).toBe(before)
})
