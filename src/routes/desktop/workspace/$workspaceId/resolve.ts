// SOURCING: none — TanStack Start server route over the workspace service; resolves a link target
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/resolve')(
  {
    server: { handlers: workspaceRoutes.resolve },
  },
)
