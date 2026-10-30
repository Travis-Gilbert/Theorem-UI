// SOURCING: bun:test over block sessions (session.ts) on the fixture
// workspace in test/fixtures/blocks/.
import { afterEach, describe, expect, test } from 'bun:test'
import path from 'node:path'
import { visit } from 'unist-util-visit'
import {
  loadFixtures,
  memoryWorkspace,
} from '../../../test/blocks/memory-workspace'
import { settled, testSession, until } from '../../../test/blocks/session'
import { liveBlocksIn, parseMarkdown, pinnedBody } from './format'
import type { LastRun } from './last-run'
import { outputMarkdown } from './output'
import type { QueryResult } from './query'
import { recordedAgentRuns } from './runs'
import type { BlockSession } from './session'
import type { RunRequestResult } from './sandbox/protocol'

const FIXTURES = path.join(import.meta.dir, '../../../test/fixtures/blocks')

const sessions: Array<BlockSession> = []
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose()
})

async function open(
  ...args: Parameters<typeof testSession>
): Promise<BlockSession> {
  const session = await testSession(...args)
  sessions.push(session)
  return session
}

const value = (session: BlockSession, key: string) =>
  session.cell(key)?.getState().value
const runs = (session: BlockSession, key: string) =>
  session.cell(key)?.getState().runs ?? 0

/** The files a note embeds with `![[…]]`, as the Markdown handler finds them. */
function embeds(markdown: string): Array<string> {
  const targets: Array<string> = []
  visit(parseMarkdown(markdown), 'embed', (node) => {
    targets.push((node as unknown as { value: string }).value)
  })
  return targets
}

