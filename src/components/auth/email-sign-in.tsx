// SOURCING: @neon/auth client (src/lib/theorem/neon-auth.ts) for the sign-in calls, @tanstack/react-query for the session check and the submit, coss ui Form with the existing Base UI Input and Button.
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { hasAuthorizationQuery, neonAuth } from '@/lib/theorem/neon-auth'

type Failure = 'credentials' | 'expired' | 'unavailable'

const failureText: Record<Failure, string> = {
  credentials: 'That email and password don’t match an account here.',
  expired:
    'This sign-in expired. Start again from the sign-in page in this browser.',
  unavailable: 'The sign-in service could not be reached. Please try again.',
}

/**
 * Neon Auth's login page for Theorem. Theorem's issuer sends a person to Neon
 * to sign in with email; Neon sends them here with a signed authorization
 * query. Signing in hands the query back, and Neon returns the browser to
 * Theorem's issuer with an authorization code.
 */
export function EmailSignIn() {
  // The signed query exactly as Neon sent it.
  const search = useLocation({ select: (location) => location.searchStr })
  const authorizing = hasAuthorizationQuery(search)

  // Someone already signed in to Neon in this browser only needs to continue.
  const session = useQuery({
    queryKey: ['neon-auth', 'session'],
    queryFn: async () => (await neonAuth().getSession()).data ?? null,
    enabled: authorizing,
    retry: false,
  })
  const signedIn = Boolean(session.data?.session)
  useEffect(() => {
    if (signedIn) void neonAuth().oauth2.continue({ selected: true })
  }, [signedIn])

  const [failure, setFailure] = useState<Failure>()
  const signIn = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      setFailure(undefined)
      const { error } = await neonAuth().signIn.email(credentials)
      if (!error) return // Neon's response navigates on to Theorem.
      setFailure(
        error.status === 401 || error.status === 403
          ? 'credentials'
          : error.status && error.status < 500
            ? 'expired'
            : 'unavailable',
      )
    },
    onError: () => setFailure('unavailable'),
  })
  const busy = signIn.isPending || (signIn.isSuccess && !failure) || signedIn

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12 text-foreground">
      <section
        aria-labelledby="email-sign-in-heading"
        className="w-full max-w-sm"
      >
        <a href="/" className="font-heading text-xl font-semibold">
          Theorem
        </a>
        <h1
          id="email-sign-in-heading"
          className="mt-12 font-heading text-3xl font-medium"
        >
          Sign in with email
        </h1>
        {authorizing && session.isPending ? (
          <p className="mt-6 text-sm text-ink-muted" aria-live="polite">
            One moment…
          </p>
        ) : !authorizing ? (
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            Start from the{' '}
            <a href="/login" className="text-link underline underline-offset-4">
              sign-in page
            </a>{' '}
            and choose email there.
          </p>
        ) : signedIn ? (
          <p className="mt-6 text-sm text-ink-muted" aria-live="polite">
            Signing you in…
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              Use the email and password for your Theorem account.
            </p>
            {failure && (
              <div
                role="alert"
                className="mt-6 rounded-lg border border-border bg-muted p-4 text-sm leading-6"
              >
                {failureText[failure]}
              </div>
            )}
            <Form
              className="mt-8 flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                signIn.mutate({
                  email: String(form.get('email') ?? ''),
                  password: String(form.get('password') ?? ''),
                })
              }}
            >
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Email
                <Input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  disabled={busy}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Password
                <Input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={busy}
                />
              </label>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={busy}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </Form>
          </>
        )}
        <p className="mt-12 border-t border-border pt-5 text-xs leading-5 text-ink-muted">
          <a href="/login" className="text-link underline underline-offset-4">
            Sign in another way
          </a>
        </p>
      </section>
    </main>
  )
}
