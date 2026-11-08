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

test('a story mounted again keeps its fake when the last mount cleans up after it renders', async () => {
  const before = window.fetch
  const first = installFakeTheorem({ 'GET /api/who': () => 'first' })
  // React renders the new mount, installing its fake, then runs the old mount's cleanup.
  const second = installFakeTheorem({ 'GET /api/who': () => 'second' })
  first()
  expect(await (await window.fetch('http://localhost/api/who')).json()).toBe(
    'second',
  )
  // The second fake still reaches the platform, not the first fake.
  await window.fetch('http://localhost/assets/app.js')
  expect(calls).toEqual(['platform'])
  second()
  expect(window.fetch).toBe(before)
})
