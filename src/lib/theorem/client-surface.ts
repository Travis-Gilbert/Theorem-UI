// What a send declares of this page to the turn: the operations the agent may
// ask of it, and the page's revision. Theorem takes one list and one revision
// for a run (theorem-surface-contracts client_operation), so the page's
// surfaces are put together here.
import { appTurnOptions } from '@/lib/blocks/app-operations'
import { kitTurnOptions } from '@/lib/kit/operations'

/**
 * The page's operations for a turn: checking Apps always, and Kit while it is
 * on screen. The revision is Kit's stage's when Kit is there, since Kit is
 * the surface that changes; a check changes nothing.
 */
export function clientSurfaceTurnOptions() {
  const kit = kitTurnOptions()
  return {
    clientOperations: [
      ...('clientOperations' in kit ? kit.clientOperations : []),
      ...appTurnOptions().clientOperations,
    ],
    clientSurface: 'clientSurface' in kit ? kit.clientSurface : { revision: 0 },
  }
}
