// SOURCING: @neon/auth/server handleAuthProxyRequest (Neon's framework-agnostic same-origin proxy); this file only mounts it as a TanStack Start server route.
//
// Neon Auth answers here, on this origin, so its session cookie is a
// first-party cookie of theorem.rs and the email sign-in works in browsers that
// block third-party cookies, the Claude desktop app's built-in browser among
// them. The proxy forwards only Neon's own cookies and rewrites the ones Neon
// sets as this origin's.
import { createFileRoute } from '@tanstack/react-router'

async function proxy({
  request,
  params,
}: {
  request: Request
  params: { _splat?: string }
}) {
  const baseUrl = process.env.NEON_AUTH_BASE_URL
  const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET
  if (!baseUrl || !cookieSecret || cookieSecret.length < 32)
    return Response.json(
      {
        title: 'Email sign-in is not configured',
        status: 503,
        detail:
          'Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET (32 characters or more).',
      },
      { status: 503, headers: { 'content-type': 'application/problem+json' } },
    )
  const { handleAuthProxyRequest } = await import('@neon/auth/server')
  return handleAuthProxyRequest({
    request,
    path: params._splat ?? '',
    baseUrl: baseUrl.replace(/\/$/, ''),
    cookieSecret,
  })
}

export const Route = createFileRoute('/auth/neon/$')({
  server: { handlers: { GET: proxy, POST: proxy } },
})
