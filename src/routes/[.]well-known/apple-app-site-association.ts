// SOURCING: none — TanStack Start server route that delegates to src/server/apple-app-site-association.ts; "[.]" escapes the leading dot in the path segment
import { createFileRoute } from '@tanstack/react-router'
import { appSiteAssociation } from '@/server/apple-app-site-association'

export const Route = createFileRoute('/.well-known/apple-app-site-association')(
  {
    server: { handlers: { GET: () => appSiteAssociation() } },
  },
)
