// SOURCING: none — TanStack Start server route over the workspace service; a workspace's change events (SSE)
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/events')({
  server: { handlers: workspaceRoutes.events },
})