describe('Today.md, end to end', () => {
  test('parse, cells, runtime: every block computes, and a CSV edit recomputes only what reads it', async () => {
    const client = memoryWorkspace(await loadFixtures(FIXTURES))
    const saved: Array<LastRun> = []
    const today = await open(client, 'Today.md', 'document', saved)
    const { text } = await client.readText('Today.md')

    // The embedded tool runs as its own session, the way its card mounts it.
    const [embedded] = embeds(text)
    expect(embedded).toBe('Tools/Habit tracker.tsx')
    const toolPath = await client.resolve(embedded!, 'Today.md')
    expect(toolPath).toBe('Tools/Habit tracker.tsx')
    const tool = await open(client, toolPath!, 'tool')

    expect(today.list().map((block) => [block.key, block.kind])).toEqual([
      ['habits', 'code'],
      ['streak', 'code'],
      ['recent', 'query'],
      ['focus', 'code'],
      ['weekly', 'agent'],
      ['errands', 'query'],
    ])
    await settled(today)
    await settled(tool)

    expect(value(today, 'habits')).toHaveLength(5)
    expect(value(today, 'streak')).toBe(4)
    // The pinned output is what the block computes.
    const streakBlock = liveBlocksIn(text).find((b) => b.info.id === 'streak')!
    expect(pinnedBody(streakBlock.output!)).toBe(outputMarkdown(4))
    expect(
      (value(today, 'recent') as QueryResult).rows.map((row) => [
        row.date,
        row.habit,
      ]),
    ).toEqual([
      ['2026-10-22', 'run'],
      ['2026-10-21', 'read'],
      ['2026-10-20', 'run'],
    ])
    expect(value(today, 'focus')).toEqual({
      focus: 'Finish the live blocks draft',
    })
    // The agent waits for Run.
    expect(today.cell('weekly')?.getState().status).toBe('idle')
    const errands = value(today, 'errands') as QueryResult
    expect(errands.views[0]?.type).toBe('calendar')
    expect(errands.views[0]?.dateKey).toBe('mention.date')
    expect(
      errands.views[1]?.rows.map((row) => [row['mention.text'], row.left]),
    ).toEqual([
      ['Groceries', 45],
      ['Pharmacy', 33],
      ['Hardware store', 13],
    ])
    expect(tool.cell('tool')?.getState().status).toBe('ok')
    // A tool's value is its declarations that can leave the frame; its
    // state collection crosses as its entries.
    expect(value(tool, 'tool')).toMatchObject({
      habits: ['run', 'read'],
      today: {},
    })

    // Last-run values were kept for each code block, by source hash.
    expect(
      [...new Set(saved.map((run) => run.sourceHash))]
        .map(
          (hash) =>
            today
              .list()
              .find(
                (block) =>
                  today.codeState(block.key).compiled?.sourceHash === hash,
              )?.key,
        )
        .sort(),
    ).toEqual(['focus', 'habits', 'streak'])

    const before = Object.fromEntries(
      ['habits', 'streak', 'recent', 'focus', 'errands'].map((key) => [
        key,
        runs(today, key),
      ]),
    )
    const toolBefore = runs(tool, 'tool')

    client.edit(
      'Data/habits.csv',
      `${(await client.readText('Data/habits.csv')).text}2026-10-23,read,1,15\n`,
    )
    await until(() => value(today, 'streak') === 5, 'the streak to update')
    await settled(today)
    await until(() => runs(tool, 'tool') > toolBefore, 'the tool to rerun')

    expect(runs(today, 'habits')).toBe(before.habits! + 1)
    expect(runs(today, 'streak')).toBe(before.streak! + 1)
    expect(runs(today, 'recent')).toBe(before.recent! + 1)
    expect((value(today, 'recent') as QueryResult).rows[0]).toMatchObject({
      date: '2026-10-23',
    })
    // Blocks that do not read the CSV did not run again.
    expect(runs(today, 'focus')).toBe(before.focus!)
    expect(runs(today, 'errands')).toBe(before.errands!)
    // The agent reads #streak but still waits for Run.
    expect(today.cell('weekly')?.getState()).toMatchObject({
      status: 'idle',
      runs: 0,
    })

    // Editing one block of the note re-runs that block and nothing else.
    const habitsRuns = runs(today, 'habits')
    client.edit(
      'Today.md',
      text.replace('Finish the live blocks draft', 'Write the docs'),
    )
    await until(
      () =>
        (value(today, 'focus') as { focus?: string } | undefined)?.focus ===
        'Write the docs',
      'the edited block to rerun',
    )
    expect(runs(today, 'habits')).toBe(habitsRuns)
    expect(runs(today, 'errands')).toBe(before.errands!)
  })

  test('Run asks for the agent run through the seam, with the agent block and its inputs', async () => {
    const client = memoryWorkspace(await loadFixtures(FIXTURES))
    const today = await open(client, 'Today.md')
    await settled(today)
    const recorded = recordedAgentRuns().length

    today.cell('weekly')!.run()
    await until(
      () => today.cell('weekly')?.getState().status === 'ok',
      'the agent run request',
    )
    const result = value(today, 'weekly') as RunRequestResult
    expect(result.status).toBe('not-wired')
    expect(result.message).toContain('not wired yet')
    expect(recordedAgentRuns()).toHaveLength(recorded + 1)
    expect(recordedAgentRuns().at(-1)).toMatchObject({
      target: 'agent:#weekly',
      documentPath: 'Today.md',
      requestedBy: 'Run button',
      agent: {
        prompt: "Summarize this week's habits in two sentences.",
        inputs: { streak: 4 },
        trigger: 'manual',
        output: 'Reviews/Weekly.md',
      },
    })
  })

  test('a block that declared run("agent:#…") starts that agent block when it runs', async () => {
    const client = memoryWorkspace({
      'Note.md': `\`\`\`agent {.live #nightly}
prompt: Tidy the inbox.
\`\`\`

\`\`\`ts {.live #kick}
// uses: run("agent:#nightly")
await run("agent:#nightly")
\`\`\`
`,
    })
    const note = await open(client, 'Note.md')
    await until(() => note.cell('kick')?.getState().status === 'idle', 'kick')
    expect(note.cell('nightly')?.getState().status).toBe('idle')

    note.cell('kick')!.run()
    await until(() => note.cell('kick')?.getState().status === 'ok', 'kick')
    expect((value(note, 'kick') as RunRequestResult).status).toBe('not-wired')
    expect(recordedAgentRuns().at(-1)).toMatchObject({
      target: 'agent:#nightly',
      requestedBy: '#kick',
    })
  })

  test('an untrusted folder lists its blocks and runs none of them', async () => {
    const client = memoryWorkspace(await loadFixtures(FIXTURES), {
      trusted: false,
    })
    const today = await open(client, 'Today.md')
    const tool = await open(client, 'Tools/Habit tracker.tsx', 'tool')
    expect(today.list()).toHaveLength(6)
    expect(tool.list()).toHaveLength(1)
    expect(today.cell('habits')).toBeUndefined()
    expect(tool.cell('tool')).toBeUndefined()
    await new Promise((resolve) => setTimeout(resolve, 50))
    // Nothing but the two files themselves was read.
    expect([...new Set(client.reads)].sort()).toEqual([
      'Today.md',
      'Tools/Habit tracker.tsx',
    ])

    await client.setTrusted(true)
    today.refreshTrust()
    await until(() => value(today, 'streak') === 4, 'the trusted note to run')
  })

  test('blocks without an id are named by their place among unnamed blocks; a repeated id is an error', async () => {
    const client = memoryWorkspace({
      'Note.md': `\`\`\`ts {.live}
1 + 1
\`\`\`

\`\`\`ts {.live #a}
2
\`\`\`

\`\`\`ts {.live #a}
3
\`\`\`

\`\`\`ts {.live}
a * 10
\`\`\`
`,
    })
    const note = await open(client, 'Note.md')
    expect(note.list().map((block) => block.key)).toEqual([
      'block:0',
      'a',
      'duplicate:2',
      'block:1',
    ])
    await settled(note)
    expect(value(note, 'block:0')).toBe(2)
    expect(value(note, 'block:1')).toBe(20)
    expect(note.cell('duplicate:2')?.getState().error).toContain(
      'Another block is already named #a',
    )
  })
})
