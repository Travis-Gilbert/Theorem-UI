// SOURCING: none — TanStack Start server route over the live block service; a workspace's live block state document (Loro), read whole or merged into
import { createFileRoute } from '@tanstack/react-router'
import { blockRoutes } from '#/server/desktop/blocks/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/state')({
  server: { handlers: blockRoutes.state },
})
