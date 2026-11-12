// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (the artifact host and a notebook's recorded outputs)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/api/artifacts/v1/$')({
  server: { handlers: proxyHandlers },
})
