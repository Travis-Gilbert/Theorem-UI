// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (IDE workspace capabilities)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/api/capabilities/v1/$')({
  server: { handlers: proxyHandlers },
})
