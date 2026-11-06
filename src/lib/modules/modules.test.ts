import { describe, expect, test } from 'bun:test'
import type { ComponentType } from 'react'
import type { ComponentData, LayoutData } from './contract'
import { parseManifest, parsePage, ModuleFileError } from './contract'
import {
  deliver,
  findCycle,
  sourcesFor,
  targetsFor,
  validateConnections,
  wouldCycle,
} from './connections'
import {
  COMPOSITE_INPUT,
  MISSING_TYPE,
  extractComposite,
  migrateSettings,
  prepareLayout,
  restoreLayout,
} from './layout'
import { builtin, fromManifest } from './registry'
import type { ModuleDefinition, ModuleViewProps } from './registry'
import {
  MAX_EVENT_DEPTH,
  MAX_EVENTS_PER_SECOND,
  createPageRuntime,
} from './runtime'
import { compatibility, convert, pick, referenceForItem } from './values'

const View = (() => null) as ComponentType<ModuleViewProps>

const list = builtin({
  id: 'theorem.test.list',
  label: 'List',
  outputs: [{ name: 'selected', label: 'Selected', type: 'item' }],
  events: [{ name: 'ask', label: 'Ask', type: 'item' }],
  inputs: [{ name: 'filter', label: 'Filter', type: 'text' }],
  Component: View,
})
const inspector = builtin({
  id: 'theorem.test.inspector',
  label: 'Inspector',
  version: 3,
  inputs: [{ name: 'item', label: 'Item', type: 'item' }],
  outputs: [{ name: 'title', label: 'Title', type: 'text' }],
  actions: [{ name: 'show', label: 'Show', type: 'item' }],
  events: [{ name: 'again', label: 'Again', type: 'item' }],
  migrations: [
    { to: 2, rename: { mode: 'layout' } },
    { to: 3, remove: ['legacy'], set: { dense: true } },
  ],
  Component: View,
})
const counter = builtin({
  id: 'theorem.test.counter',
  label: 'Counter',
  inputs: [{ name: 'n', label: 'N', type: 'number' }],
  outputs: [{ name: 'n', label: 'N', type: 'number' }],
  Component: View,
})
const modules = new Map<string, ModuleDefinition>(
  [list, inspector, counter].map((m) => [m.id, m]),
)
const lookup = (id: string) => modules.get(id)
const known = (type: string) => type === 'Split'

const component = (
  type: string,
  id: string,
  props: Record<string, unknown> = {},
): ComponentData => ({ type, props: { id, ...props } })

const layoutOf = (...content: ComponentData[]): LayoutData => ({
  root: { props: {} },
  content,
})

describe('module files', () => {
  test('a sandboxed manifest parses with its defaults', () => {
    const manifest = parseManifest(
      'Modules/notes/module.json',
      JSON.stringify({
        schema: 'theorem.module/1',
        id: 'acme.notes',
        label: 'Notes',
        implementation: { kind: 'sandboxed-html' },
      }),
    )
    expect(manifest.version).toBe(1)
    expect(manifest.capabilities).toEqual({
      read: [],
      write: [],
      state: [],
      net: [],
    })
    const definition = fromManifest(manifest, 'Modules/notes/module.json')
    expect(definition.implementation).toEqual({
      kind: 'sandboxed-html',
      folder: 'Modules/notes',
      entry: 'index.html',
    })
  })

  test('a vault module may not take a theorem id or a host prop name', () => {
    const base = {
      schema: 'theorem.module/1',
      label: 'X',
      implementation: { kind: 'sandboxed-html' },
    }
    expect(() =>
      parseManifest('m.json', JSON.stringify({ ...base, id: 'theorem.x' })),
    ).toThrow(ModuleFileError)
    expect(() =>
      parseManifest(
        'm.json',
        JSON.stringify({
          ...base,
          id: 'acme.x',
          settings: [{ name: 'bind', label: 'Bind', kind: 'text' }],
        }),
      ),
    ).toThrow(/settings\.0\.name/)
  })

  test('a page file that is not JSON says so', () => {
    expect(() => parsePage('Pages/a.page.json', '{')).toThrow('it is not JSON')
  })
})

