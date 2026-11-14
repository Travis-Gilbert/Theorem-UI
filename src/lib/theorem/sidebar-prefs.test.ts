// SOURCING: bun:test over the pure pin and session-type logic in ./sidebar-prefs
import { describe, expect, test } from 'bun:test'
import {
  BUILT_IN_TYPES,
  isPinned,
  movePin,
  togglePin,
  typeId,
  typeOf,
} from './sidebar-prefs'
import type { Pin, SessionType } from './sidebar-prefs'

describe('pins', () => {
  const a: Pin = { kind: 'thread', id: 'a' }
  const p: Pin = { kind: 'project', id: 'a' }

  test('toggling adds at the end and removes only the same kind and id', () => {
    const pins = togglePin(togglePin([], a), p)
    expect(pins).toEqual([a, p])
    expect(togglePin(pins, a)).toEqual([p])
    expect(isPinned(pins, { kind: 'thread', id: 'a' })).toBe(true)
  })

  test('moving keeps every pin and ignores out-of-range places', () => {
    const b: Pin = { kind: 'thread', id: 'b' }
    expect(movePin([a, p, b], 2, 0)).toEqual([b, a, p])
    expect(movePin([a, p], 0, 5)).toEqual([a, p])
  })
})

describe('session types', () => {
  const mine: SessionType = {
    id: 'research',
    label: 'Research',
    mark: 'research',
    builtIn: false,
  }

  test('an unset or removed type reads as Conversation', () => {
    expect(typeOf('t', {}, []).id).toBe('conversation')
    expect(typeOf('t', { t: 'gone' }, []).id).toBe('conversation')
    expect(typeOf('t', { t: 'coding' }, []).label).toBe('Coding')
    expect(typeOf('t', { t: 'research' }, [mine]).mark).toBe('research')
  })

  test('the built-in defaults are files: document, terminal, checklist', () => {
    expect(BUILT_IN_TYPES.map((type) => type.mark)).toEqual([
      'document',
      'terminal-file',
      'checklist-file',
    ])
  })

  test('a new type id is a unique slug', () => {
    expect(typeId('Code Review!', BUILT_IN_TYPES)).toBe('code-review')
    expect(typeId('Coding', BUILT_IN_TYPES)).toBe('coding-2')
    expect(typeId('***', [])).toBe('type')
  })
})
