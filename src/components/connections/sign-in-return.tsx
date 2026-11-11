// SOURCING: @tanstack/react-router useLocation and useNavigate over components/connections/connection-return (FinishingSignIn, ConnectionReturn); nothing upstream finishes Theorem's own two-step sign-in
import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import {
  ConnectionReturn,
  FinishingSignIn,
  readPending,
} from '@/components/connections/connection-return'
import type {
  ConnectionOutcome,
  PendingSignIn,
} from '@/components/connections/connection-return'
import { connectionKeys } from '@/lib/theorem/connections'

/** The Connections page reports a sign-in in its own place. */
const REPORTS_ITS_OWN = '/settings/connections'

/** The account list the Life panel reads (components/program/life-panel). */
const LIFE_CONNECTORS = ['life', 'connectors']

/**
 * Finishes a sign-in the person was returned from on any page other than
 * Connections, and says how it ended over the page they came back to.
 * `onTaken` runs once the token has been read, to clear it from the address.
 */
export function SignInNotice({
  pathname,
  search,
  onTaken,
}: {
  pathname: string
  search: { connector?: unknown; connection?: unknown; completion?: unknown }
  onTaken: () => void
}) {
  const client = useQueryClient()
  // The sign-in taken from the address, kept after the address is cleared and
  // after its notice is dismissed, so one token is only ever finished once.
  const [signIn, setSignIn] = useState<{
    pending: PendingSignIn
    outcome?: ConnectionOutcome
    dismissed?: boolean
  }>()
  const arrived =
    pathname === REPORTS_ITS_OWN ? undefined : readPending(texts(search))
  const token = arrived?.completion
  if (arrived && token !== signIn?.pending.completion)
    setSignIn({ pending: arrived })
  useEffect(() => {
    if (token) onTaken()
  }, [token, onTaken])

  if (!signIn || signIn.dismissed) return null
  const { pending, outcome } = signIn
  return (
    <div
      data-slot="sign-in-return"
      className="fixed inset-x-0 top-4 z-50 mx-auto w-full max-w-md px-4"
    >
      {outcome ? (
        <ConnectionReturn
          outcome={outcome}
          onDismiss={() => setSignIn({ pending, outcome, dismissed: true })}
        />
      ) : (
        <FinishingSignIn
          key={pending.completion}
          pending={pending}
          onDone={(ended) => {
            setSignIn({ pending, outcome: ended })
            void client.invalidateQueries({ queryKey: connectionKeys.all })
            void client.invalidateQueries({ queryKey: LIFE_CONNECTORS })
          }}
        />
      )}
    </div>
  )
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
const texts = (search: {
  connector?: unknown
  connection?: unknown
  completion?: unknown
}) => ({
  connector: text(search.connector),
  connection: text(search.connection),
  completion: text(search.completion),
})

/** `SignInNotice` on the router's address; mounted once, at the root. */
export function SignInReturn() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const search = useLocation({ select: (location) => location.search })
  const navigate = useNavigate()
  const clear = useCallback(
    () =>
      void navigate({
        to: '.',
        search: (rest: Record<string, unknown>) => ({
          ...rest,
          connector: undefined,
          connection: undefined,
          completion: undefined,
        }),
        replace: true,
      }),
    [navigate],
  )
  return <SignInNotice pathname={pathname} search={search} onTaken={clear} />
}
