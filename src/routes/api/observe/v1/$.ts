// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (the node's observations of turns)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/api/observe/v1/$')({
  server: { handlers: { GET: proxyHandlers.GET } },
})
