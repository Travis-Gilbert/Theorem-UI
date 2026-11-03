// SOURCING: hand-rolled. The classic Life patterns written as plaintext rows (the LifeWiki .cells convention: O alive, . dead); a handful of fixed shapes does not warrant an RLE parser
/** Live cell offsets from the pattern's top-left corner. */
export type Cells = ReadonlyArray<readonly [number, number]>

export interface Pattern {
  readonly width: number
  readonly height: number
  readonly cells: Cells
}

export function parsePattern(rows: ReadonlyArray<string>): Pattern {
  const cells: Array<[number, number]> = []
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === 'O') cells.push([x, y])
  })
  return {
    width: Math.max(...rows.map((row) => row.length)),
    height: rows.length,
    cells,
  }
}

const source = {
  glider: ['.O.', '..O', 'OOO'],
  blinker: ['OOO'],
  lwss: ['.O..O', 'O....', 'O...O', 'OOOO.'],
  rpentomino: ['.OO', 'OO.', '.O.'],
  acorn: ['.O.....', '...O...', 'OO..OOO'],
  pulsar: [
    '..OOO...OOO..',
    '.............',
    'O....O.O....O',
    'O....O.O....O',
    'O....O.O....O',
    '..OOO...OOO..',
    '.............',
    '..OOO...OOO..',
    'O....O.O....O',
    'O....O.O....O',
    'O....O.O....O',
    '.............',
    '..OOO...OOO..',
  ],
  gun: [
    '........................O...........',
    '......................O.O...........',
    '............OO......OO............OO',
    '...........O...O....OO............OO',
    'OO........O.....O...OO..............',
    'OO........O...O.OO....O.O...........',
    '..........O.....O.......O...........',
    '...........O...O....................',
    '............OO......................',
  ],
} as const

export type PatternName = keyof typeof source

export const PATTERNS = Object.fromEntries(
  Object.entries(source).map(([name, rows]) => [name, parsePattern(rows)]),
) as Record<PatternName, Pattern>

export const PATTERN_LABELS: Record<PatternName, string> = {
  glider: 'Glider',
  blinker: 'Blinker',
  lwss: 'Spaceship',
  rpentomino: 'R-pentomino',
  acorn: 'Acorn',
  pulsar: 'Pulsar',
  gun: 'Glider gun',
}
