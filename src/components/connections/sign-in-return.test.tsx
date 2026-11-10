// SOURCING: bun:test over the notice that finishes a sign-in on whatever page the person returns to, against the fake Theorem the page tests use
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
import { SignInNotice } from './sign-in-return'

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('https://theorem.test/'))
afterAll(() => page.setURL('about:blank'))

let restore: () => void = () => {}
// Each completion Theorem was sent, by the route it arrived on.
let completions: Array<[route: string, body: unknown]> = []
let refusal: (() => Response) | undefined
beforeEach(() => {
  completions = []
  refusal = undefined
  const complete =
    (route: string) => async (_params: unknown, request: Request) => {
      completions.push([route, await request.json()])
      return refusal?.() ?? { connector: 'mcp:docs', provider: {} }
    }
  restore = installFakeTheorem({
    'POST /api/connections/v1/oauth/complete': complete('mcp'),
    'POST /api/chat/v1/connectors/:provider/complete': complete('account'),
    'GET /api/chat/v1/bootstrap': () => ({ csrfToken: 'csrf', tenantId: 't' }),
    'GET /api/connections/v1': () => ({
      connections: [],
      stdioAvailable: false,
    }),
  })
})
afterEach(async () => {
  await cleanup()
  restore()
})

const arrive = (pathname: string, search: Record<string, unknown>) => {
  let taken = 0
  const onTaken = () => {
    taken++
  }
  const shown = render(
    <QueryClientProvider client={new QueryClient()}>
      <SignInNotice
        pathname={pathname}
        search={search}
        onTaken={onTaken}
      />
    </QueryClientProvider>,
  )
  return { shown, taken: () => taken }
}
const text = () => document.body.textContent
const pending = (connector: string) => ({
  connector,
  connection: 'pending',
  completion: 'tok',
})

test('an account sign-in is finished on its own route and reported where the person landed', async () => {
  const { shown, taken } = arrive('/', pending('google_gmail'))
  await shown
  await waitFor(() => text().includes('The account is connected'))
  expect(completions).toEqual([['account', { completion: 'tok' }]])
  // The one-time token is cleared from the address as soon as it is read.
  expect(taken()).toBe(1)
})

test('a tool server sign-in returned to another page finishes on the Connections route', async () => {
  const { shown } = arrive('/c/thr_1', pending('mcp:docs'))
  await shown
  await waitFor(() => text().includes('is connected'))
  expect(completions).toEqual([['mcp', { completion: 'tok' }]])
})

test('a refusal is said with its reason', async () => {
  // A fresh answer each time: the client asks again once after a 403.
  refusal = () =>
    new Response(
      JSON.stringify({ code: 'connector_authorization_other_account' }),
      { status: 403, headers: { 'content-type': 'application/problem+json' } },
    )
  const { shown } = arrive('/', pending('github'))
  await shown
  await waitFor(() => text().includes('GitHub was not connected'))
  expect(text()).toContain('different Theorem account')
})

test('the Connections page is left to finish its own, and an address with no sign-in shows nothing', async () => {
  const onPage = arrive('/settings/connections', pending('github'))
  await onPage.shown
  const plain = arrive('/', { connector: 'github', connection: 'connected' })
  await plain.shown
  await new Promise((done) => setTimeout(done, 20))
  expect(completions).toEqual([])
  expect(onPage.taken() + plain.taken()).toBe(0)
  expect(document.querySelector('[data-slot="sign-in-return"]')).toBeNull()
})
