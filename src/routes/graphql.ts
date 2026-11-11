// SOURCING: none — TanStack Start server route that delegates to the Theorem proxy (the schema register and its records over /graphql)
import { createFileRoute } from '@tanstack/react-router'
import { proxyHandlers } from '@/server/theorem-proxy'

export const Route = createFileRoute('/graphql')({
  server: { handlers: proxyHandlers },
})
