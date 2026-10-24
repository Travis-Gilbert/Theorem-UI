// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (IDE workspace environment)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/api/environment/v1/$')({
  server: { handlers: proxyHandlers },
})
