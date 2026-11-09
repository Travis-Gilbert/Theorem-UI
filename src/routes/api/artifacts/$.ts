// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (artifact libraries)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/api/artifacts/$')({
  server: { handlers: proxyHandlers },
})
