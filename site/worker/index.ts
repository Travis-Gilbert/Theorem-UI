// Serves the static site and accepts waitlist signups at POST /api/waitlist.
// Each address is one KV key, so a repeat signup is idempotent.

// Env (ASSETS, WAITLIST) is generated from wrangler.jsonc: `bun run types`.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

async function readFields(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const body: unknown = await request.json().catch(() => null)
    return body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {}
  }
  const form = await request.formData().catch(() => null)
  return form ? Object.fromEntries(form) : {}
}

async function joinWaitlist(request: Request, env: Env) {
  if (request.method !== 'POST')
    return json({ error: 'method_not_allowed' }, 405)

  const fields = await readFields(request)
  // Honeypot: people never see this field, so anything in it is a bot. Answer
  // as if it worked and store nothing.
  if (typeof fields.company === 'string' && fields.company !== '') {
    return json({ status: 'joined' })
  }

  const email =
    typeof fields.email === 'string' ? fields.email.trim().toLowerCase() : ''
  if (email.length > 254 || !EMAIL.test(email)) {
    return json({ error: 'invalid_email' }, 400)
  }
  const key = `email:${email}`
  if (await env.WAITLIST.get(key)) return json({ status: 'already_joined' })

  const source =
    typeof fields.source === 'string' ? fields.source.slice(0, 64) : 'unknown'
  await env.WAITLIST.put(
    key,
    JSON.stringify({ email, source, joinedAt: new Date().toISOString() }),
  )
  return json({ status: 'joined' })
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/waitlist') return joinWaitlist(request, env)
    if (pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
