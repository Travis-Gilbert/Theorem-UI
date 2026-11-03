// SOURCING: bun:test over the capability bridge (bridge.ts), with a
// compiled cell and an in-memory workspace from test/blocks/.
import { afterEach, describe, expect, test } from 'bun:test'
import { loadCell } from '../../../test/blocks/load-cell'
import { memoryWorkspace } from '../../../test/blocks/memory-workspace'
import { checkPath, serveBridge } from './bridge'
import type { BridgeHost, StateCollections } from './bridge'
import { compileCell } from './compile'
import { noCapabilities } from './declarations'
import { inProcessExecutor } from './executor'
import type { CellExecutor } from './executor'
import { recordedAgentRuns, requestAgentRun } from './runs'
import { MAX_SNAPSHOT, call, rpcOver } from './sandbox/protocol'
import type { PageMethods } from './sandbox/protocol'
import { StateReplica } from './state'

const executors: Array<CellExecutor> = []
afterEach(() => {
  for (const executor of executors.splice(0)) executor.dispose()
})

function memoryState(): StateCollections {
  return new StateReplica({
    load: async () => null,
    push: async () => {},
    subscribe: () => () => {},
  })
}

const client = memoryWorkspace({
  'Data/habits.csv': 'date,habit,done\n2026-10-20,run,1\n2026-10-21,run,0\n',
  'Data/secret.txt': 'do not read',
  '.theorem/workspace.json': '{}',
})

async function run(source: string, inputs: Record<string, unknown> = {}) {
  const cell = await compileCell(source)
  const host: BridgeHost = {
    client,
    capabilities: cell.capabilities,
    state: memoryState(),
    run: (target) =>
      requestAgentRun({
        target,
        documentPath: 'Today.md',
        requestedBy: '#test',
        requestedAt: new Date().toISOString(),
      }),
  }
  const executor = inProcessExecutor(await loadCell(cell), host)
  executors.push(executor)
  return executor.run(inputs)
}

