// SOURCING: none — TanStack Router file route that renders src/components/auth/code-sign-in.tsx
import { createFileRoute } from '@tanstack/react-router'
import { CodeSignIn } from '@/components/auth/code-sign-in'

export const Route = createFileRoute('/login_/code')({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : '/',
  }),
  head: () => ({ meta: [{ title: 'Sign in with a code · Theorem' }] }),
  component: LoginCode,
})

function LoginCode() {
  return <CodeSignIn returnTo={Route.useSearch().returnTo} />
}
