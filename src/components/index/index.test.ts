/// <reference types="bun" />
import { describe, expect, test } from 'bun:test'
import { mergeBinding } from './bindings'
import type { Binding, ObservationEvent } from './contract'
import { OPENUI_CALLABLES, OPENUI_COMPONENTS, indexLibrary } from './library'
import { MAX_BATCH, createRecorder } from './observe'
import { atlasView, defaultViewFor, resolveDefaultView } from './programs'
import { checkProgram } from './validate'

describe('mergeBinding', () => {
  const items: Binding = {
    kind: 'items',
    query: { collectionId: 'c1', sort: 'updated', limit: 20 },
  }

  test('lays given arguments over the stored query', () => {
    expect(mergeBinding(items, { q: 'tax', limit: 5 })).toEqual({
      kind: 'items',
      query: { collectionId: 'c1', sort: 'updated', limit: 5, q: 'tax' },
    })
  })

  test('keeps the stored value when an argument is empty or the wrong type', () => {
    expect(mergeBinding(items, { q: '', collectionId: 7, ids: [] })).toEqual(
      items,
    )
  })

  test('never changes the binding kind', () => {
    expect(mergeBinding(items, { kind: 'collections' }).kind).toBe('items')
  })

  test('narrows used_together and map bindings', () => {
    expect(
      mergeBinding(
        { kind: 'used_together', anchorIds: ['a'] },
        { anchorIds: ['b', 'c'] },
      ),
    ).toEqual({ kind: 'used_together', anchorIds: ['b', 'c'] })
    expect(
      mergeBinding(
        { kind: 'map', overlay: 'density' },
        { overlay: 'activity' },
      ),
    ).toEqual({ kind: 'map', overlay: 'activity' })
  })
})

describe('createRecorder', () => {
  const event = (n: number) => ({
    kind: 'item_opened' as const,
    scope: { kind: 'home' as const },
    subjects: [`d${n}`],
  })

  test('sends a batch after a quiet period, stamped with the session', async () => {
    const sent: [string, ObservationEvent[]][] = []
    const recorder = createRecorder({
      sessionId: 's1',
      delayMs: 5,
      send: async (sessionId, events) => void sent.push([sessionId, events]),
    })
    recorder.record(event(1))
    recorder.record(event(2))
    expect(sent).toHaveLength(0)
    await Bun.sleep(20)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.[0]).toBe('s1')
    expect(sent[0]?.[1].map((e) => e.subjects?.[0])).toEqual(['d1', 'd2'])
    expect(typeof sent[0]?.[1][0]?.atMs).toBe('number')
  })

  test('sends at once when a batch is full, never more than the route takes', () => {
    const sizes: number[] = []
    const recorder = createRecorder({
      sessionId: 's',
      delayMs: 60_000,
      send: async (_, events) => void sizes.push(events.length),
    })
    for (let n = 0; n < MAX_BATCH + 3; n++) recorder.record(event(n))
    expect(sizes).toEqual([MAX_BATCH])
    expect(recorder.pending()).toBe(3)
    recorder.flush(true)
    expect(sizes).toEqual([MAX_BATCH, 3])
    expect(recorder.pending()).toBe(0)
  })

  test('names only stored views, never a built-in one', () => {
    const sent: ObservationEvent[] = []
    const recorder = createRecorder({
      sessionId: 's',
      send: async (_, events) => void sent.push(...events),
    })
    recorder.record({ ...event(1), viewId: 'default:home' })
    recorder.record({ ...event(2), viewId: 'v_1' })
    recorder.flush()
    expect(sent.map((e) => e.viewId)).toEqual([undefined, 'v_1'])
    expect('viewId' in (sent[0] ?? {})).toBe(false)
  })

  test('drops a failed batch instead of throwing', async () => {
    const recorder = createRecorder({
      sessionId: 's',
      send: () => Promise.reject(new Error('offline')),
    })
    recorder.record(event(1))
    expect(() => recorder.flush()).not.toThrow()
    await Bun.sleep(1)
    expect(recorder.pending()).toBe(0)
  })
})

