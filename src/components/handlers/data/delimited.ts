// SOURCING: papaparse. Delimited text as rows, without the table that draws them, so a note's data fence does not load the file handler.
import Papa from 'papaparse'

export type Row = Array<string>

/** The file's rows, the first naming the columns. */
export function parseDelimited(text: string) {
  const parsed = Papa.parse<Row>(text, { skipEmptyLines: 'greedy' })
  const [header = [], ...rows] = parsed.data
  const width = Math.max(header.length, ...rows.map((r) => r.length))
  const names = Array.from(
    { length: width },
    (_, i) => header[i]?.trim() || `Column ${i + 1}`,
  )
  // Papa Parse can report more than one error for a row, and reports a file
  // whose delimiter it guessed (one column, say) with no row at all.
  const unreadable = new Set(
    parsed.errors.flatMap((error) =>
      error.row === undefined ? [] : error.row,
    ),
  ).size
  return { names, rows, unreadable }
}
