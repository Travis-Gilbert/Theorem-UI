// SOURCING: none — TanStack Start server route over the live block service; a signed link to an HTML app's files on the block listener
import { createFileRoute } from '@tanstack/react-router'
import { blockRoutes } from '#/server/desktop/blocks/http'

export const Route = createFileRoute('/desktop/blocks/app-token')({
  server: { handlers: blockRoutes.appToken },
})
