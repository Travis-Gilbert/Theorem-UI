// SOURCING: none — TanStack Start server route over the live block service; where the block listener serves block documents
import { createFileRoute } from '@tanstack/react-router'
import { blockRoutes } from '#/server/desktop/blocks/http'

export const Route = createFileRoute('/desktop/blocks/')({
  server: { handlers: blockRoutes.index },
})
