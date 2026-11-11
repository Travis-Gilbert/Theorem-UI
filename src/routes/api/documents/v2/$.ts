// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (documents, collections and filing)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/api/documents/v2/$')({
  server: { handlers: proxyHandlers },
})
