// SOURCING: none — TanStack Start server route over the workspace service; full-text search
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/search')({
  server: { handlers: workspaceRoutes.search },
})
