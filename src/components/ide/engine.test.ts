// SOURCING: none — bun:test over the engine switch
import { describe, expect, test } from 'bun:test'
import { chooseIdeEngine, ENGINE_BASE, ENGINE_KEY } from './engine'

const memory = (initial: Record<string, string> = {}) => {
  const held = new Map(Object.entries(initial))
  return {
    held,
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
  }
}

describe('chooseIdeEngine', () => {
  test('Theia is the default, with or without storage', () => {
    expect(chooseIdeEngine('')).toBe('theia')
    expect(chooseIdeEngine('?other=1', memory())).toBe('theia')
  })

  test('the address selects an engine and is remembered for the next load', () => {
    const storage = memory()
    expect(chooseIdeEngine('?ide=cm', storage)).toBe('cm')
    expect(storage.held.get(ENGINE_KEY)).toBe('cm')
    expect(chooseIdeEngine('', storage)).toBe('cm')
  })

  test('the address beats the remembered choice, and ?ide=theia returns to the default', () => {
    const storage = memory({ [ENGINE_KEY]: 'cm' })
    expect(chooseIdeEngine('?ide=theia', storage)).toBe('theia')
    expect(chooseIdeEngine('', storage)).toBe('theia')
  })

  test('an unknown value is ignored, in the address and in storage', () => {
    expect(chooseIdeEngine('?ide=vim', memory())).toBe('theia')
    expect(chooseIdeEngine('', memory({ [ENGINE_KEY]: 'vim' }))).toBe('theia')
    const storage = memory({ [ENGINE_KEY]: 'cm' })
    expect(chooseIdeEngine('?ide=vim', storage)).toBe('cm')
  })

  test('a storage that throws costs the memory, not the choice', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(chooseIdeEngine('?ide=cm', blocked)).toBe('cm')
    expect(chooseIdeEngine('', blocked)).toBe('theia')
  })

  test('each engine is served from its own address', () => {
    expect(ENGINE_BASE).toEqual({ theia: '/theia/', cm: '/ide-cm/' })
  })
})
