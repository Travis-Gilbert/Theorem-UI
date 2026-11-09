import { expect, test } from 'bun:test'
import { installFakeTheorem } from './fake-theorem'

const routes = { 'GET /api/ping': () => ({ ok: true }) }

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