describe('values', () => {
  test('conversions are explicit and checked', () => {
    expect(compatibility('item', 'item')).toBe('same')
    expect(compatibility('item', 'text')).toBe('convert')
    expect(compatibility('boolean', 'item')).toBe('none')
    expect(compatibility('text', 'json')).toBe('same')
    expect(convert({ id: 'd1', label: 'Doc' }, 'item', 'text')).toBe('Doc')
    expect(convert('12', 'text', 'number')).toBe(12)
    expect(convert('twelve', 'text', 'number')).toBeUndefined()
    expect(convert(4, 'json', 'text')).toBeUndefined()
  })

  test('a pick reads a dot path and stops at the end', () => {
    expect(pick({ a: [{ b: 1 }] }, 'a.0.b')).toBe(1)
    expect(pick({ a: 1 }, 'a.b')).toBeUndefined()
    expect(pick({}, 'constructor')).toBeUndefined()
  })

  test('an item becomes a graph-object reference, records with their type', () => {
    expect(referenceForItem({ id: 'record:person/p1', label: 'Ada' })).toEqual({
      label: 'Ada',
      location: {
        resource: {
          kind: 'graph-object',
          objectId: 'p1',
          objectType: 'person',
        },
      },
    })
  })

  test('a binding delivers only what its target takes', () => {
    const item = { id: 'd1', label: 'Doc' }
    expect(deliver(item, 'item', 'text', {})).toBeUndefined()
    expect(deliver(item, 'item', 'text', { convert: true })).toBe('Doc')
    expect(
      deliver(item, 'item', 'text', { pick: 'label', convert: true }),
    ).toBe('Doc')
    expect(deliver(item, 'item', 'item', {})).toEqual(item)
  })
})

describe('layout', () => {
  test('a missing module becomes a placeholder and comes back unchanged', () => {
    const gone = component('acme.gone', 'g1', { colour: 'red', bind: {} })
    const layout = layoutOf(component('Split', 's1', { a: [gone], b: [] }))
    const prepared = prepareLayout(layout, lookup, known)
    const slot = prepared.content[0]!.props.a as ComponentData[]
    expect(slot[0]!.type).toBe(MISSING_TYPE)
    expect(restoreLayout(prepared)).toEqual(layout)
  })

  test('a placeholder resumes once its module arrives', () => {
    const placeholder = component(MISSING_TYPE, 'i1', {
      missing: component('theorem.test.list', 'i1'),
    })
    const prepared = prepareLayout(layoutOf(placeholder), lookup, known)
    expect(prepared.content[0]!.type).toBe('theorem.test.list')
  })

  test('an older instance has its settings migrated', () => {
    const old = component('theorem.test.inspector', 'i1', {
      v: 1,
      mode: 'wide',
      legacy: 1,
    })
    const [migrated] = prepareLayout(layoutOf(old), lookup, known).content
    expect(migrated!.props).toEqual({
      id: 'i1',
      v: 3,
      layout: 'wide',
      dense: true,
    })
    expect(migrateSettings({ a: 1 }, 3, inspector.migrations)).toEqual({ a: 1 })
  })

  test('extracting a composite exposes what crossed its edge', () => {
    const outside = component('theorem.test.list', 'out')
    const inner = component('theorem.test.inspector', 'insp', {
      bind: { item: { from: 'out', port: 'selected' } },
      on: {
        again: [
          { to: { instance: 'out2', action: 'show' } },
          { to: { host: 'composer.attach' } },
        ],
      },
    })
    const reader = component('theorem.test.inspector', 'out2', {
      bind: { item: { from: 'insp', port: 'title', convert: true } },
    })
    const box = component('Split', 'box', { a: [inner], b: [] })
    const extracted = extractComposite(
      layoutOf(outside, box, reader),
      'box',
      'acme.pair',
      lookup,
    )!
    expect(extracted.inputs).toEqual([
      { name: 'item', label: 'Item', type: 'item' },
    ])
    expect(extracted.outputs).toEqual([
      { name: 'title', label: 'Title', type: 'text' },
    ])
    expect(extracted.events.map((e) => e.name)).toEqual(['again'])
    const innerSaved = (extracted.content[0]!.props.a as ComponentData[])[0]!
    expect(innerSaved.props.bind).toEqual({
      item: { from: COMPOSITE_INPUT, port: 'item' },
    })
    // The host route stays inside; the route to the outside instance leaves.
    expect(innerSaved.props.on).toEqual({
      again: [{ to: { host: 'composer.attach' } }],
    })
    const [, placed, retargeted] = extracted.layout.content
    expect(placed!.type).toBe('acme.pair')
    expect(placed!.props.bind).toEqual({
      item: { from: 'out', port: 'selected' },
    })
    expect(placed!.props.on).toEqual({
      again: [{ to: { instance: 'out2', action: 'show' } }],
    })
    expect(retargeted!.props.bind).toEqual({
      item: { from: placed!.props.id, port: 'title', convert: true },
    })
  })

  test('an outside route into the composite is cut; its other routes stay', () => {
    const sender = component('theorem.test.list', 'list', {
      on: {
        ask: [
          { to: { instance: 'insp', action: 'show' } },
          { to: { instance: 'other', action: 'show' } },
          { to: { host: 'composer.ask' } },
        ],
      },
    })
    const inner = component('theorem.test.inspector', 'insp')
    const other = component('theorem.test.inspector', 'other')
    const untouched = component('theorem.test.counter', 'count')
    const box = component('Split', 'box', { a: [inner], b: [] })
    const extracted = extractComposite(
      layoutOf(sender, box, other, untouched),
      'box',
      'acme.one',
      lookup,
    )!
    const [kept, , otherAfter, countAfter] = extracted.layout.content
    expect(kept!.props.on).toEqual({
      ask: [
        { to: { instance: 'other', action: 'show' } },
        { to: { host: 'composer.ask' } },
      ],
    })
    // Instances the extraction does not reach are left as they were.
    expect(otherAfter).toEqual(other)
    expect(countAfter).toEqual(untouched)
  })
})