describe('the capability bridge', () => {
  test('a block reads what it declared, as CSV rows', async () => {
    const outcome = await run(`// uses: files.read("Data/*.csv")
const rows = await files.csv("Data/habits.csv")
const done = rows.filter((row) => row.done === 1).length`)
    expect(outcome.status).toBe('ok')
    expect(outcome.value).toEqual({
      rows: [
        { date: new Date('2026-10-20'), habit: 'run', done: 1 },
        { date: new Date('2026-10-21'), habit: 'run', done: 0 },
      ],
      done: 1,
    })
  })

  test('a block that declared nothing reads nothing', async () => {
    const before = client.reads.length
    const outcome = await run(
      `const text = await files.text("Data/secret.txt")`,
    )
    expect(outcome.status).toBe('error')
    expect(outcome.error?.message).toContain(
      'files.read("Data/secret.txt") was not declared',
    )
    expect(client.reads.length).toBe(before)
  })

  test('a declaration does not reach past its glob', async () => {
    const outcome = await run(`// uses: files.read("Data/*.csv")
const text = await files.text("Data/secret.txt")`)
    expect(outcome.status).toBe('error')
    expect(outcome.error?.message).toContain('was not declared')
  })

  test('paths outside the folder and hidden files are refused, declared or not', async () => {
    for (const target of [
      '../outside.txt',
      '/etc/passwd',
      '.theorem/workspace.json',
      'Data/../Data/secret.txt',
    ]) {
      const outcome = await run(`// uses: files.read("**")
const text = await files.text(${JSON.stringify(target)})`)
      expect(outcome.status).toBe('error')
      expect(outcome.error?.message).toMatch(
        /not a path inside the folder|was not declared/,
      )
    }
    expect(() => checkPath('a//b')).toThrow()
    expect(checkPath('Data/habits.csv')).toBe('Data/habits.csv')
  })

  test('files.list returns only declared files', async () => {
    const outcome = await run(`// uses: files.read("Data/*.csv")
const listed = (await files.list("**")).map((file) => file.path)`)
    expect(outcome.value).toEqual({ listed: ['Data/habits.csv'] })
  })

  test('writes need their own declaration', async () => {
    const denied = await run(`// uses: files.read("Data/*.csv")
await files.write("Data/out.txt", "hello")`)
    expect(denied.status).toBe('error')
    expect(client.files.has('Data/out.txt')).toBe(false)

    const allowed = await run(`// uses: files.write("Data/out.txt")
await files.write("Data/out.txt", "hello")`)
    expect(allowed.status).toBe('ok')
    expect(new TextDecoder().decode(client.files.get('Data/out.txt'))).toBe(
      'hello',
    )
  })

  test('state needs a declaration and keeps JSON values', async () => {
    const denied = await run(`const habits = await state("habits")`)
    expect(denied.error?.message).toContain('state("habits") was not declared')

    const outcome = await run(`// uses: state("habits")
const habits = await state("habits")
await habits.set("run", { streak: 3 })
const streak = habits.get("run").streak`)
    expect(outcome.value).toMatchObject({ streak: 3 })
  })

  test('run() records the request and says agents are not wired', async () => {
    const denied = await run(`const result = await run("agent:#nightly")`)
    expect(denied.status).toBe('error')

    const outcome = await run(`// uses: run("agent:#nightly")
const result = await run("agent:#nightly")`)
    expect(outcome.value).toMatchObject({
      result: { status: 'not-wired', target: 'agent:#nightly' },
    })
    expect(recordedAgentRuns().at(-1)?.target).toBe('agent:#nightly')
  })

  test('values that cannot be cloned stay in the block or are described', async () => {
    const outcome = await run(`const count = 2
const helper = () => count
const element = <b>hi</b>
const _private = 5
display({ helper, nested: { fn: Math.max } })`)
    expect(outcome.status).toBe('ok')
    // Functions and elements stay inside; underscore names are private.
    expect(outcome.value).toEqual({ count: 2 })
    expect(outcome.displayed).toBe(1)
  })

  test('an expression block is its value, described when it cannot be cloned', async () => {
    const outcome = await run(`(() => 1)`)
    expect(outcome.value).toEqual({
      $described: 'function',
      text: 'function (anonymous)',
    })
  })

  test('each line records its values for last-run display', async () => {
    const outcome = await run(`const a = 1
const b = a + 1
b * 10`)
    expect(outcome.traces).toEqual([
      { line: 1, variables: { a: 1 } },
      { line: 2, variables: { b: 2 } },
      { line: 3, variables: null, value: 20 },
    ])
    // A program block's value is its declarations, as in Observable; only an
    // expression block is its expression's value.
    expect(outcome.value).toEqual({ a: 1, b: 2 })
  })

  test('a block reads another block by name', async () => {
    const outcome = await run(`const total = habits.length * 2`, {
      habits: [1, 2, 3],
    })
    expect(outcome.value).toEqual({ total: 6 })
  })

  test('a frame sends its snapshot, up to the size limit', async () => {
    const snapshots: Array<string> = []
    const channel = new MessageChannel()
    const stop = serveBridge(rpcOver(channel.port1), {
      client,
      capabilities: noCapabilities(),
      state: memoryState(),
      run: () => Promise.reject(new Error('unused')),
      onSnapshot: (html) => snapshots.push(html),
    })
    const frame = rpcOver(channel.port2)
    await call<PageMethods, 'frame.snapshot'>(frame, 'frame.snapshot', {
      html: '<p>kept</p>',
    })
    const tooLarge = call<PageMethods, 'frame.snapshot'>(
      frame,
      'frame.snapshot',
      {
        html: 'x'.repeat(MAX_SNAPSHOT + 1),
      },
    )
    expect(
      await tooLarge.then(
        () => 'sent',
        () => 'refused',
      ),
    ).toBe('refused')
    expect(snapshots).toEqual(['<p>kept</p>'])
    stop()
    channel.port1.close()
    channel.port2.close()
  })
})
