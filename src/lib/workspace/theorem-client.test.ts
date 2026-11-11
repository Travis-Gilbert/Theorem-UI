// SOURCING: bun:test over getTheoremVault with window.fetch stubbed, so the
// SDK's Files API call meets each refusal the backend can give.
import { afterAll, afterEach, beforeAll, expect, spyOn, test } from 'bun:test'
import { THEOREM_WORKSPACE_PREFIX, getTheoremVault } from './theorem-client'

const { happyDOM } = window as unknown as {
  happyDOM: { setURL: (url: string) => void }
}
beforeAll(() => happyDOM.setURL('http://localhost:3000/'))
afterAll(() => happyDOM.setURL('about:blank'))

let answer: () => Response
const fetched = spyOn(window, 'fetch')
beforeAll(() => {
  fetched.mockImplementation((async () => answer()) as unknown as typeof fetch)
})
afterEach(() => fetched.mockClear())
afterAll(() => fetched.mockRestore())

const problem = (status: number, body?: object) => () =>
  new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: body ? { 'content-type': 'application/problem+json' } : {},
  })

// The deployed backend once had no Files API: its bare 404 read as "the vault
// is not open", which said nothing about why.
test('a refusal says why there is no vault', async () => {
  answer = problem(404)
  expect(await getTheoremVault()).toBe('unsupported')
  answer = problem(501, { code: 'not_implemented' })
  expect(await getTheoremVault()).toBe('unsupported')
  answer = problem(401, { code: 'theorem_signed_out' })
  expect(await getTheoremVault()).toBe('signed-out')
  answer = problem(403, { code: 'forbidden' })
  expect(await getTheoremVault()).toBe('forbidden')
  answer = problem(503, { code: 'theorem_unconfigured' })
  expect(await getTheoremVault()).toBe('unconfigured')
  expect(fetched).toHaveBeenCalled()
})

test('an outage is an error, not an absence', async () => {
  answer = problem(503, { code: 'unavailable' })
  await expect(getTheoremVault()).rejects.toBeDefined()
  answer = problem(500, { code: 'internal' })
  await expect(getTheoremVault()).rejects.toBeDefined()
})

test('a vault is a workspace', async () => {
  answer = () =>
    new Response(
      JSON.stringify({
        schema: 'theorem-files/1',
        vaultId: 'v1',
        name: 'Theorem',
        trusted: true,
      }),
      { headers: { 'content-type': 'application/json' } },
    )
  expect(await getTheoremVault()).toMatchObject({
    id: `${THEOREM_WORKSPACE_PREFIX}v1`,
    name: 'Theorem',
    trusted: true,
  })
})
