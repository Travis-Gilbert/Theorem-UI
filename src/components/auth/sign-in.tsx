// SOURCING: coss ui Form, existing Base UI Button and theme tokens.
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import {
  safeReturnTo,
  signInFailureMessage,
} from '@/lib/theorem/auth-navigation'
import { useSignInOptions } from '@/lib/theorem/sign-in'
import type { SignInOptions } from '@/server/theorem-auth'

export function SignIn({
  failure,
  returnTo = '/',
  options: given,
}: {
  failure?: string
  returnTo?: string
  /** The ways in; fetched here when the page did not load them. */
  options?: SignInOptions
}) {
  const fetched = useSignInOptions(!given)
  const options = given ?? fetched
  const back = safeReturnTo(returnTo)
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12 text-foreground">
      <section aria-labelledby="sign-in-heading" className="w-full max-w-sm">
        <a href="/" className="font-heading text-xl font-semibold">
          Theorem
        </a>
        <h1
          id="sign-in-heading"
          className="mt-12 font-heading text-3xl font-medium"
        >
          Your work, continued.
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          Sign in to open your projects and pick up your conversations.
        </p>
        {failure && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-border bg-muted p-4 text-sm leading-6"
          >
            <p className="font-medium">Sign-in didn’t finish</p>
            <p className="mt-1 text-ink-muted">
              {signInFailureMessage(failure)}
            </p>
          </div>
        )}
        <Form
          action="/auth/sign-in"
          method="get"
          className="mt-8 flex flex-col gap-3"
        >
          <input type="hidden" name="returnTo" value={back} />
          {!options && (
            <p className="text-sm text-ink-muted" aria-live="polite">
              One moment…
            </p>
          )}
          {options?.providers.map((provider, index) => (
            <Button
              key={provider.id}
              type="submit"
              name="identity_provider"
              value={provider.id}
              size="lg"
              variant={index === 0 ? 'default' : 'outline'}
              className="w-full"
            >
              Continue with {provider.name}
            </Button>
          ))}
          <p className="text-xs leading-5 text-ink-muted">
            You’ll sign in there and come back here.
          </p>
        </Form>
        {options?.codeSignIn && (
          <div className="mt-12 border-t border-border pt-5 text-xs leading-5 text-ink-muted">
            <p>
              Can’t sign in in this browser, such as an agent’s browser?{' '}
              <a
                href={`/login/code?${new URLSearchParams({ returnTo: back })}`}
                className="text-link underline underline-offset-4"
              >
                Sign in with a code
              </a>{' '}
              and approve it from a browser where you can.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
