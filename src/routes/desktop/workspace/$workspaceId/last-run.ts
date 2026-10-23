// SOURCING: none — TanStack Start server route over the live block service; last-run values of a block source, by its hash
import { createFileRoute } from '@tanstack/react-router'
import { blockRoutes } from '#/server/desktop/blocks/http'

export const Route = createFileRoute('/desktop/workspace/$workspaceId/last-run')({
  server: { handlers: blockRoutes.lastRun },
})
