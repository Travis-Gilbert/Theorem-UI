// SOURCING: bun:test over the notice shown after a sign-in returns to Connections (reading the search parameters, the wording per outcome), against the fake Theorem the page tests use
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { installFakeTheorem } from '@/stories/fake-theorem'
import { cleanup, render, waitFor } from '../../../test/blocks/render'
import { ConnectionReturn, readOutcome, reasonText } from './connection-return'
import type { ConnectionOutcome } from './connection-return'

// The client builds its requests from the page's address, so there must be one.
const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('https://theorem.test/settings/connections'))
afterAll(() => page.setURL('about:blank'))

let restore: () => void = () => {}
beforeEach(() => {
  restore = installFakeTheorem({
    'GET /api/chat/v1/bootstrap': () => ({ csrfToken: 'csrf', tenantId: 't' }),
    'GET /api/connections/v1': () => ({
      connections: [
        {
          id: 'mcp:docs',
          kind: 'mcp',
          label: 'Docs server',
          status: 'connected',
          enabled: true,
          health: { state: 'ok' },
        },
      ],
      stdioAvailable: false,
    }),
  })
})
afterEach(async () => {
  await cleanup()
  restore()
})

const show = (outcome: ConnectionOutcome, onDismiss = () => {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConnectionReturn outcome={outcome} onDismiss={onDismiss} />
    </QueryClientProvider>,
  )
const text = () => document.body.textContent

test('the outcome is read only when Theorem named a connection and how it ended', () => {
  expect(readOutcome({})).toBeUndefined()
  expect(readOutcome({ connector: 'mcp:docs' })).toBeUndefined()
  expect(
    readOutcome({ connector: 'mcp:docs', connection: 'maybe' }),
  ).toBeUndefined()
  expect(readOutcome({ connection: 'connected' })).toBeUndefined()
  expect(
    readOutcome({ connector: 'mcp:docs', connection: 'connected' }),
  ).toEqual({
    connector: 'mcp:docs',
    result: 'connected',
    reason: undefined,
  })
  expect(
    readOutcome({
      connector: 'mcp:docs',
      connection: 'error',
      reason: 'mcp_authorization_denied',
    }),
  ).toEqual({
    connector: 'mcp:docs',
    result: 'error',
    reason: 'mcp_authorization_denied',
  })
})

test('a finished sign-in names the connection by its own label', async () => {
  await show({ connector: 'mcp:docs', result: 'connected' })
  await waitFor(() => text().includes('Docs server is connected'))
})

test('a sign-in that did not finish says why in plain words', async () => {
  await show({
    connector: 'mcp:docs',
    result: 'error',
    reason: 'mcp_authorization_expired',
  })
  await waitFor(() => text().includes('Docs server was not connected'))
  expect(text()).toContain('longer than ten minutes')
})

test('a reason Theorem has no sentence for is still shown, and a missing one says so', () => {
  expect(reasonText('something_new')).toBe('Theorem reported: something_new.')
  expect(reasonText(undefined)).toContain('did not say why')
})

test('a connection the list does not hold still gets a name, and Dismiss is passed on', async () => {
  let dismissed = 0
  await show({ connector: 'github', result: 'connected' }, () => dismissed++)
  expect(text()).toContain('GitHub is connected')
  const button = [...document.querySelectorAll('button')].find(
    (entry) => entry.textContent.trim() === 'Dismiss',
  )!
  button.click()
  expect(dismissed).toBe(1)
})
