// SOURCING: none — TanStack Start server route over the workspace service; sets the folder's trust
import { createFileRoute } from '@tanstack/react-router'
import { workspaceRoutes } from '#/server/desktop/workspace/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/trust')({
  server: { handlers: workspaceRoutes.trust },
})
