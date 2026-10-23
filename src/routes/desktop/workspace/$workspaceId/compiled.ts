// SOURCING: none — TanStack Start server route over the live block service; the content-addressed store of compiled blocks
import { createFileRoute } from '@tanstack/react-router'
import { blockRoutes } from '#/server/desktop/blocks/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/compiled')({
  server: { handlers: blockRoutes.compiled },
})
