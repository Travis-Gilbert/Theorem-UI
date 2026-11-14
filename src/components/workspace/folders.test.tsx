// SOURCING: bun:test over why the navigator's Files section has no Home.
import { expect, spyOn, test } from 'bun:test'
import { homeAbsence } from './folders'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

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

test('compact Files keeps Home and Retry for a failed vault request', async () => {
  const { QueryClient, QueryClientProvider } =
    await import('@tanstack/react-query')
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { FoldersSection } = await import('./folders')
  const desktop = await import('@/lib/workspace/desktop-client')
  const theorem = await import('@/lib/workspace/theorem-client')
  const desktopSpy = spyOn(desktop, 'listDesktopWorkspaces').mockResolvedValue(
    null,
  )
  let requests = 0
  const vaultSpy = spyOn(theorem, 'getTheoremVault').mockImplementation(
    async () => {
      requests++
      throw new Error('Vault temporarily unavailable')
    },
  )
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queries.setQueryData(['theorem', 'bootstrap'], { tenantId: 'test-person' })
  queries.setQueryData(['theorem', 'sign-in-configured'], true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={queries}>
          <FoldersSection fill={false} />
        </QueryClientProvider>,
      )
    })
    for (
      let attempt = 0;
      attempt < 20 && !container.querySelector('[aria-label="Files"]');
      attempt++
    ) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
    }
    expect(requests).toBe(1)
    expect(queries.getQueryState(['theorem', 'vault'])?.status).toBe('error')
    expect(container.querySelector('[aria-label="Files"]')).not.toBeNull()
    expect(
      container.querySelector('[aria-label="Home"]')?.textContent,
    ).toContain('Home could not load')
    expect(container.textContent).toContain('Vault temporarily unavailable')
    const retry = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Retry',
    )
    expect(retry).toBeDefined()
    const before = requests
    await act(async () => {
      retry!.click()
    })
    expect(requests).toBe(before + 1)
  } finally {
    await act(async () => root.unmount())
    queries.clear()
    desktopSpy.mockRestore()
    vaultSpy.mockRestore()
    container.remove()
  }
})
