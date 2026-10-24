// SOURCING: hand-rolled. Reads the environment the desktop host sets when it
// starts this server (plan D4); no library models a single host's launch flags.

/**
 * True when the desktop host started this server. Desktop-only routes (the
 * bridge relay, the workspace service) answer 404 otherwise, so the web
 * deployment never serves them.
 */
export function isDesktopMode(): boolean {
  return process.env.THEOREM_DESKTOP === '1'
}

/**
 * The app's data directory, where derived state lives: the workspace index,
 * the compile cache, last-run values, per-file Loro documents and folder trust.
 * Never inside a workspace folder, so sync and git never carry it.
 */
export function desktopDataDir(): string {
  const dir = process.env.THEOREM_DESKTOP_DATA_DIR
  if (!dir) throw new Error('THEOREM_DESKTOP_DATA_DIR is not set')
  return dir
}

/** The loopback address the desktop server must listen on. */
export const DESKTOP_HOSTNAME = '127.0.0.1'

/** Where the desktop server listens. See docs/desktop/local-server.md. */
export interface DesktopListen {
  /** The app's port. */
  port: number
  /** The live-block listener's port (plan D9), reported to the host. */
  blockPort: number
}

/**
 * Reads the listen settings the way Nitro's bun preset does
 * (`node_modules/nitro/dist/presets/bun/runtime/bun.mjs`): the hostname from
 * `NITRO_HOST || HOST`, the port from `NITRO_PORT ?? PORT`. Throws unless the
 * hostname is exactly 127.0.0.1 and both ports are explicit, because the guard
 * matches the `Host` header against them.
 */
export function desktopListen(): DesktopListen {
  const hostname = process.env.NITRO_HOST || process.env.HOST
  if (hostname !== DESKTOP_HOSTNAME) {
    throw new Error(
      `Desktop mode listens on ${DESKTOP_HOSTNAME} only; set NITRO_HOST=${DESKTOP_HOSTNAME} (got ${hostname ?? 'nothing, which is every interface'})`,
    )
  }
  return {
    port: parsePort('NITRO_PORT', process.env.NITRO_PORT ?? process.env.PORT),
    blockPort: parsePort('THEOREM_BLOCK_PORT', process.env.THEOREM_BLOCK_PORT),
  }
}

/** The exact `Host` header every desktop request must carry. */
export function desktopHostHeader(): string {
  return `${DESKTOP_HOSTNAME}:${desktopListen().port}`
}

/** The app's origin, which bridge calls must name in their `Origin` header. */
export function desktopOrigin(): string {
  return `http://${desktopHostHeader()}`
}

function parsePort(name: string, value: string | undefined): number {
  // parseInt, as Nitro does, so this reads the same port Nitro binds.
  const port = Number.parseInt(value ?? '', 10)
  if (!(port > 0 && port <= 65535)) {
    throw new Error(
      `Desktop mode needs an explicit port in ${name} (got ${value ?? 'nothing'})`,
    )
  }
  return port
}
