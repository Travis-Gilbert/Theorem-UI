// SOURCING: mulberry32 (Tommy Ettinger's public-domain 32-bit generator), the usual small seeded generator; a face that is replayed from a seed must draw the same numbers.

/** A seeded generator of numbers in [0, 1). */
export type Random = () => number

export function seeded(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A number between two bounds. */
export const between = (random: Random, low: number, high: number) =>
  low + (high - low) * random()

/** One of a list by weight; `undefined` only for an empty list or no weight. */
export function weighted<T>(
  random: Random,
  items: ReadonlyArray<T>,
  weight: (item: T) => number,
): T | undefined {
  let total = 0
  for (const item of items) total += Math.max(0, weight(item))
  if (total <= 0) return undefined
  let at = random() * total
  for (const item of items) {
    at -= Math.max(0, weight(item))
    if (at < 0) return item
  }
  return items.at(-1)
}

/** A seed from a string, so a name can stand for one. */
export function seedOf(text: string) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
