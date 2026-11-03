// SOURCING: coss ui Form, existing Base UI Button and theme tokens.
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import {
  safeReturnTo,
  signInFailureMessage,
} from '@/lib/theorem/auth-navigation'

export function SignIn({
  failure,
  returnTo = '/',
}: {
  failure?: string
  returnTo?: string
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12 text-foreground">
      <section aria-labelledby="sign-in-heading" className="w-full max-w-sm">
        <a href="/" className="font-heading text-xl tracking-tight">
          Theorem
        </a>
        <h1
          id="sign-in-heading"
          className="mt-12 font-heading text-3xl tracking-tight"
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
          className="mt-8 flex flex-col gap-4"
        >
          <input type="hidden" name="returnTo" value={safeReturnTo(returnTo)} />
          <Button type="submit" size="lg" className="w-full">
            Continue with GitHub
          </Button>
          <p className="text-xs leading-5 text-ink-muted">
            You’ll sign in on GitHub and return here. You can use your GitHub
            passkey in Safari, Chrome, or another browser that supports it.
          </p>
        </Form>
        <p className="mt-12 border-t border-border pt-5 text-xs leading-5 text-ink-muted">
          Using an agent browser? Open{' '}
          <a
            href="https://theorem.rs/login"
            className="text-link underline underline-offset-4"
          >
            theorem.rs/login
          </a>{' '}
          in your regular browser to sign in.
        </p>
      </section>
    </main>
  )
}
