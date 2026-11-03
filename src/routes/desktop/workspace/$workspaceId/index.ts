// SOURCING: none — TanStack Start server route over the workspace service; one workspace's summary
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/')({
  server: { handlers: workspaceRoutes.summary },
})
