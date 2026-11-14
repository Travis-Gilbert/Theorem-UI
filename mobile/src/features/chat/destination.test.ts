// SOURCING: bun:test
import { describe, expect, test } from 'bun:test'
import { resolveDestination } from './destination'

const chats = { projectId: 'chatproj-a', title: 'Chats' }
const work = { projectId: 'chatproj-b', title: 'Work' }

describe('resolveDestination', () => {
  test('keeps a remembered project this account still has, under its current title', () => {
    expect(resolveDestination({ kind: 'theorem', projectId: 'chatproj-b', projectTitle: 'Old name' }, [chats, work])).toEqual({
      kind: 'theorem',
      projectId: 'chatproj-b',
      projectTitle: 'Work',
    })
  })

  // A project remembered under another account (or deleted since) is not this
  // account's: creating a thread in it is refused, so the first project stands in.
  test('a remembered project this account does not have falls back to the first project', () => {
    expect(resolveDestination({ kind: 'theorem', projectId: 'chatproj-gone', projectTitle: 'Chats' }, [chats, work])).toEqual({
      kind: 'theorem',
      projectId: 'chatproj-a',
      projectTitle: 'Chats',
    })
  })

  test('no Theorem destination until the projects are known', () => {
    expect(resolveDestination({ kind: 'theorem', projectId: 'chatproj-a', projectTitle: 'Chats' }, undefined)).toBeUndefined()
    expect(resolveDestination(undefined, undefined)).toBeUndefined()
    expect(resolveDestination(undefined, [])).toBeUndefined()
  })

  test('nothing remembered goes to the first project', () => {
    expect(resolveDestination(undefined, [chats, work])).toEqual({ kind: 'theorem', projectId: 'chatproj-a', projectTitle: 'Chats' })
  })

  test('an agent on a saved computer does not depend on the projects', () => {
    const agent = { kind: 'agent', agent: 'codex', computerId: 'mac', computerName: 'Mac', folder: '~' } as const
    expect(resolveDestination(agent, undefined)).toBe(agent)
  })
})
