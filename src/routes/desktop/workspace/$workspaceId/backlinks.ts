// SOURCING: none — TanStack Start server route over the workspace service; the links to an entry
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute(
  '/desktop/workspace/$workspaceId/backlinks',
)({
  server: { handlers: workspaceRoutes.backlinks },
})
