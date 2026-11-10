// SOURCING: @tanstack/react-query (useMutation starts the code, useQuery's refetchInterval polls it), existing Base UI Button and theme tokens; the protocol is src/server/theorem-auth.ts over oauth4webapi.
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { safeReturnTo } from '@/lib/theorem/auth-navigation'
import { pollCodeSignIn, startCodeSignIn } from '@/lib/theorem/sign-in'

/**
 * Sign-in for a browser that cannot sign in itself, such as an agent's. This
 * page shows a code; the person approves it in a browser where they can sign
 * in, and this page signs in when the approval lands.
 */
export function CodeSignIn({ returnTo = '/' }: { returnTo?: string }) {
  const back = safeReturnTo(returnTo)
  const start = useMutation({
    mutationFn: () => startCodeSignIn({ data: { returnTo: back } }),
  })
  const code = start.data
  // Start once on arrival; a new code is a button press after that.
  const { mutate, status } = start
  useEffect(() => {
    if (status === 'idle') mutate()
  }, [mutate, status])

  const poll = useQuery({
    queryKey: ['theorem', 'code-sign-in', code?.userCode],
    queryFn: () => pollCodeSignIn(),
    enabled: Boolean(code),
    refetchInterval: (query) => {
      const result = query.state.data
      if (!result) return (code?.interval ?? 5) * 1000
      return result.status === 'pending' ? result.interval * 1000 : false
    },
    refetchIntervalInBackground: true,
    retry: false,
    gcTime: 0,
  })
  const result = poll.data
  useEffect(() => {
    if (result?.status === 'signed_in')
      window.location.assign(safeReturnTo(result.returnTo))
  }, [result])

  const restart = (
    <Button
      size="lg"
      variant="outline"
      className="mt-6 w-full"
      onClick={() => start.mutate()}
      disabled={start.isPending}
    >
      Get a new code
    </Button>
  )

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12 text-foreground">
      <section
        aria-labelledby="code-sign-in-heading"
        className="w-full max-w-sm"
      >
        <a href="/" className="font-heading text-xl font-semibold">
          Theorem
        </a>
        <h1
          id="code-sign-in-heading"
          className="mt-12 font-heading text-3xl font-medium"
        >
          Sign in with a code
        </h1>
        {start.isError || (start.isSuccess && !code) ? (
          <div role="alert" className="mt-6 text-sm leading-6">
            <p className="font-medium">No code right now</p>
            <p className="mt-1 text-ink-muted">
              {start.isSuccess
                ? 'This Theorem does not offer sign-in with a code.'
                : 'The sign-in service could not be reached. Please try again.'}
            </p>
            {start.isError && restart}
          </div>
        ) : !code ? (
          <p className="mt-6 text-sm text-ink-muted" aria-live="polite">
            Getting a code…
          </p>
        ) : result?.status === 'denied' ? (
          <div role="alert" className="mt-6 text-sm leading-6">
            <p className="font-medium">That sign-in was refused</p>
            <p className="mt-1 text-ink-muted">
              The account used to approve the code is not admitted to this
              Theorem.
            </p>
            {restart}
          </div>
        ) : result?.status === 'expired' ? (
          <div role="alert" className="mt-6 text-sm leading-6">
            <p className="font-medium">This code expired</p>
            <p className="mt-1 text-ink-muted">
              Codes last a few minutes. Get a new one and approve it sooner.
            </p>
            {restart}
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              In a browser where you can sign in, such as your own, open the
              link below and approve this code. This page signs in on its own
              once you do. To approve it as a different account from the one you
              use there, open the link in a private window.
            </p>
            <p
              className="mt-8 font-mono text-3xl font-medium tracking-[0.2em]"
              aria-label={`Code ${code.userCode.split('').join(' ')}`}
            >
              {code.userCode}
            </p>
            <a
              href={code.verificationUriComplete ?? code.verificationUri}
              target="_blank"
              rel="noreferrer"
              className="mt-4 block break-all text-sm text-link underline underline-offset-4"
            >
              {code.verificationUriComplete ?? code.verificationUri}
            </a>
            <p
              className="mt-6 text-xs leading-5 text-ink-muted"
              aria-live="polite"
            >
              {result?.status === 'unavailable' || poll.isError
                ? 'Theorem could not be reached. Still trying.'
                : 'Waiting for approval…'}
            </p>
          </>
        )}
        <p className="mt-12 border-t border-border pt-5 text-xs leading-5 text-ink-muted">
          <a
            href={`/login?${new URLSearchParams({ returnTo: back })}`}
            className="text-link underline underline-offset-4"
          >
            Sign in another way
          </a>
        </p>
      </section>
    </main>
  )
}
