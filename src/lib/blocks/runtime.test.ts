import { afterEach, describe, expect, test } from 'bun:test'
import { BlockGraph } from './runtime'
import type { CellDefinition, CellHandle } from './runtime'

let graph: BlockGraph

afterEach(() => graph.dispose())

/** Resolves once `check` holds, polling the runtime's frames. */
async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 2000
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

const settled = (...cells: Array<CellHandle>) =>
  until(
    () => cells.every((cell) => cell.getState().status !== 'pending'),
    'the graph to settle',
  )

function pure(
  name: string,
  inputs: Array<string>,
  reads: Array<string>,
  evaluate: CellDefinition['evaluate'],
): CellDefinition {
  return { name, inputs, reads, effectful: false, evaluate }
}

describe('BlockGraph', () => {
  test('a file change recomputes only the blocks that read it, and theirs', async () => {
    graph = new BlockGraph()
    const counts = { habits: 0, streak: 0, summary: 0, weather: 0 }
    let rows = [{ done: true }, { done: false }]
    const habits = graph.cell('habits')
    habits.define(
      pure('habits', [], ['Data/habits.csv'], async () => {
        counts.habits++
        return rows
      }),
    )
    const streak = graph.cell('streak')
    streak.define(
      pure('streak', ['habits'], [], async ({ habits: value }) => {
        counts.streak++
        return (value as typeof rows).filter((row) => row.done).length
      }),
    )
    const summary = graph.cell('summary')
    summary.define(
      pure('summary', ['streak'], [], async ({ streak: value }) => {
        counts.summary++
        return `streak ${String(value)}`
      }),
    )
    const weather = graph.cell('weather')
    weather.define(
      pure('weather', [], ['Data/weather/*.csv'], async () => {
        counts.weather++
        return 'sunny'
      }),
    )
    await settled(habits, streak, summary, weather)
    expect(summary.getState()).toMatchObject({
      status: 'ok',
      value: 'streak 1',
    })
    expect(counts).toEqual({ habits: 1, streak: 1, summary: 1, weather: 1 })

    rows = [{ done: true }, { done: true }]
    graph.fileChanged('Data/habits.csv')
    await until(() => counts.summary === 2, 'summary to recompute')
    await settled(habits, streak, summary, weather)
    expect(summary.getState().value).toBe('streak 2')
    expect(counts).toEqual({ habits: 2, streak: 2, summary: 2, weather: 1 })

    graph.fileChanged('Data/weather/today.csv')
    await until(() => counts.weather === 2, 'weather to recompute')
    await settled(habits, streak, summary, weather)
    expect(counts).toEqual({ habits: 2, streak: 2, summary: 2, weather: 2 })

    graph.fileChanged('Notes/unrelated.md')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(counts).toEqual({ habits: 2, streak: 2, summary: 2, weather: 2 })
  })

  test('an effectful block runs only when triggered, and holds back what reads it', async () => {
    graph = new BlockGraph()
    let sources = 0
    let effects = 0
    let readers = 0
    const source = graph.cell('source')
    source.define(pure('source', [], ['Data/log.csv'], async () => ++sources))
    const writer = graph.cell('writer')
    writer.define({
      name: 'writer',
      inputs: ['source'],
      reads: [],
      effectful: true,
      evaluate: async ({ source: value }) => {
        effects++
        return `wrote ${String(value)}`
      },
    })
    const reader = graph.cell('reader')
    reader.define(
      pure('reader', ['writer'], [], async ({ writer: value }) => {
        readers++
        return value
      }),
    )
    await settled(source)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(writer.getState().status).toBe('idle')
    expect(effects).toBe(0)
    expect(readers).toBe(0)
    expect(reader.getState()).toMatchObject({
      status: 'idle',
      error: '#writer has not run yet',
    })

    graph.fileChanged('Data/log.csv')
    await until(() => sources === 2, 'source to recompute')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(effects).toBe(0)
    expect(writer.getState().status).toBe('idle')

    writer.run()
    await until(() => reader.getState().status === 'ok', 'reader')
    expect(writer.getState()).toMatchObject({
      status: 'ok',
      value: 'wrote 2',
      runs: 1,
    })
    expect(reader.getState().value).toBe('wrote 2')
    expect(effects).toBe(1)
    expect(readers).toBe(1)

    graph.fileChanged('Data/log.csv')
    await until(
      () => writer.getState().status === 'stale',
      'writer to go stale',
    )
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(effects).toBe(1)
    expect(readers).toBe(1)
    expect(writer.getState().value).toBe('wrote 2')

    writer.run()
    await until(() => readers === 2, 'reader to see the second run')
    expect(writer.getState()).toMatchObject({
      status: 'ok',
      value: 'wrote 3',
      runs: 2,
    })
  })

  test('a failed run reaches what reads the block', async () => {
    graph = new BlockGraph()
    const writer = graph.cell('writer')
    writer.define({
      name: 'writer',
      inputs: [],
      reads: [],
      effectful: true,
      evaluate: async () => {
        throw new Error('disk full')
      },
    })
    const reader = graph.cell('reader')
    reader.define(pure('reader', ['writer'], [], async ({ writer: v }) => v))
    await until(() => reader.getState().status === 'idle', 'reader to wait')
    writer.run()
    await until(() => reader.getState().status === 'error', 'the error')
    expect(writer.getState()).toMatchObject({
      status: 'error',
      error: 'disk full',
    })
    expect(reader.getState().error).toBe('disk full')
  })

  test('Run evaluates a pure block again', async () => {
    graph = new BlockGraph()
    let count = 0
    const cell = graph.cell('again')
    cell.define(pure('again', [], [], async () => ++count))
    await settled(cell)
    cell.run()
    await until(() => cell.getState().value === 2, 'the second run')
    expect(cell.getState().runs).toBe(2)
  })

  test('a name that is no block is an error, never a page global', async () => {
    graph = new BlockGraph()
    const cell = graph.cell('reader')
    cell.define(pure('reader', ['document'], [], async ({ document: d }) => d))
    await until(() => cell.getState().status === 'error', 'the error')
    expect(cell.getState().error).toBe('#document is not defined')
  })

  test('an evaluation that throws shows its error', async () => {
    graph = new BlockGraph()
    const cell = graph.cell('broken')
    cell.define(
      pure('broken', [], [], async () => {
        throw new Error('no rows')
      }),
    )
    await until(() => cell.getState().status === 'error', 'the error')
    expect(cell.getState().error).toBe('no rows')
  })

  test('deleting a block leaves what read it with an error', async () => {
    graph = new BlockGraph()
    const first = graph.cell('first')
    first.define(pure('first', [], [], async () => 1))
    const second = graph.cell('second')
    second.define(
      pure('second', ['first'], [], async ({ first: v }) => Number(v) + 1),
    )
    await until(() => second.getState().value === 2, 'second')
    first.delete()
    await until(() => second.getState().status === 'error', 'the error')
    expect(graph.has('first')).toBe(false)
  })
})