describe('connections', () => {
  const page = layoutOf(
    component('theorem.test.list', 'a'),
    component('theorem.test.inspector', 'b', {
      bind: { item: { from: 'a', port: 'selected' } },
    }),
    component('theorem.test.list', 'c', {
      bind: { filter: { from: 'b', port: 'title' } },
    }),
  )

  test('a sound page has no problems', () => {
    expect(validateConnections(page, lookup)).toEqual([])
  })

  test('a binding across types must ask to convert', () => {
    const problems = validateConnections(
      layoutOf(
        component('theorem.test.list', 'a'),
        component('theorem.test.list', 'b', {
          bind: { filter: { from: 'a', port: 'selected' } },
        }),
      ),
      lookup,
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]!.message).toContain('must say to convert')
  })

  test('a binding to a removed instance is reported, not followed', () => {
    const problems = validateConnections(
      layoutOf(
        component('theorem.test.inspector', 'b', {
          bind: { item: { from: 'gone', port: 'selected' } },
        }),
      ),
      lookup,
    )
    expect(problems[0]!.message).toContain('no longer on the page')
  })

  test('cycles are refused before they are made, and found when present', () => {
    expect(wouldCycle(page, 'a', 'c')).toBe(true)
    expect(wouldCycle(page, 'c', 'a')).toBe(false)
    const options = sourcesFor(page, lookup, {
      instance: 'a',
      port: list.inputs[0]!,
    })
    expect(options.map((o) => o.instance)).not.toContain('c')
    const looped = layoutOf(
      component('theorem.test.counter', 'x', {
        bind: { n: { from: 'y', port: 'n' } },
      }),
      component('theorem.test.counter', 'y', {
        bind: { n: { from: 'x', port: 'n' } },
      }),
    )
    expect(findCycle(looped)).toEqual(['x', 'y'])
  })

  test('an item event may reach the composer and item actions', () => {
    const targets = targetsFor(page, lookup, {
      instance: 'a',
      port: list.events[0]!,
    })
    expect(targets.map((t) => t.to)).toEqual([
      { host: 'composer.attach' },
      { host: 'composer.ask' },
      { instance: 'b', action: 'show' },
    ])
  })
})

