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
import {
  ConnectionReturn,
  FinishingSignIn,
  readOutcome,
  readPending,
  reasonText,
} from './connection-return'
import type { ConnectionOutcome, PendingSignIn } from './connection-return'

// The client builds its requests from the page's address, so there must be one.
const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('https://theorem.test/settings/connections'))
afterAll(() => page.setURL('about:blank'))

let restore: () => void = () => {}
// What the page sent to finish a sign-in, and what Theorem answers to it.
let completions: unknown[] = []
let completeAnswer: () => unknown = () => ({ connector: 'mcp:docs' })
beforeEach(() => {
  completions = []
  completeAnswer = () => ({ connector: 'mcp:docs' })
  restore = installFakeTheorem({
    'POST /api/connections/v1/oauth/complete': async (_params, request) => {
      completions.push(await request.json())
      return completeAnswer()
    },
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
  expect(text()).toContain('not finished in time')
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

const finish = (pending: PendingSignIn) => {
  const ended: ConnectionOutcome[] = []
  const onDone = (outcome: ConnectionOutcome) => ended.push(outcome)
  const shown = render(
    <QueryClientProvider client={new QueryClient()}>
      <FinishingSignIn pending={pending} onDone={onDone} />
    </QueryClientProvider>,
  )
  return { ended, shown }
}

test('a sign-in waiting to be finished is read only with its token', () => {
  expect(
    readPending({ connector: 'mcp:docs', connection: 'pending' }),
  ).toBeUndefined()
  expect(
    readPending({ connection: 'pending', completion: 'tok' }),
  ).toBeUndefined()
  expect(
    readPending({
      connector: 'mcp:docs',
      connection: 'connected',
      completion: 'tok',
    }),
  ).toBeUndefined()
  expect(
    readPending({
      connector: 'mcp:docs',
      connection: 'pending',
      completion: 'tok',
    }),
  ).toEqual({ connector: 'mcp:docs', completion: 'tok' })
  // Waiting is not an outcome: nothing is announced until Theorem answers.
  expect(
    readOutcome({ connector: 'mcp:docs', connection: 'pending' }),
  ).toBeUndefined()
})

test('the page finishes the sign-in once, with the token, and reports it connected', async () => {
  const { ended, shown } = finish({ connector: 'mcp:docs', completion: 'tok' })
  await shown
  expect(text()).toContain('Finishing the sign-in')
  await waitFor(() => ended.length === 1)
  expect(ended).toEqual([{ connector: 'mcp:docs', result: 'connected' }])
  expect(completions).toEqual([{ completion: 'tok' }])
})

test('a sign-in Theorem refuses to finish is reported with its reason', async () => {
  completeAnswer = () =>
    new Response(
      JSON.stringify({
        code: 'mcp_authorization_other_account',
        title: 'Started from another account',
      }),
      { status: 403, headers: { 'content-type': 'application/problem+json' } },
    )
  const { ended, shown } = finish({ connector: 'mcp:docs', completion: 'tok' })
  await shown
  await waitFor(() => ended.length === 1)
  expect(ended).toEqual([
    {
      connector: 'mcp:docs',
      result: 'error',
      reason: 'mcp_authorization_other_account',
    },
  ])
  expect(reasonText('mcp_authorization_other_account')).toContain(
    'different Theorem account',
  )
})
