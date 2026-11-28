import { describe, expect, test } from 'bun:test'
import type {
  FieldSpec,
  ObjectType,
  RecordRow,
} from '@/components/records/contract'
import { newObjectType, toInput } from '@/components/records/schema-edit'
import {
  MigrationError,
  applyMigration,
  convertValue,
  planMigration,
} from './migration'
import type { MigrationCalls } from './migration'

const field = (key: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  key,
  label: key,
  field_type: { kind: 'text' },
  required: false,
  system: false,
  ...extra,
})

const recipe = (fields: FieldSpec[]): ObjectType => {
  const base = newObjectType({
    labelSingular: 'Recipe',
    labelPlural: 'Recipes',
  })
  return {
    ...base,
    fields: [...base.fields, ...fields],
    object_type_id: 'schema:object-type:t:recipe',
    tenant_id: 't',
    content_anchor: 'sha256:a',
    retired: false,
    record_count: 3,
  }
}

const row = (id: string, values: Record<string, unknown>): RecordRow => ({
  id,
  values: { name: id, ...values },
  relations: {},
})

/** A register held in memory: the rows, the declarations and the writes made. */
function register(rows: RecordRow[], failOn?: string) {
  const state = {
    rows: new Map(rows.map((r) => [r.id, structuredClone(r)])),
    declared: [] as { input: unknown; anchor?: string }[],
    writes: [] as { id: string; patch: Record<string, unknown> }[],
  }
  const calls: MigrationCalls = {
    read: async () => ({ rows: [...state.rows.values()] }),
    declare: async (input, anchor) => {
      state.declared.push({ input, anchor })
      return {
        status: 'declared',
        object_type: {
          ...recipe([]),
          ...input,
          content_anchor: `sha256:${state.declared.length + 1}`,
        },
      } as Awaited<ReturnType<MigrationCalls['declare']>>
    },
    update: async (_type, id, patch) => {
      if (id === failOn && !state.writes.some((w) => w.id === id)) {
        state.writes.push({ id, patch: { failed: true } })
        throw new Error('the register refused it')
      }
      state.writes.push({ id, patch })
      const held = state.rows.get(id)!
      held.values = { ...held.values, ...patch }
    },
  }
  return { state, calls }
}

describe('converting existing values', () => {
  test('text becomes a number where it reads as one', () => {
    expect(convertValue('12', { kind: 'text' }, { kind: 'integer' })).toEqual({
      ok: true,
      value: 12,
    })
    expect(convertValue('1.5', { kind: 'text' }, { kind: 'integer' })).toEqual({
      ok: false,
      reason: '1.5 is not a whole number',
    })
    expect(convertValue('a few', { kind: 'text' }, { kind: 'number' }).ok).toBe(
      false,
    )
  })

  test('a choice keeps its value only where the new choices hold it', () => {
    const to = { kind: 'enum' as const, variants: ['Easy', 'Hard'] }
    expect(convertValue('easy', { kind: 'text' }, to)).toEqual({
      ok: true,
      value: 'Easy',
    })
    expect(
      convertValue(
        ['Easy', 'Hard'],
        { kind: 'enum_many', variants: to.variants },
        to,
      ).ok,
    ).toBe(false)
  })
})

describe('a migration', () => {
  const before = recipe([field('minutes')])
  const after = {
    ...toInput(before),
    fields: before.fields.map((f) =>
      f.key === 'minutes'
        ? { ...f, field_type: { kind: 'integer' as const }, required: true }
        : f,
    ),
  }

  test('previews every object and names the ones that cannot take it', async () => {
    const { calls, state } = register([
      row('soup', { minutes: '30' }),
      row('bread', { minutes: 'an hour' }),
      row('salad', {}),
    ])
    const plan = await planMigration(before, after, {}, calls.read)
    expect(plan.rows.find((r) => r.id === 'soup')?.patch).toEqual({
      minutes: 30,
    })
    expect(plan.rows.find((r) => r.id === 'bread')?.failures[0]?.reason).toBe(
      '"an hour" is not a number',
    )
    expect(plan.rows.find((r) => r.id === 'salad')?.failures[0]?.reason).toBe(
      'has no value, and it would be required',
    )
    expect(state.declared).toEqual([])
    expect(state.writes).toEqual([])
    await expect(applyMigration(plan, calls)).rejects.toBeInstanceOf(
      MigrationError,
    )
    expect(state.declared).toEqual([])
  })

  test('applies a clean plan: declares against the previewed anchor, then writes', async () => {
    const { calls, state } = register([
      row('soup', { minutes: '30' }),
      row('salad', {}),
    ])
    const plan = await planMigration(
      before,
      after,
      { minutes: '5' },
      calls.read,
    )
    await applyMigration(plan, calls)
    expect(state.declared[0]?.anchor).toBe('sha256:a')
    expect(state.rows.get('soup')?.values.minutes).toBe(30)
    expect(state.rows.get('salad')?.values.minutes).toBe(5)
  })

  test('refuses a stale preview and writes nothing', async () => {
    const { calls, state } = register([row('soup', { minutes: '30' })])
    const plan = await planMigration(before, after, {}, calls.read)
    state.rows.get('soup')!.values.minutes = '45'
    await expect(applyMigration(plan, calls)).rejects.toThrow(
      'changed since the preview',
    )
    expect(state.declared).toEqual([])
    expect(state.writes).toEqual([])
  })

  test('a write that fails puts the definition and every value back', async () => {
    const { calls, state } = register(
      [
        row('soup', { minutes: '30' }),
        row('stew', { minutes: '90' }),
        row('tea', { minutes: '4' }),
      ],
      'stew',
    )
    const plan = await planMigration(before, after, {}, calls.read)
    const failure = await applyMigration(plan, calls).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(MigrationError)
    expect((failure as MigrationError).restored).toBe(true)
    // Declared forward, then the previous definition again against the new anchor.
    expect(state.declared).toHaveLength(2)
    expect(state.declared[1]).toEqual({
      input: toInput(before),
      anchor: 'sha256:2',
    })
    expect(state.rows.get('soup')?.values.minutes).toBe('30')
    expect(state.rows.get('stew')?.values.minutes).toBe('90')
    expect(state.rows.get('tea')?.values.minutes).toBe('4')
  })
})
