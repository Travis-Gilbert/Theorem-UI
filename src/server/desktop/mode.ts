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
