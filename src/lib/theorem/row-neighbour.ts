// SOURCING: copied from mikecann/threadbear@78b77e1 web/src/sections.ts (MIT, Copyright (c) 2026 Mike Cann). Threadbear is an app, not a package, so there is nothing to depend on.

// The row under `step` from the selected one, for the arrow keys. With
// nothing selected, the first going down and the last going up.
export function neighbour(
  order: readonly string[],
  selected: string | undefined,
  step: 1 | -1,
): string | undefined {
  const at = selected === undefined ? -1 : order.indexOf(selected)
  if (at < 0) return step === 1 ? order[0] : order.at(-1)
  return order[at + step]
}
