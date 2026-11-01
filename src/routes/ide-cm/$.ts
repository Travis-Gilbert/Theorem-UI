// SOURCING: none — TanStack Start server route; the CodeMirror IDE build itself is served by Nitro's publicAssets (vite.config.ts)
//
// Nitro serves the build at /ide-cm before any route runs, so this route only
// answers for a file the build does not have, or for the whole IDE when
// ide-cm/ has not been built. Without it the app's own router would render
// inside the IDE frame and nest the shell in itself (the same reason /theia/$
// exists).
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
        'The CodeMirror IDE is not built on this server. Run `bun install && bun run build` in ide-cm/, then restart the server.\n',
      )
    : text(404, 'Not found\n')
}

export const Route = createFileRoute('/ide-cm/$')({
  server: { handlers: { GET: missing, HEAD: missing } },
})
