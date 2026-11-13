// SOURCING: bun:test over why the navigator's Files section has no Home.
import { expect, test } from 'bun:test'
import { homeAbsence } from './folders'

test('Home offers sign-in only when Theorem says no one is signed in', () => {
  const base = { isPending: false, signIn: true }
  expect(homeAbsence({ ...base, signedOut: true })).toBe('signed-out')
  // Signed in, or a session that failed for another reason.
  expect(homeAbsence({ ...base, signedOut: false })).toBeNull()
  // The session or the folders are still loading.
  expect(homeAbsence({ ...base, isPending: true, signedOut: false })).toBe(
    'loading',
  )
  expect(homeAbsence({ ...base, signIn: false, signedOut: true })).toBeNull()
})

test('signed-in vault failures remain visible instead of becoming an empty panel', () => {
  for (const vaultAbsence of [
    'failed',
    'forbidden',
    'unsupported',
    'unconfigured',
  ] as const) {
    expect(
      homeAbsence({
        isPending: false,
        signIn: true,
        signedOut: false,
        vaultAbsence,
      }),
    ).toBe(vaultAbsence)
  }
  expect(
    homeAbsence({
      isPending: false,
      signIn: true,
      signedOut: false,
      vaultAbsence: 'signed-out',
    }),
  ).toBe('signed-out')
})

test('failed Home renders its error and a usable retry action', async () => {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { HomeAbsent } = await import('./folders')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let retries = 0
  try {
    await act(async () =>
      root.render(<HomeAbsent absence="failed" retry={() => retries++} />),
    )
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Home could not load',
    )
    await act(async () => container.querySelector('button')!.click())
    expect(retries).toBe(1)
    expect(container.querySelector('a')).toBeNull()
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
