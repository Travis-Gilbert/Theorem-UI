// SOURCING: a Nitro runtime plugin (nitro's definePlugin), registered in
// vite.config.ts; it wires the desktop modules into the server at startup.
import { definePlugin } from 'nitro'
import { sendToHost, startControlChannel } from './control'
import { desktopGuard } from './guard'
import { desktopListen, isDesktopMode } from './mode'

/**
 * Desktop mode's startup (docs/desktop/local-server.md). Does nothing unless
 * the desktop host started the server, so the web deployment never runs it.
 */
export default definePlugin((nitroApp) => {
  if (!isDesktopMode()) return
  // Throws on a wrong hostname or a missing port, before anything binds.
  const { port, blockPort } = desktopListen()
  if (!nitroApp.h3) throw new Error('Nitro has no h3 app to guard')
  // Nitro serves `.output/public` from the first global middleware, before any
  // route or TanStack Start middleware sees the request, so the guard goes in
  // front of it. Plugins may add to this array at startup (Nitro's plugin docs).
  nitroApp.h3['~middleware'].unshift(desktopGuard)
  startControlChannel({
    input: process.stdin,
    output: process.stdout,
    // The host has gone without stopping us; shut down gracefully rather than
    // hold the port its next launch wants.
    onClose: () => process.kill(process.pid, 'SIGTERM'),
  })
  // Plugins run inside the server entry's module evaluation, just before
  // Bun.serve binds synchronously. This task runs once that evaluation is over,
  // so the server is listening; a failed bind throws and exits first.
  setImmediate(() => sendToHost({ ctl: 'ready', port, blockPort }))
})
