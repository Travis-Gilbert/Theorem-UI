import { describe, expect, test } from 'bun:test'
import type { DataModel, ObjectType } from '@/components/records/contract'
import { newObjectType } from '@/components/records/schema-edit'
import { NOTES_EXTENSION, classRegistry } from './classes'

const declared = (
  label: string,
  extra: Partial<ObjectType> = {},
  notes?: Record<string, unknown>,
): ObjectType => {
  const base = newObjectType({ labelSingular: label, labelPlural: `${label}s` })
  return {
    ...base,
    object_type_id: `schema:object-type:t:${label.toLowerCase()}`,
    tenant_id: 't',
    content_anchor: `sha256:${label}`,
    retired: false,
    record_count: 0,
    ...(notes ? { extensions: { [NOTES_EXTENSION]: notes } } : {}),
    ...extra,
  }
}

const model = (types: ObjectType[]): DataModel => ({
  objectTypes: types,
  observedShapes: [],
  divergences: [],
  relations: [],
})

describe('class registry', () => {
  const types = [
    declared('Page', {}, { native: 'page', standard: true }),
    declared('App', {}, { native: 'app', standard: true }),
    declared('Notebook', {}, { native: 'notebook', standard: true }),
    declared('Deck', {}, { native: 'deck', forms: ['slides'] }),
    declared('Collection', {}, { role: 'collection', standard: true }),
    declared('Claim', { system: true }),
    declared('Recipe'),
    declared('Old', { retired: true }),
  ]
  const registry = classRegistry(model(types))

  test('system types are kept out of the workspace and listed apart', () => {
    expect(registry.workspace.map((c) => c.label)).toEqual([
      'App',
      'Deck',
      'Notebook',
      'Page',
      'Recipe',
    ])
    expect(registry.substrate.map((c) => c.label)).toEqual(['Claim'])
    expect(registry.substrate[0]?.system).toBe(true)
  })

  test('native kinds are open, and a class names the forms it holds', () => {
    expect(registry.native.deck?.label).toBe('Deck')
    expect(registry.formClass('slides')?.label).toBe('Deck')
    expect(registry.formClass('marimo')?.label).toBe('Notebook')
    expect(registry.formClass('unknown-form')?.label).toBe('App')
  })

  test('the collection role and retired classes stay out of navigation', () => {
    expect(registry.collection?.label).toBe('Collection')
    expect(registry.workspace.some((c) => c.retired || c.role)).toBe(false)
    expect(registry.all).toHaveLength(types.length)
  })
})
