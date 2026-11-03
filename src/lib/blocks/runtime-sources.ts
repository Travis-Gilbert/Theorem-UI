// SOURCING: Vite's `?raw` imports (the sandbox runtime's TypeScript as text).
// The block listener serves these modules to block documents; the standalone
// export bundles them. Each imports the others as `./name`.
import appBridge from './sandbox/app-bridge.ts?raw'
import cell from './sandbox/cell.ts?raw'
import cellRuntime from './sandbox/cell-runtime.ts?raw'
import connect from './sandbox/connect.ts?raw'
import display from './sandbox/display.ts?raw'
import protocol from './sandbox/protocol.ts?raw'
import standalone from './sandbox/standalone.ts?raw'
import values from './sandbox/values.ts?raw'

/** The sandbox runtime's TypeScript sources by module name. */
export const runtimeSources: Record<string, string> = {
  'app-bridge': appBridge,
  cell,
  'cell-runtime': cellRuntime,
  connect,
  display,
  protocol,
  standalone,
  values,
}
