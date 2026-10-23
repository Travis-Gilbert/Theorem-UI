// SOURCING: mdast-util-to-markdown with mdast-util-gfm's table writer (a
// block's result as plain Markdown a reader without Theorem can read: a table
// for rows, text otherwise) and format.ts's pinned-output markers.
import type { RootContent, Table, TableRow } from 'mdast'
import { gfmToMarkdown } from 'mdast-util-gfm'
import { toMarkdown } from 'mdast-util-to-markdown'
import { pinnedOutput } from './format'
import type { LiveBlockSource } from './format'
import { formatValue } from './last-run'
import type { QueryResult } from './query'
import type { RunRequestResult } from './sandbox/protocol'
import { isDescribed } from './sandbox/values'

const MAX_ROWS = 50

const cell = (value: unknown) => ({
  type: 'tableCell' as const,
  children: [
    {
      type: 'text' as const,
      value:
        value === null || value === undefined
          ? ''
          : typeof value === 'string'
            ? value
            : formatValue(value),
    },
  ],
})

function table(
  columns: Array<{ key: string; label: string }>,
  rows: Array<Record<string, unknown>>,
): Array<RootContent> {
  const head: TableRow = {
    type: 'tableRow',
    children: columns.map(({ label }) => cell(label)),
  }
  const body = rows
    .slice(0, MAX_ROWS)
    .map(
      (row): TableRow => ({
        type: 'tableRow',
        children: columns.map(({ key }) => cell(row[key])),
      }),
    )
  const nodes: Array<RootContent> = [
    { type: 'table', align: [], children: [head, ...body] } satisfies Table,
  ]
  if (rows.length > MAX_ROWS)
    nodes.push({
      type: 'paragraph',
      children: [
        { type: 'text', value: `…and ${rows.length - MAX_ROWS} more rows.` },
      ],
    })
  return nodes
}

const isRows = (value: unknown): value is Array<Record<string, unknown>> =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((row) => row && typeof row === 'object' && !Array.isArray(row))

const isQueryResult = (value: unknown): value is QueryResult =>
  Boolean(value) &&
  typeof value === 'object' &&
  Array.isArray((value as QueryResult).views)

const isRunResult = (value: unknown): value is RunRequestResult =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as RunRequestResult).status === 'string' &&
  typeof (value as RunRequestResult).message === 'string'

/** A block's value as Markdown, for its pinned output. */
export function outputMarkdown(value: unknown): string {
  let nodes: Array<RootContent>
  if (isQueryResult(value)) {
    const [view] = value.views
    nodes = view ? table(view.columns, view.rows) : []
  } else if (isRunResult(value)) {
    nodes = [{ type: 'paragraph', children: [{ type: 'text', value: value.message }] }]
  } else if (isRows(value)) {
    const keys = [...new Set(value.flatMap((row) => Object.keys(row)))]
    nodes = table(
      keys.map((key) => ({ key, label: key })),
      value,
    )
  } else if (value === undefined || isDescribed(value)) {
    nodes = [
      {
        type: 'paragraph',
        children: [
          {
            type: 'emphasis',
            children: [
              { type: 'text', value: 'Interactive output: open this note in Theorem to see it.' },
            ],
          },
        ],
      },
    ]
  } else {
    nodes = [
      {
        type: 'paragraph',
        children: [{ type: 'inlineCode', value: formatValue(value) }],
      },
    ]
  }
  return toMarkdown(
    { type: 'root', children: nodes },
    { extensions: [gfmToMarkdown()] },
  ).trim()
}

/** The block with its output pinned (or refreshed) to `value`. */
export function withPinnedOutput(
  block: LiveBlockSource,
  id: string,
  value: unknown,
): LiveBlockSource {
  return {
    ...block,
    gap: block.output === null ? '\n\n' : block.gap,
    output: pinnedOutput(id, outputMarkdown(value)),
  }
}

/** The block without its pinned output. */
export const withoutPinnedOutput = (block: LiveBlockSource): LiveBlockSource => ({
  ...block,
  gap: '',
  output: null,
})
