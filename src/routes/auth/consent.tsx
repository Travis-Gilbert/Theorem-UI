// SOURCING: none — TanStack Router file route that renders src/components/auth/email-consent.tsx
import { createFileRoute } from '@tanstack/react-router'
import { EmailConsent } from '@/components/auth/email-consent'
import { authPageHeaders } from '@/lib/theorem/auth-navigation'

export const Route = createFileRoute('/auth/consent')({
  headers: () => authPageHeaders,
  head: () => ({ meta: [{ title: 'Allow access · Theorem' }] }),
  component: EmailConsent,
})
