// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (run commands)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/v1/theorem/agent/stream/$')({
  server: { handlers: proxyHandlers },
})
