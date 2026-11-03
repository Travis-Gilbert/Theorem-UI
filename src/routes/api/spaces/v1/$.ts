// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/api/spaces/v1/$')({
  server: { handlers: proxyHandlers },
})
