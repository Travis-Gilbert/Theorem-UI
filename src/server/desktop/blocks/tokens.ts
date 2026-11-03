// SOURCING: node:crypto (HMAC-SHA256 and a constant-time compare). An HTML
// app's files are served under a token the app page asked for, so nothing
// else on the machine can name them; the token format is this app's own.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/** A new secret for each run of the server, so tokens never outlive it. */
const SECRET = randomBytes(32)

const payload = z.object({
  /** The workspace id. */
  w: z.string(),
  /** The app's folder, relative to the workspace root; '' for the root. */
  r: z.string(),
  /** Expiry, in milliseconds since the epoch. */
  e: z.number(),
})

export type AppToken = z.infer<typeof payload>

/** Twelve hours: a frame open longer than that asks for a fresh one. */
export const APP_TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000

const sign = (body: string, secret: Uint8Array) =>
  createHmac('sha256', secret).update(body).digest('base64url')

export function issueAppToken(
  workspace: string,
  root: string,
  now = Date.now(),
  secret: Uint8Array = SECRET,
): string {
  const body = Buffer.from(
    JSON.stringify({ w: workspace, r: root, e: now + APP_TOKEN_LIFETIME_MS }),
  ).toString('base64url')
  return `${body}.${sign(body, secret)}`
}

/** The token's contents, or null when it is forged, malformed or expired. */
export function readAppToken(
  token: string,
  now = Date.now(),
  secret: Uint8Array = SECRET,
): AppToken | null {
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra !== undefined) return null
  const expected = Buffer.from(sign(body, secret))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null
  try {
    const parsed = payload.parse(
      JSON.parse(Buffer.from(body, 'base64url').toString('utf8')),
    )
    return parsed.e > now ? parsed : null
  } catch {
    return null
  }
}
