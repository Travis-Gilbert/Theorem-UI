// SOURCING: none — TanStack Start server route over the workspace service; a workspace's tags
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/tags')({
  server: { handlers: workspaceRoutes.tags },
})
