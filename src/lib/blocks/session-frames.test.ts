import { afterEach, expect, test } from 'bun:test'
import path from 'node:path'
import { testFormulaEngine } from '../../../test/blocks/formula-engine'
import { loadCell } from '../../../test/blocks/load-cell'
import {
  loadFixtures,
  memoryWorkspace,
} from '../../../test/blocks/memory-workspace'
import { memoryState, until } from '../../../test/blocks/session'
import { compileCell } from './compile'
import { inProcessExecutor } from './executor'
import type { CellExecutor } from './executor'
import { BlockSession } from './session'
import type { BlockSessionOptions } from './session'

const FIXTURES = path.join(import.meta.dir, '../../../test/fixtures/blocks')

const sessions: Array<BlockSession> = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
})

/** A session whose code blocks run only in the frames views attach. */
async function framedSession(
  client: BlockSessionOptions['client'],
  file: string,
  kind: BlockSessionOptions['kind'],
): Promise<BlockSession> {
  const session = new BlockSession({
    client,
    path: file,
    kind,
    compile: compileCell,
    engine: await testFormulaEngine(),
    state: memoryState(),
    saveLastRun: async () => {},
    today: () => '2026-10-23',
  })
  sessions.push(session)
  await session.load()
  return session
}

/** A stand-in for a view's frame that notes each run under `name`. */
async function frame(
  session: BlockSession,
  key: string,
  name: string,
  runs: Array<string>,
): Promise<{ cellKey: string; executor: CellExecutor }> {
  await until(
    () => session.codeState(key).compiled !== null,
    `${key} to compile`,
  )
  const compiled = session.codeState(key).compiled!
  const inner = inProcessExecutor(
    await loadCell(compiled),
    session.hostFor(key, compiled.capabilities),
  )
  return {
    cellKey: compiled.key,
    executor: {
      run: (inputs) => {
        runs.push(name)
        return inner.run(inputs)
      },
      dispose: inner.dispose,
    },
  }
}

test('every view of a tool shows its run; the newest frame runs it for the graph', async () => {
  const client = memoryWorkspace(await loadFixtures(FIXTURES))
  const tool = await framedSession(client, 'Tools/Habit tracker.tsx', 'tool')
  const runs: Array<string> = []

  const panel = await frame(tool, 'tool', 'panel', runs)
  const detachPanel = tool.attach('tool', panel.cellKey, panel.executor)
  await until(
    () => tool.cell('tool')?.getState().status === 'ok',
    'the tool to run in its frame',
  )
  expect(runs).toEqual(['panel'])

  // A view opened later shows the same run without rerunning the graph.
  const evaluations = tool.cell('tool')?.getState().runs
  const embed = await frame(tool, 'tool', 'embed', runs)
  const detachEmbed = tool.attach('tool', embed.cellKey, embed.executor)
  await until(() => runs.length === 2, 'the late view to run')
  expect(runs).toEqual(['panel', 'embed'])
  expect(tool.cell('tool')?.getState().runs).toBe(evaluations)

  // A change reruns it in both; the newest one's outcome is the value.
  client.edit(
    'Data/habits.csv',
    `${(await client.readText('Data/habits.csv')).text}2026-10-23,read,1,15\n`,
  )
  await until(() => runs.length === 4, 'both views to rerun')
  expect(runs.slice(2).sort()).toEqual(['embed', 'panel'])

  // When the newest view goes, the other runs the tool.
  detachEmbed()
  client.edit(
    'Data/habits.csv',
    `${(await client.readText('Data/habits.csv')).text}2026-10-24,run,1,20\n`,
  )
  await until(() => runs.length === 5, 'the remaining view to rerun')
  expect(runs.at(-1)).toBe('panel')
  await until(
    () => tool.cell('tool')?.getState().status === 'ok',
    'the rerun to finish',
  )
  detachPanel()
})

test('an effectful block runs once, in the newest frame', async () => {
  const client = memoryWorkspace({
    'Note.md': `\`\`\`ts {.live #save}
// uses: files.write("Out/log.txt")
await files.write("Out/log.txt", "saved")
\`\`\`
`,
  })
  const note = await framedSession(client, 'Note.md', 'document')
  const runs: Array<string> = []
  const first = await frame(note, 'save', 'first', runs)
  const second = await frame(note, 'save', 'second', runs)
  note.attach('save', first.cellKey, first.executor)
  note.attach('save', second.cellKey, second.executor)
  expect(note.cell('save')?.getState().status).toBe('idle')

  note.cell('save')!.run()
  await until(
    () => note.cell('save')?.getState().status === 'ok',
    'the block to run',
  )
  expect(runs).toEqual(['second'])
  expect(new TextDecoder().decode(client.files.get('Out/log.txt'))).toBe(
    'saved',
  )
})