describe('runtime', () => {
  const host = () => {
    const attached: unknown[] = []
    const notices: string[] = []
    return {
      attached,
      notices,
      attach: (r: unknown) => attached.push(r),
      ask: (r: unknown) => attached.push(['ask', r]),
      notice: (_: string, message: string) => notices.push(message),
    }
  }

  test('an equal output changes nothing', () => {
    const runtime = createPageRuntime(lookup, host())
    let changes = 0
    runtime.outputs.subscribe(() => changes++)
    runtime.setOutput('a', 'selected', { id: 'd1' })
    runtime.setOutput('a', 'selected', { id: 'd1' })
    expect(changes).toBe(1)
  })

  test('an event reaches the actions and host routes it is wired to', () => {
    const h = host()
    const runtime = createPageRuntime(lookup, h)
    const shown: unknown[] = []
    runtime.wire('a', {
      type: 'theorem.test.list',
      on: {
        ask: [
          { to: { instance: 'b', action: 'show' } },
          { to: { host: 'composer.attach' }, convert: true },
        ],
      },
    })
    runtime.wire('b', { type: 'theorem.test.inspector', on: {} })
    runtime.handle('b', 'show', (item) => shown.push(item))
    runtime.emit('a', 'ask', { id: 'd1', label: 'Doc' })
    expect(shown).toEqual([{ id: 'd1', label: 'Doc' }])
    expect(h.attached).toEqual([
      {
        label: 'Doc',
        location: { resource: { kind: 'graph-object', objectId: 'd1' } },
      },
    ])
  })

  test('a route that does not say to convert delivers nothing', () => {
    const h = host()
    const runtime = createPageRuntime(lookup, h)
    runtime.wire('a', {
      type: 'theorem.test.list',
      on: { ask: [{ to: { host: 'composer.attach' } }] },
    })
    runtime.emit('a', 'ask', { id: 'd1' })
    expect(h.attached).toEqual([])
  })

  test('events handed round in a loop stop at the depth limit', () => {
    const h = host()
    const runtime = createPageRuntime(lookup, h)
    let calls = 0
    for (const [self, other] of [
      ['b1', 'b2'],
      ['b2', 'b1'],
    ] as const) {
      runtime.wire(self, {
        type: 'theorem.test.inspector',
        on: { again: [{ to: { instance: other, action: 'show' } }] },
      })
      runtime.handle(self, 'show', (item) => {
        calls++
        runtime.emit(self, 'again', item)
      })
    }
    runtime.emit('b1', 'again', { id: 'x' })
    expect(calls).toBe(MAX_EVENT_DEPTH)
    expect(h.notices.some((n) => n.includes('too many times'))).toBe(true)
  })

  test('an instance flooding events is stopped', () => {
    const h = host()
    let clock = 0
    const runtime = createPageRuntime(lookup, h, () => clock)
    runtime.wire('a', { type: 'theorem.test.list', on: {} })
    for (let i = 0; i < MAX_EVENTS_PER_SECOND + 5; i++)
      runtime.emit('a', 'ask', { id: 'x' })
    expect(h.notices).toHaveLength(1)
    clock += 5000
    runtime.emit('a', 'ask', { id: 'x' })
    expect(h.notices).toHaveLength(1)
  })

  test('a composite forwards its inner event; disposal stops everything', () => {
    const h = host()
    const runtime = createPageRuntime(lookup, h)
    runtime.wire('outer', {
      type: 'theorem.test.list',
      on: { ask: [{ to: { host: 'composer.ask' }, convert: true }] },
    })
    runtime.wire('outer/inner', { type: 'theorem.test.list', on: {} })
    runtime.forward('outer/inner', 'ask', 'outer', 'ask')
    runtime.emit('outer/inner', 'ask', { id: 'd1' })
    expect(h.attached).toHaveLength(1)
    runtime.dispose()
    runtime.emit('outer/inner', 'ask', { id: 'd1' })
    runtime.setOutput('outer', 'selected', 1)
    expect(h.attached).toHaveLength(1)
    expect(runtime.outputs.getState()).toEqual({})
  })

  test('a resumed runtime takes calls again; its instances wire afresh', () => {
    const h = host()
    const runtime = createPageRuntime(lookup, h)
    const wiring = {
      type: 'theorem.test.list',
      on: {
        ask: [{ to: { host: 'composer.attach' as const }, convert: true }],
      },
    }
    runtime.wire('a', wiring)
    runtime.emit('a', 'ask', { id: 'r0' })
    expect(h.attached).toHaveLength(1)
    runtime.setOutput('a', 'selected', 1)
    runtime.dispose()
    runtime.setOutput('a', 'selected', 2)
    // What was published before stays, as a hidden view keeps its state.
    expect(runtime.outputs.getState()).toEqual({ a: { selected: 1 } })

    runtime.resume()
    runtime.setOutput('a', 'selected', 3)
    expect(runtime.outputs.getState()).toEqual({ a: { selected: 3 } })
    // Routes made before the disposal are gone until wired again.
    runtime.emit('a', 'ask', { id: 'r1' })
    expect(h.attached).toHaveLength(1)
    runtime.wire('a', wiring)
    runtime.emit('a', 'ask', { id: 'r1' })
    expect(h.attached).toHaveLength(2)
  })
})
