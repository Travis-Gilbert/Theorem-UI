// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (project files)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/api/project-files/v1/$')({
  server: { handlers: proxyHandlers },
})
