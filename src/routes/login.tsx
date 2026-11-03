import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@/components/auth/sign-in'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    signin_error:
      typeof search.signin_error === 'string' ? search.signin_error : undefined,
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : '/',
  }),
  head: () => ({ meta: [{ title: 'Sign in · Theorem' }] }),
  component: Login,
})

function Login() {
  const search = Route.useSearch()
  return <SignIn failure={search.signin_error} returnTo={search.returnTo} />
}
