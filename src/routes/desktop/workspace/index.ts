// SOURCING: none — TanStack Start server route over the workspace service; lists the open folder workspaces
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute('/desktop/workspace/')({
  server: { handlers: workspaceRoutes.list },
})
