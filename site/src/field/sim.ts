// SOURCING: hand-rolled. The seam between the drawing path and the Conway simulation (through @life/life); no behaviour of its own beyond the seeded random().
/** What the drawing path needs from a simulation: a 0 to 1 target per cell, advanced one generation at a time. */
export interface Sim {
  readonly cols: number
  readonly rows: number
  /** Where each cell is heading, 0 (empty) to 1 (alive), row-major. Replaced when the grid resizes. */
  readonly target: Float32Array
  /** One generation. */
  tick(): void
  /** Brings these cells to life. From here they are ordinary cells and go on by the rule. */
  paint(cells: ReadonlyArray<readonly [number, number]>): void
  /** Starts this many new colonies at random places. */
  plant(count: number): void
  resize(cols: number, rows: number): void
}

/** mulberry32: a seeded random(), so a story can pin a field and a page can start a new one each load. No dependency models a seeded generator this small. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
