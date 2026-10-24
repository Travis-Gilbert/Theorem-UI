// SOURCING: none; wires the block listener (listener.ts) to the workspace
// registry for desktop mode.
import { desktopOrigin } from '../mode'
import { getWorkspace, workspaceDataDir } from '../workspace/registry'
import { startBlockListener } from './listener'
import { BlockStore } from './store'

/** Starts the block listener on the port the desktop host chose. */
export function startDesktopBlockListener(port: number) {
  return startBlockListener(port, {
    appOrigin: desktopOrigin(),
    async workspace(id) {
      try {
        const service = await getWorkspace(id)
        return {
          trusted: service.summary().trusted,
          store: new BlockStore(workspaceDataDir(id)),
          read: (path) => service.read(path),
        }
      } catch {
        return null
      }
    },
  })
}
