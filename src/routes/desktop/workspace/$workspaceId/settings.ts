// SOURCING: none — TanStack Start server route over the workspace service; the folder's own settings
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute(
  '/desktop/workspace/$workspaceId/settings',
)({
  server: { handlers: workspaceRoutes.settings },
})
