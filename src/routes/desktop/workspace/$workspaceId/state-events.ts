// SOURCING: none — TanStack Start server route over the live block service; changes to a workspace's live block state (SSE)
import { createFileRoute } from '@tanstack/react-router'
import { blockRoutes } from '#/server/desktop/blocks/http'

export const Route = createFileRoute(
  '/desktop/workspace/$workspaceId/state-events',
)({
  server: { handlers: blockRoutes.stateEvents },
})
