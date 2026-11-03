// SOURCING: none — TanStack Start server route over the workspace service; a note's links
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/links')({
  server: { handlers: workspaceRoutes.links },
})
