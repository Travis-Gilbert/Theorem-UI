// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (GitHub and MCP connections)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/api/connections/$')({
  server: { handlers: proxyHandlers },
})
