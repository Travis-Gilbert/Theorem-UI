// SOURCING: none — TanStack Start server route over the workspace service; a note's frontmatter
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute(
  '/desktop/workspace/$workspaceId/properties',
)({
  server: { handlers: workspaceRoutes.properties },
})