describe('built-in views', () => {
  const views = [
    defaultViewFor({ kind: 'home' }),
    defaultViewFor({ kind: 'collection', collectionId: 'c1' }, 'Taxes'),
    atlasView(),
  ]

  for (const view of views)
    test(`${view.viewId} parses with the library`, () => {
      expect(checkProgram(view.current.program, view.current.bindings)).toEqual(
        {
          ok: true,
          problems: [],
        },
      )
    })

  test('resolve from their ids', () => {
    expect(
      resolveDefaultView('default:collection:c1', () => 'Taxes')?.current.title,
    ).toBe('Taxes')
    expect(resolveDefaultView('default:atlas')?.viewId).toBe('default:atlas')
    expect(resolveDefaultView('v_123')).toBeUndefined()
  })
})

describe('checkProgram', () => {
  test('rejects a Query of a binding the view does not declare', () => {
    const result = checkProgram(
      `root = Stack([list])
found = Query("secrets", {}, {items: []})
list = ItemList(found.items)`,
      { items: { kind: 'items', query: {} } },
    )
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toContain('"secrets"')
  })

  test('rejects Mutation and unknown components', () => {
    expect(
      checkProgram(
        `root = Stack([m])
m = Mutation("items", {})`,
        {},
      ).ok,
    ).toBe(false)
    expect(checkProgram(`root = Stack([Marquee("hi")])`, {}).ok).toBe(false)
  })
})

describe('OpenUI names published to Theorem', () => {
  // OpenUI does not export its built-in names; a program that uses every one
  // fails here if an upgrade renames or drops any of them.
  test('every built-in call still parses', () => {
    const program = `$n = 1
root = Stack([t, b])
q = Query("items", {}, {items: [], total: 0})
xs = q.items
t = Text("" + @Count(xs) + @First(xs) + @Last(xs) + @Sum([1]) + @Avg([1]) + @Min([1]) + @Max([1]) + @Round(1.5) + @Abs(-1) + @Floor(1.2) + @Ceil(1.2) + @Count(@Sort(xs, "title")) + @Count(@Filter(xs, "title", "==", "a")) + @Count(@Each(xs, "x", x.title)))
b = ActionButton("Go", Action([@Set($n, 2), @Reset($n), @Run(q), @ToAssistant("hi"), @OpenUrl("https://example.com"), @OpenItem("d1")]))`
    const result = checkProgram(program, {
      items: { kind: 'items', query: {} },
    })
    expect(result.problems).toEqual([])
    const used = [
      ...OPENUI_CALLABLES,
      ...OPENUI_COMPONENTS.filter((c) => c !== 'Mutation'),
    ]
    for (const name of used) expect(program).toContain(name)
  })

  test('the library names its own components and actions', () => {
    expect(Object.keys(indexLibrary.components)).toContain('ItemList')
    expect(Object.keys(indexLibrary.actions)).toEqual([
      'OpenItem',
      'AskTheorem',
      'PinView',
      'SetPreference',
    ])
  })
})

describe("Theorem's template programs", () => {
  // These strings are what theorem_index_workspace/improver.rs `template`
  // emits with no model bound; the improver's candidates must render here.
  test('the items template parses', () => {
    const program = `root = IndexItems(found, "table")
found = Query("items", {}, {items: [], total: 0})`
    expect(
      checkProgram(program, { items: { kind: 'items', query: {} } }).problems,
    ).toEqual([])
  })

  test('the used-together template parses', () => {
    const program = `root = IndexComparison(found, cols, [filings_0, filings_1])
found = Query("items", {}, {items: [], total: 0})
cols = Query("collections", {}, {collections: []})
filings_0 = Query("filings_0", {}, {receipts: []})
filings_1 = Query("filings_1", {}, {receipts: []})`
    expect(
      checkProgram(program, {
        items: { kind: 'items', query: { ids: ['a', 'b'] } },
        collections: { kind: 'collections' },
        filings_0: { kind: 'filing_history', documentId: 'a' },
        filings_1: { kind: 'filing_history', documentId: 'b' },
      }).problems,
    ).toEqual([])
  })
})
