// SOURCING: none — TanStack Start server route over the workspace service; reads, writes and trashes a file
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/file')({
  server: { handlers: workspaceRoutes.file },
})
