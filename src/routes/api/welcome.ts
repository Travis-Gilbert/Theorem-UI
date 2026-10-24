// SOURCING: none — TanStack Start server route that delegates to the welcome handler
import { createFileRoute } from '@tanstack/react-router'
import { welcome } from '@/server/welcome'

export const Route = createFileRoute('/api/welcome')({
  server: { handlers: { POST: ({ request }) => welcome(request) } },
})
