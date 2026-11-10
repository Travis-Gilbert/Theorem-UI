// SOURCING: none — tests for the filter builder's conversions to and from the contract's WorkFilter
import { describe, expect, test } from 'bun:test'
import type { WorkCondition, WorkFilter } from './contract'
import { EMPTY_FILTER } from './contract'
import {
  addChip,
  chipOf,
  conditionOf,
  describeChip,
  flipAt,
  operatorsFor,
  removeAt,
  sameFilter,
  settle,
  valueOptions,
} from './filter'
import { FACETS } from './fixtures'

describe('chips and conditions', () => {
  test('one value is `is`, several are `in`', () => {
    expect(conditionOf({ field: 'status', operator: 'is', values: ['todo'] })).toEqual({
      field: 'status',
      operator: 'is',
      value: 'todo',
    })
    expect(
      conditionOf({ field: 'status', operator: 'is', values: ['todo', 'doing'] }),
    ).toEqual({ field: 'status', operator: 'in', value: ['todo', 'doing'] })
  })

  test('negation keeps its polarity when the count changes', () => {
    expect(settle('is_not', 2)).toBe('not_in')
    expect(settle('not_in', 1)).toBe('is_not')
    expect(settle('contains', 3)).toBe('contains')
  })

  test('priority values go out as numbers, a draft flag as a boolean', () => {
    expect(conditionOf({ field: 'priority', operator: 'is', values: ['1'] })).toEqual({
      field: 'priority',
      operator: 'is',
      value: 1,
    })
    expect(conditionOf({ field: 'draft', operator: 'is', values: ['true'] })).toEqual({
      field: 'draft',
      operator: 'is',
      value: true,
    })
  })

  test('is_empty carries no value', () => {
    expect(
      conditionOf({ field: 'assignee', operator: 'is_empty', values: [] }),
    ).toEqual({ field: 'assignee', operator: 'is_empty' })
  })

  test('a condition becomes a chip and back unchanged', () => {
    const conditions: WorkCondition[] = [
      { field: 'label', operator: 'in', value: ['bug', 'docs'] },
      { field: 'assignee', operator: 'is', value: 'me' },
      { field: 'priority', operator: 'is_not', value: 2 },
      { field: 'draft', operator: 'is', value: false },
      { field: 'dueAt', operator: 'is_not_empty' },
      { field: 'text', operator: 'contains', value: 'crash' },
    ]
    for (const condition of conditions)
      expect(conditionOf(chipOf(condition))).toEqual(condition)
  })
})

describe('building a filter', () => {
  const based: WorkFilter = {
    op: 'and',
    conditions: [{ field: 'status', operator: 'is', value: 'todo' }],
  }

  test('adding to a field with the same polarity merges the values', () => {
    const next = addChip(based, { field: 'status', operator: 'is', values: ['doing'] })
    expect(next.conditions).toEqual([
      { field: 'status', operator: 'in', value: ['todo', 'doing'] },
    ])
  })

  test('adding a value already held does not repeat it', () => {
    const next = addChip(based, { field: 'status', operator: 'is', values: ['todo'] })
    expect(next.conditions).toEqual([{ field: 'status', operator: 'is', value: 'todo' }])
  })

  test('the opposite polarity is a condition of its own', () => {
    const next = addChip(based, { field: 'status', operator: 'is_not', values: ['done'] })
    expect(next.conditions).toHaveLength(2)
  })

  test('removing and flipping one condition leaves the others', () => {
    const two = addChip(based, { field: 'label', operator: 'is', values: ['bug'] })
    expect(removeAt(two, 0).conditions).toEqual([
      { field: 'label', operator: 'is', value: 'bug' },
    ])
    expect(flipAt(two, 1).conditions[1]).toEqual({
      field: 'label',
      operator: 'is_not',
      value: 'bug',
    })
    // A condition with no opposite is returned as it was.
    const text = addChip(EMPTY_FILTER, { field: 'text', operator: 'contains', values: ['x'] })
    expect(flipAt(text, 0)).toBe(text)
  })

  test('the same meaning compares equal however it was written', () => {
    const a: WorkFilter = {
      op: 'and',
      conditions: [{ field: 'status', operator: 'in', value: ['todo'] }],
    }
    expect(sameFilter(a, based)).toBe(true)
    expect(sameFilter(a, EMPTY_FILTER)).toBe(false)
  })
})

describe('what a field offers', () => {
  test('operators follow the field kind', () => {
    expect(operatorsFor('status')).toEqual(['is', 'is_not', 'in', 'not_in'])
    expect(operatorsFor('assignee')).toContain('is_empty')
    expect(operatorsFor('dueAt')).toEqual(['before', 'after', 'is_empty', 'is_not_empty'])
    expect(operatorsFor('text')).toEqual(['contains'])
    expect(operatorsFor('draft')).toEqual(['is'])
  })

  test('values come from the facets, with "me" first for people', () => {
    expect(valueOptions('status', FACETS).map((o) => o.label)).toEqual([
      'Todo',
      'In Progress',
      'Done',
    ])
    expect(valueOptions('assignee', FACETS)[0]).toEqual({ value: 'me', label: 'Me' })
    expect(valueOptions('assignee', FACETS).map((o) => o.label)).toContain('Ada Lovelace')
    expect(valueOptions('label', undefined)).toEqual([])
    expect(valueOptions('priority', undefined).map((o) => o.label)).toEqual([
      'Urgent',
      'High',
      'Medium',
      'Low',
      'No priority',
    ])
  })

  test('a chip reads in names, falling back to the raw value', () => {
    expect(
      describeChip({ field: 'status', operator: 'in', values: ['todo', 'gone'] }, FACETS),
    ).toBe('Status is any of Todo, gone')
    expect(
      describeChip({ field: 'assignee', operator: 'is_empty', values: [] }, FACETS),
    ).toBe('Assignee is empty')
  })
})
