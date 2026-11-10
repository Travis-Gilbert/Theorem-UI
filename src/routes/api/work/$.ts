// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (work tracker settings)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/api/work/$')({
  server: { handlers: proxyHandlers },
})
