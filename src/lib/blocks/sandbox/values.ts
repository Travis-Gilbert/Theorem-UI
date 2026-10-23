// SOURCING: hand-rolled. structuredClone (the platform's structured clone,
// which postMessage uses) decides what crosses as is; whatever it refuses,
// functions, React elements and DOM nodes, becomes a short description, which
// is this app's own presentation of a value it cannot send. @ungap's lossy
// clone drops such values silently instead.

/** What a value that cannot cross the bridge becomes. */
export interface DescribedValue {
  $described: 'function' | 'element' | 'node' | 'symbol' | 'other'
  text: string
}

export const isDescribed = (value: unknown): value is DescribedValue =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { $described?: unknown }).$described === 'string'

const MAX_DEPTH = 8
const REACT_ELEMENT = /^Symbol\(react\.(transitional\.)?element\)$/

function isReactElement(value: object): boolean {
  const tag = (value as { $$typeof?: unknown }).$$typeof
  return typeof tag === 'symbol' && REACT_ELEMENT.test(tag.toString())
}

function elementName(value: object): string {
  const type = (value as { type?: unknown }).type
  if (typeof type === 'string') return type
  if (typeof type === 'function') return type.name || 'Component'
  return 'element'
}

function describe(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (typeof value === 'function')
    return {
      $described: 'function',
      text: `function ${value.name || '(anonymous)'}`,
    }
  if (typeof value === 'symbol')
    return { $described: 'symbol', text: value.toString() }
  if (typeof value !== 'object' || value === null) return value
  if (isReactElement(value))
    return { $described: 'element', text: `<${elementName(value)} />` }
  if (typeof Node !== 'undefined' && value instanceof Node)
    return { $described: 'node', text: value.nodeName.toLowerCase() }
  if (seen.has(value) || depth >= MAX_DEPTH)
    return { $described: 'other', text: '…' }
  seen.add(value)
  try {
    return structuredClone(value)
  } catch {
    // Some part of it cannot be cloned; describe it part by part.
  }
  // Something that says how it serializes, such as a state collection.
  const toJSON = (value as { toJSON?: unknown }).toJSON
  if (typeof toJSON === 'function')
    return describe(toJSON.call(value), depth + 1, seen)
  if (Array.isArray(value))
    return value.map((item) => describe(item, depth + 1, seen))
  if (value instanceof Map)
    return new Map(
      [...value].map(([key, item]) => [
        describe(key, depth + 1, seen),
        describe(item, depth + 1, seen),
      ]),
    )
  if (value instanceof Set)
    return new Set([...value].map((item) => describe(item, depth + 1, seen)))
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value))
    out[key] = describe(item, depth + 1, seen)
  return out
}

/** The value, or a copy with every part that cannot be cloned described. */
export function toClonable(value: unknown): unknown {
  try {
    structuredClone(value)
    return value
  } catch {
    return describe(value, 0, new WeakSet())
  }
}

/**
 * A program block's value: its top-level declarations that can be sent to
 * other blocks. Functions, components and elements stay inside the block.
 */
export function blockValue(outputs: unknown): Record<string, unknown> {
  const value: Record<string, unknown> = {}
  if (typeof outputs !== 'object' || outputs === null) return value
  for (const [name, item] of Object.entries(outputs)) {
    if (name.startsWith('_')) continue
    const clonable = toClonable(item)
    if (!isDescribed(clonable)) value[name] = clonable
  }
  return value
}
