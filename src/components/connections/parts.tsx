// SOURCING: coss ui Badge over date-fns (how long ago); the wording for each connection state is Theorem's own, so it lives here once for the settings page and the composer
import { formatDistanceToNowStrict } from 'date-fns'
import { Badge } from '@/components/coss/badge'
import type {
  Connection,
  ConnectionStatus,
  DeliveryState,
  McpServer,
  ToolEffect,
} from '@/lib/theorem/connections'

/** "5 minutes ago", or "just now" inside the first minute. */
export function ago(iso: string | undefined): string | undefined {
  if (!iso) return undefined
  const at = new Date(iso).getTime()
  if (Number.isNaN(at)) return undefined
  return Date.now() - at < 60_000
    ? 'just now'
    : `${formatDistanceToNowStrict(at)} ago`
}

type Variant = 'success' | 'warning' | 'error' | 'secondary' | 'outline'

const STATUS: Record<ConnectionStatus, { label: string; variant: Variant }> = {
  connected: { label: 'Connected', variant: 'success' },
  needs_auth: { label: 'Needs sign-in', variant: 'warning' },
  error: { label: 'Error', variant: 'error' },
  disconnected: { label: 'Not connected', variant: 'secondary' },
}

/** The connection's state; a connected one that is struggling says so. */
export function StatusBadge({
  status,
  health,
}: Pick<Connection, 'status' | 'health'>) {
  const degraded = status === 'connected' && health.state !== 'ok' && health.state !== 'unknown'
  const { label, variant } = degraded
    ? health.state === 'failing'
      ? { label: 'Failing', variant: 'error' as const }
      : { label: 'Degraded', variant: 'warning' as const }
    : STATUS[status]
  return <Badge variant={variant}>{label}</Badge>
}

const EFFECT: Record<ToolEffect, { label: string; variant: Variant }> = {
  read: { label: 'Read', variant: 'secondary' },
  write: { label: 'Write', variant: 'warning' },
  unknown: { label: 'Effect unknown', variant: 'outline' },
}

/** Whether a tool only looks, changes something, or has not said. */
export function EffectBadge({ effect }: { effect: ToolEffect }) {
  const { label, variant } = EFFECT[effect]
  return <Badge variant={variant}>{label}</Badge>
}

const DELIVERY: Record<DeliveryState, { label: string; variant: Variant }> = {
  received: { label: 'Received', variant: 'secondary' },
  processing: { label: 'Processing', variant: 'secondary' },
  processed: { label: 'Processed', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
  skipped: { label: 'Skipped', variant: 'outline' },
}

export function DeliveryBadge({ state }: { state: DeliveryState }) {
  const { label, variant } = DELIVERY[state]
  return <Badge variant={variant}>{label}</Badge>
}

/** Where a server lives, for a list row: its address, or the command that starts it. */
export const addressOf = (server: McpServer) =>
  server.transport === 'http'
    ? (server.url ?? '')
    : [server.command, ...(server.args ?? [])].filter(Boolean).join(' ')

/** What the person should do about a server that is not working, in one line. */
export function serverHint(server: McpServer): string | undefined {
  const reason = server.health.detail ? ` ${server.health.detail}` : ''
  if (server.status === 'needs_auth')
    switch (server.auth.type) {
      case 'oauth':
        return 'This server needs you to sign in. Connect it to finish.'
      case 'bearer':
        return `The server did not accept its token. Replace the token, then test again.${reason}`
      default:
        return `The server asked for sign-in. Edit it to add a token or use sign-in.${reason}`
    }
  if (server.status === 'error')
    return `Theorem could not use this server.${reason} Check its address, then test again.`
  return undefined
}
