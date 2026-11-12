// SOURCING: none — tests for grouping, ordering helpers, board columns and the patch a card drop means
import { describe, expect, test } from 'bun:test'
import { DOING, DONE, FACETS, TODO, item } from './fixtures'
import {
  NO_GROUP,
  boardColumns,
  defaultsFor,
  describeOrder,
  dropPatch,
  flattenGroups,
  groupItems,
  groupKeysOf,
  toggleDirection,
} from './grouping'

const ada = { id: 'ada', login: 'ada', name: 'Ada Lovelace' }
const lin = { id: 'lin', login: 'lin' }
const bug = { id: 'bug', name: 'bug' }
const docs = { id: 'docs', name: 'docs' }

describe('group keys', () => {
  test('one key for single-valued fields, `none` when unset', () => {
    expect(groupKeysOf(item('1', { status: DOING }), 'status')).toEqual(['doing'])
    expect(groupKeysOf(item('1', { priority: 2 }), 'priority')).toEqual(['2'])
    expect(groupKeysOf(item('1'), 'project')).toEqual([NO_GROUP])
    expect(groupKeysOf(item('1', { projectId: 'p1' }), 'project')).toEqual(['p1'])
    expect(groupKeysOf(item('1', { milestoneId: 'm1' }), 'milestone')).toEqual(['m1'])
    expect(groupKeysOf(item('1', { kind: 'pull_request' }), 'kind')).toEqual(['pull_request'])
    expect(groupKeysOf(item('1'), 'repo')).toEqual(['acme/api'])
  })

  test('an item sits in every group of a many-valued field', () => {
    expect(groupKeysOf(item('1', { assignees: [ada, lin] }), 'assignee')).toEqual([
      'ada',
      'lin',
    ])
    expect(groupKeysOf(item('1', { labels: [bug, docs] }), 'label')).toEqual(['bug', 'docs'])
    expect(groupKeysOf(item('1'), 'assignee')).toEqual([NO_GROUP])
    expect(groupKeysOf(item('1'), 'label')).toEqual([NO_GROUP])
  })
})

describe('groupItems', () => {
  const items = [
    item('1', { status: TODO }),
    item('2', { status: DOING }),
    item('3', { status: TODO }),
    item('4', { status: DONE }),
  ]

  test('the server list orders the groups and gives the full count', () => {
    const groups = groupItems(items, 'status', [
      { key: 'doing', label: 'In Progress', count: 9 },
      { key: 'todo', label: 'Todo', count: 20 },
    ])
    expect(groups.map((g) => [g.key, g.count, g.items.length])).toEqual([
      ['doing', 9, 1],
      ['todo', 20, 2],
      ['done', 1, 1],
    ])
    expect(groups[2]!.label).toBe('Done')
  })

  test('an unnamed group is labelled from its items; no value reads "No ..."', () => {
    const groups = groupItems([item('1'), item('2', { projectId: 'p1' })], 'project')
    expect(groups.map((g) => g.label)).toEqual(['No project', 'p1'])
    const byLabel = groupItems([item('1', { labels: [bug] })], 'label')
    expect(byLabel[0]!.label).toBe('bug')
  })

  test('with no named groups the order is first-seen', () => {
    expect(groupItems(items, 'status').map((g) => g.key)).toEqual(['todo', 'doing', 'done'])
  })
})

describe('board columns', () => {
  test('status columns are every status the facets know, empty ones included', () => {
    const columns = boardColumns('status', FACETS, [
      { key: 'todo', label: 'Todo', count: 5 },
    ])
    expect(columns.map((c) => [c.key, c.count])).toEqual([
      ['todo', 5],
      ['doing', 0],
      ['done', 0],
    ])
  })

  test('a value the facets do not know still gets its column', () => {
    const columns = boardColumns('status', FACETS, [
      { key: 'archived', label: 'Archived', count: 2 },
    ])
    expect(columns.at(-1)).toEqual({ key: 'archived', label: 'Archived', count: 2 })
  })

  test('projects get a "No project" column to drop on', () => {
    const columns = boardColumns('project', FACETS)
    expect(columns.map((c) => c.key)).toEqual(['p1', NO_GROUP])
  })

  test('priority columns run urgent to none', () => {
    expect(boardColumns('priority', undefined).map((c) => c.key)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '0',
    ])
  })
})

describe('flattenGroups', () => {
  test('a collapsed group keeps its header and drops its rows', () => {
    const groups = groupItems([item('1'), item('2', { status: DOING })], 'status')
    const rows = flattenGroups(groups, new Set(['todo']))
    expect(rows.map((r) => r.type)).toEqual(['group', 'group', 'item'])
    expect(flattenGroups(groups, new Set()).map((r) => r.type)).toEqual([
      'group',
      'item',
      'group',
      'item',
    ])
  })
})

describe('ordering', () => {
  test('toggling flips only the direction', () => {
    expect(toggleDirection({ field: 'updatedAt', direction: 'desc' })).toEqual({
      field: 'updatedAt',
      direction: 'asc',
    })
    expect(describeOrder({ field: 'dueAt', direction: 'asc' })).toBe('Due date ascending')
  })
})

describe('a card dropped on another column', () => {
  const card = item('1', { assignees: [ada], labels: [bug, docs] })

  test('status and priority are set', () => {
    expect(dropPatch('status', card, 'todo', 'doing')).toEqual({ statusId: 'doing' })
    expect(dropPatch('priority', card, '3', '1')).toEqual({ priority: 1 })
  })

  test('project and milestone are set, and cleared by the "none" column', () => {
    expect(dropPatch('project', card, NO_GROUP, 'p1')).toEqual({ projectId: 'p1' })
    expect(dropPatch('project', card, 'p1', NO_GROUP)).toEqual({ projectId: null })
    expect(dropPatch('milestone', card, 'm1', NO_GROUP)).toEqual({ milestoneId: null })
  })

  test('many-valued fields swap the column left for the column landed in', () => {
    expect(dropPatch('label', card, 'bug', 'docs')).toEqual({ labels: ['docs'] })
    expect(dropPatch('label', card, 'bug', 'new')).toEqual({ labels: ['docs', 'new'] })
    expect(dropPatch('assignee', card, 'ada', 'lin')).toEqual({ assignees: ['lin'] })
    expect(dropPatch('assignee', card, 'ada', NO_GROUP)).toEqual({ assignees: [] })
  })

  test('no patch for the same column or for a field an item cannot be edited by', () => {
    expect(dropPatch('status', card, 'todo', 'todo')).toBeUndefined()
    expect(dropPatch('repo', card, 'acme/api', 'acme/web')).toBeUndefined()
    expect(dropPatch('kind', card, 'issue', 'task')).toBeUndefined()
    expect(dropPatch(null, card, 'a', 'b')).toBeUndefined()
  })
})

describe('what a new item starts with from a group', () => {
  test('the group value becomes the field', () => {
    expect(defaultsFor('status', 'doing')).toEqual({ statusId: 'doing' })
    expect(defaultsFor('priority', '2')).toEqual({ priority: 2 })
    expect(defaultsFor('label', 'bug')).toEqual({ labels: ['bug'] })
    expect(defaultsFor('assignee', 'ada')).toEqual({ assignees: ['ada'] })
    expect(defaultsFor('project', NO_GROUP)).toEqual({})
    expect(defaultsFor('repo', 'acme/api')).toEqual({})
  })
})
