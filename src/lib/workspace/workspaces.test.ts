import { describe, expect, test } from 'bun:test'
import type { WorkspaceEntry } from './types'
import { applyWorkspaceEvent } from './workspaces'

const file = (id: string, path: string, size = 1): WorkspaceEntry => ({
  id,
  path,
  kind: 'file',
  size,
  mtimeMs: 1,
})
const folder = (id: string, path: string): WorkspaceEntry => ({
  id,
  path,
  kind: 'directory',
  size: 0,
  mtimeMs: 1,
})

const tree = [
  folder('vf_a', 'a'),
  file('vf_a1', 'a/one.md'),
  folder('vf_ab', 'a/b'),
  file('vf_ab2', 'a/b/two.md'),
  file('vf_ab3', 'ab.md'),
]
const paths = (entries: Array<WorkspaceEntry>) =>
  entries.map((e) => `${e.id}=${e.path}`).sort()

describe('applyWorkspaceEvent', () => {
  test('created adds the entry, changed replaces it', () => {
    const created = applyWorkspaceEvent(tree, {
      type: 'created',
      entry: file('vf_new', 'a/new.md'),
      origin: 'external',
    })
    expect(created).toHaveLength(tree.length + 1)
    const changed = applyWorkspaceEvent(created, {
      type: 'changed',
      entry: file('vf_new', 'a/new.md', 9),
      hash: 'h',
      origin: 'app',
    })
    expect(changed).toHaveLength(tree.length + 1)
    expect(changed.find((e) => e.id === 'vf_new')?.size).toBe(9)
  })

  test('deleting a folder removes what is inside it, and only that', () => {
    const next = applyWorkspaceEvent(tree, {
      type: 'deleted',
      id: 'vf_a',
      path: 'a',
      origin: 'external',
    })
    expect(paths(next)).toEqual(['vf_ab3=ab.md'])
  })

  test('moving a folder carries its contents and keeps every id', () => {
    const moved = applyWorkspaceEvent(tree, {
      type: 'renamed',
      id: 'vf_a',
      from: 'a',
      to: 'z/a',
      origin: 'app',
    })
    expect(paths(moved)).toEqual([
      'vf_a1=z/a/one.md',
      'vf_a=z/a',
      'vf_ab2=z/a/b/two.md',
      'vf_ab3=ab.md',
      'vf_ab=z/a/b',
    ])
    // The per-entry events that follow the folder's change nothing more.
    const again = applyWorkspaceEvent(moved, {
      type: 'renamed',
      id: 'vf_ab2',
      from: 'a/b/two.md',
      to: 'z/a/b/two.md',
      origin: 'app',
    })
    expect(paths(again)).toEqual(paths(moved))
  })

  test('indexed and resync leave the tree as it is', () => {
    expect(applyWorkspaceEvent(tree, { type: 'indexed' })).toBe(tree)
    expect(applyWorkspaceEvent(tree, { type: 'resync' })).toBe(tree)
  })
})
