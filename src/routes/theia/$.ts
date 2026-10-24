// SOURCING: none — TanStack Start server route; the Theia build itself is served by Nitro's publicAssets (vite.config.ts)
//
// Nitro serves the Theia build at /theia before any route runs, so this route
// only answers when ide/ has not been built. Without it the app's own router
// would render inside the IDE frame and nest the shell in itself.
import { createFileRoute } from '@tanstack/react-router'

const unbuilt = () =>
  new Response(
    'The IDE is not built on this server. Run `bun install && bun run build` in ide/, then restart the server.\n',
    { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
  )

export const Route = createFileRoute('/theia/$')({
  server: { handlers: { GET: unbuilt, HEAD: unbuilt } },
})
