// A BlockSession over an in-memory workspace for tests: blocks compile in the
// test process and run in-process through the same bridge a frame gets.
import { BlockSession } from '@/lib/blocks/session'
import type { BlockSessionOptions } from '@/lib/blocks/session'
import type { StateCollections } from '@/lib/blocks/bridge'
import { compileCell } from '@/lib/blocks/compile'
import { inProcessExecutor } from '@/lib/blocks/executor'
import type { LastRun } from '@/lib/blocks/last-run'
import { StateReplica } from '@/lib/blocks/state'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { testFormulaEngine } from './formula-engine'
import { loadCell } from './load-cell'

export function memoryState(): StateCollections {
  return new StateReplica({
    load: async () => null,
    push: async () => {},
    subscribe: () => () => {},
  })
}

export async function testSession(
  client: WorkspaceClient,
  path: string,
  kind: BlockSessionOptions['kind'] = 'document',
  saved: Array<LastRun> = [],
): Promise<BlockSession> {
  const session = new BlockSession({
    client,
    path,
    kind,
    compile: compileCell,
    engine: await testFormulaEngine(),
    state: memoryState(),
    executor: async (cell, host) => inProcessExecutor(await loadCell(cell), host),
    saveLastRun: async (run) => {
      saved.push(run)
    },
    today: () => '2026-10-23',
  })
  await session.load()
  return session
}

/** Waits until `check` holds, or fails after `ms`. */
export async function until(
  check: () => boolean,
  what: string,
  ms = 5000,
): Promise<void> {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

/** Waits until no block of the session is computing. */
export function settled(session: BlockSession): Promise<void> {
  return until(
    () =>
      session
        .list()
        .every((block) => {
          const cell = session.cell(block.key)
          return !cell || cell.getState().status !== 'pending'
        }),
    'the blocks to settle',
  )
}
