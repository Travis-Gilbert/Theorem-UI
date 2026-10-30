// SOURCING: none — TanStack Start server route over the workspace service; every note and its links, for the graph view
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/graph')({
  server: { handlers: workspaceRoutes.graph },
})
