// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (Index workspace and Atlas)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/api/index/$')({
  server: { handlers: proxyHandlers },
})
