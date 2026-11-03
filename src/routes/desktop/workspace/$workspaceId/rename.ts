// SOURCING: none — TanStack Start server route over the workspace service; renames or moves an entry
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/rename')({
  server: { handlers: workspaceRoutes.rename },
})
