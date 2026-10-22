// SOURCING: none — TanStack Start server route that delegates to the sign-in flow in src/server/theorem-auth.ts
import { createFileRoute } from '@tanstack/react-router'
import { signInCallback } from '@/server/theorem-auth'

export const Route = createFileRoute('/auth/callback')({
  server: { handlers: { GET: ({ request }) => signInCallback(request) } },
})
