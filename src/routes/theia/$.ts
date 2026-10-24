// SOURCING: none — TanStack Start server route; the Theia build itself is served by Nitro's publicAssets (vite.config.ts)
//
// Nitro serves the Theia build at /theia before any route runs, so this route
// only answers for a file the build does not have, or for the whole IDE when
// ide/ has not been built. Without it the app's own router would render inside
// the IDE frame and nest the shell in itself.
import { createFileRoute } from '@tanstack/react-router'

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })

/** The frame's page missing means the build is; any other file is just absent. */
function missing({ params }: { params: { _splat?: string } }) {
  return !params._splat || params._splat === 'index.html'
    ? text(
        503,
        'The IDE is not built on this server. Run `bun install && bun run build` in ide/, then restart the server.\n',
      )
    : text(404, 'Not found\n')
}

export const Route = createFileRoute('/theia/$')({
  server: { handlers: { GET: missing, HEAD: missing } },
})
