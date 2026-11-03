// SOURCING: none — TanStack Start server route that delegates to the installer in src/server/theorem-installer.ts
import { createFileRoute } from '@tanstack/react-router'
import { serveInstaller } from '@/server/theorem-installer'

export const Route = createFileRoute('/install')({
  server: { handlers: { GET: () => serveInstaller() } },
})
