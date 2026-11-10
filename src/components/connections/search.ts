// SOURCING: fuzzysort (fuzzy matching, as the quick switcher uses it)
import fuzzysort from 'fuzzysort'

/** The items that match what was typed, best first; with nothing typed, all of them in their order. */
export function matching<T>(
  items: readonly T[],
  query: string,
  ...keys: Array<(item: T) => string>
): T[] {
  const text = query.trim()
  if (!text) return [...items]
  return fuzzysort
    .go(text, items, { keys, threshold: 0 })
    .map((result) => result.obj)
}
