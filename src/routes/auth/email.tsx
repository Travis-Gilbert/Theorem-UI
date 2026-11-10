// SOURCING: none — TanStack Router file route that renders src/components/auth/email-sign-in.tsx
import { createFileRoute } from '@tanstack/react-router'
import { EmailSignIn } from '@/components/auth/email-sign-in'
import { authPageHeaders } from '@/lib/theorem/auth-navigation'

export const Route = createFileRoute('/auth/email')({
  headers: () => authPageHeaders,
  head: () => ({ meta: [{ title: 'Sign in with email · Theorem' }] }),
  component: EmailSignIn,
})
