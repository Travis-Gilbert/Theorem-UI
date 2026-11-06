// SOURCING: hand-rolled. The conversions between the module value types are
// this app's own (docs/plans/modular-interface.md, "Connections"); each one
// is explicit in the binding that uses it, never applied silently.
import type { TheoremContextReference } from '@theoremharness/sdk'
import type { Item, ValueType } from './contract'

export const isItem = (value: unknown): value is Item =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Item).id === 'string'

export function isReference(value: unknown): value is TheoremContextReference {
  if (typeof value !== 'object' || value === null) return false
  const { location } = value as { location?: unknown }
  return (
    typeof location === 'object' &&
    location !== null &&
    typeof (location as { resource?: unknown }).resource === 'object'
  )
}

/** Whether `value` is a value of `type`; `undefined` is "no value" for every type. */
export function isValueOf(type: ValueType, value: unknown): boolean {
  if (value === undefined) return true
  switch (type) {
    case 'text':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'item':
      return isItem(value)
    case 'reference':
      return isReference(value)
    case 'json':
      return true
  }
}

/**
 * The reference an item stands for in a conversation: its resource when it
 * has one, else the graph object its id names. Index item ids are document
 * ids or `record:<object>/<id>`.
 */
export function referenceForItem(item: Item): TheoremContextReference {
  if (item.resource && typeof item.resource.kind === 'string')
    return {
      label: item.label,
      location: {
        resource:
          item.resource as TheoremContextReference['location']['resource'],
      },
    }
  const record = /^record:([^/]+)\/(.+)$/.exec(item.id)
  return {
    label: item.label ?? item.id,
    location: {
      resource: record
        ? { kind: 'graph-object', objectId: record[2]!, objectType: record[1] }
        : { kind: 'graph-object', objectId: item.id },
    },
  }
}

type Converter = (value: unknown) => unknown

/** Conversions a binding may ask for, from one type to another. */
const CONVERSIONS: Partial<
  Record<ValueType, Partial<Record<ValueType, Converter>>>
> = {
  text: {
    number: (v) => {
      const n = Number(v)
      return typeof v === 'string' && v.trim() && Number.isFinite(n)
        ? n
        : undefined
    },
    boolean: (v) => (v === 'true' ? true : v === 'false' ? false : undefined),
    item: (v) => (typeof v === 'string' && v ? { id: v } : undefined),
  },
  number: { text: (v) => String(v) },
  boolean: { text: (v) => String(v) },
  item: {
    text: (v) => (isItem(v) ? (v.label ?? v.id) : undefined),
    reference: (v) => (isItem(v) ? referenceForItem(v) : undefined),
  },
  reference: {
    text: (v) =>
      isReference(v)
        ? (v.label ?? v.excerpt ?? v.location.resource.kind)
        : undefined,
  },
}

/**
 * Whether a source of type `from` can feed a target of type `to`, and
 * whether it needs a conversion to. `json` takes anything, and anything is
 * checked on its way out of `json`.
 */
export function compatibility(
  from: ValueType,
  to: ValueType,
): 'same' | 'convert' | 'none' {
  if (from === to || to === 'json') return 'same'
  if (from === 'json' || CONVERSIONS[from]?.[to]) return 'convert'
  return 'none'
}

/** `value` as type `to`, or `undefined` when it cannot be. */
export function convert(value: unknown, from: ValueType, to: ValueType) {
  if (value === undefined) return undefined
  if (from === to || to === 'json') return value
  if (from === 'json') return isValueOf(to, value) ? value : undefined
  const converter = CONVERSIONS[from]?.[to]
  return converter ? converter(value) : undefined
}

/** The value at a dot path, `item.label`, `rows.0.id`; `undefined` past the end. */
export function pick(value: unknown, path: string | undefined): unknown {
  if (!path) return value
  let at: unknown = value
  for (const key of path.split('.')) {
    if (typeof at !== 'object' || at === null) return undefined
    if (!Object.hasOwn(at, key)) return undefined
    at = (at as Record<string, unknown>)[key]
  }
  return at
}

/**
 * Whether two values are the same for the purpose of propagation: setting an
 * output to an equal value changes nothing downstream.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
