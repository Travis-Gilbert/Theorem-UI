// SOURCING: yaml and zod (the block body and its schema), d3-dsv (CSV and TSV
// rows, typed as the capability bridge types them), picomatch (which files a
// `from` glob takes), d3-array (sorting and the view summaries) and the
// QuickJS formula engine (formulas/) for every expression. The schema borrows
// Obsidian Bases' documented `filters`, `formulas`, `properties` and `views`
// (with `order`, `groupBy`, `limit` and `summaries`), adding `from`, since a
// query reads CSV, JSON, notes, mentions or another block rather than the
// whole vault (plan D9, "no promise of compatibility").
import {
  ascending,
  deviation,
  extent,
  max,
  mean,
  median,
  min,
  sum,
} from 'd3-array'
import { autoType, csvParse, tsvParse } from 'd3-dsv'
import picomatch from 'picomatch'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { computeEmbark, recordsUnder } from './embark'
import type { EmbarkDocument } from './embark'
import type { FormulaEngine } from './formulas/engine'
import type { FileFacts, Filter, RowInput } from './formulas/runner'

const filter: z.ZodType<Filter> = z.lazy(() =>
  z.union([
    z.string(),
    z.strictObject({ and: z.array(filter) }),
    z.strictObject({ or: z.array(filter) }),
    z.strictObject({ not: z.array(filter) }),
  ]),
)

/** Bases' default summaries. */
export const SUMMARIES = [
  'Average',
  'Min',
  'Max',
  'Sum',
  'Range',
  'Median',
  'Stddev',
  'Earliest',
  'Latest',
  'Checked',
  'Unchecked',
  'Empty',
  'Filled',
  'Unique',
] as const
export type SummaryName = (typeof SUMMARIES)[number]

const direction = z.enum(['ASC', 'DESC']).default('ASC')

const view = z.strictObject({
  type: z.enum(['table', 'list', 'calendar']).default('table'),
  name: z.string().optional(),
  filters: filter.optional(),
  /** The columns, in order. */
  order: z.array(z.string()).optional(),
  sort: z.array(z.strictObject({ property: z.string(), direction })).optional(),
  groupBy: z.strictObject({ property: z.string(), direction }).optional(),
  limit: z.number().int().positive().optional(),
  summaries: z.record(z.string(), z.enum(SUMMARIES)).optional(),
  /** A calendar's date property. */
  date: z.string().optional(),
})

export const querySchema = z.strictObject({
  /**
   * What the rows are: a CSV, TSV or JSON file or glob, a glob of notes
   * (`**\/*.md`), another block (`#id`), or `mentions` (this section's
   * mentions; `{ mentions: Heading }` for another section).
   */
  from: z.union([z.string(), z.strictObject({ mentions: z.string() })]),
  filters: filter.optional(),
  formulas: z.record(z.string(), z.string()).optional(),
  properties: z
    .record(z.string(), z.strictObject({ displayName: z.string().optional() }))
    .optional(),
  views: z
    .array(view)
    .min(1)
    .default([{ type: 'table' }]),
})

export type QuerySpec = z.infer<typeof querySchema>
export type QueryViewSpec = z.infer<typeof view>

export class QueryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueryError'
  }
}

/** Parses a query block's YAML body. */
export function parseQuery(body: string): QuerySpec {
  let data: unknown
  try {
    data = parseYaml(body)
  } catch (error) {
    throw new QueryError(
      `The query is not valid YAML: ${(error as Error).message}`,
    )
  }
  const result = querySchema.safeParse(data ?? {})
  if (!result.success)
    throw new QueryError(
      result.error.issues
        .map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`)
        .join('; '),
    )
  sourceOf(result.data)
  return result.data
}

/** What a query's rows come from. */
export type QuerySource =
  | { kind: 'files'; glob: string; format: 'csv' | 'tsv' | 'json' }
  | { kind: 'notes'; glob: string }
  | { kind: 'block'; name: string }
  | { kind: 'mentions'; heading: string | null }

export function sourceOf(spec: QuerySpec): QuerySource {
  const from = spec.from
  if (typeof from !== 'string')
    return { kind: 'mentions', heading: from.mentions }
  const text = from.trim()
  if (text === 'mentions') return { kind: 'mentions', heading: null }
  if (/^#[\w:.-]+$/.test(text)) return { kind: 'block', name: text.slice(1) }
  const extension = /\.(csv|tsv|json|md)$/i.exec(text)?.[1]?.toLowerCase()
  if (extension === 'md') return { kind: 'notes', glob: text }
  if (extension === 'csv' || extension === 'tsv' || extension === 'json')
    return { kind: 'files', glob: text, format: extension }
  throw new QueryError(
    `from: "${text}" is not a CSV, TSV, JSON or Markdown file, a #block or mentions`,
  )
}

/** The workspace paths a query reads, so a change to one recomputes it. */
export function queryReads(spec: QuerySpec): Array<string> {
  const source = sourceOf(spec)
  return source.kind === 'files' || source.kind === 'notes' ? [source.glob] : []
}

/** Other blocks a query reads, by name. */
export function queryInputs(spec: QuerySpec): Array<string> {
  const source = sourceOf(spec)
  return source.kind === 'block' ? [source.name] : []
}

/** What a query needs from the page around it. */
export interface QueryContext {
  client: WorkspaceClient
  engine: FormulaEngine
  /** The document the query sits in. */
  documentPath: string
  /** Its line in that document: `mentions` collects that section. */
  line: number
  /** The document's mentions. */
  embark: () => EmbarkDocument
  /** Other blocks' values, by name. */
  inputs: Record<string, unknown>
  /** Today, `YYYY-MM-DD`, in the person's time zone. */
  today: string
}

export interface QueryColumn {
  key: string
  label: string
}

export type QueryRow = Record<string, unknown>

export interface QueryViewResult {
  type: QueryViewSpec['type']
  name: string
  columns: Array<QueryColumn>
  rows: Array<QueryRow>
  /** Rows by group, when the view groups. */
  groups: Array<{ value: unknown; rows: Array<QueryRow> }> | null
  summaries: Record<string, unknown>
  /** A calendar's date column. */
  dateKey: string | null
  /** Rows that passed the filters, before the limit. */
  total: number
}

/** A query's value: its views, and the first view's rows as `rows`. */
export interface QueryResult {
  views: Array<QueryViewResult>
  rows: Array<QueryRow>
  /** Expressions that failed. */
  errors: Array<string>
}

/** Dates as `YYYY-MM-DD` (or ISO text with a time), so QuickJS can read them. */
function jsonValue(value: unknown): unknown {
  if (value instanceof Date) {
    const iso = value.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso
  }
  if (Array.isArray(value)) return value.map(jsonValue)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, jsonValue(v)]),
    )
  return value
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (jsonValue(value) as Record<string, unknown>)
    : { value: jsonValue(value) }

function facts(
  path: string,
  size: number,
  mtimeMs: number,
  tags: Array<string> = [],
  links: Array<string> = [],
): FileFacts {
  const slash = path.lastIndexOf('/')
  const file = path.slice(slash + 1)
  const dot = file.lastIndexOf('.')
  return {
    name: dot > 0 ? file.slice(0, dot) : file,
    path,
    folder: slash === -1 ? '' : path.slice(0, slash),
    ext: dot > 0 ? file.slice(dot + 1).toLowerCase() : '',
    size,
    mtime: new Date(mtimeMs).toISOString(),
    tags,
    links,
  }
}

const tagsOf = (value: unknown): Array<string> =>
  (Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : []
  )
    .map((tag) => String(tag).replace(/^#/, ''))
    .filter(Boolean)

async function matchingFiles(client: WorkspaceClient, glob: string) {
  const matches = picomatch(glob, { dot: false })
  return (await client.tree())
    .filter((entry) => entry.kind === 'file' && matches(entry.path))
    .sort((a, b) => ascending(a.path, b.path))
}

/** The rows a query's source gives, before formulas and filters. */
export async function loadRows(
  spec: QuerySpec,
  context: QueryContext,
): Promise<Array<RowInput>> {
  const source = sourceOf(spec)
  switch (source.kind) {
    case 'files': {
      const rows: Array<RowInput> = []
      for (const entry of await matchingFiles(context.client, source.glob)) {
        const { text } = await context.client.readText(entry.path)
        const file = facts(entry.path, entry.size, entry.mtimeMs)
        const parsed: Array<unknown> =
          source.format === 'json'
            ? ([] as Array<unknown>).concat(JSON.parse(text) as unknown)
            : [
                ...(source.format === 'csv' ? csvParse : tsvParse)(
                  text,
                  autoType,
                ),
              ]
        for (const row of parsed) rows.push({ values: asObject(row), file })
      }
      return rows
    }
    case 'notes':
      return Promise.all(
        (await matchingFiles(context.client, source.glob)).map(
          async (entry) => {
            const [properties, links] = await Promise.all([
              context.client.properties(entry.path),
              context.client.links(entry.path),
            ])
            return {
              values: asObject(properties),
              file: facts(
                entry.path,
                entry.size,
                entry.mtimeMs,
                tagsOf(properties.tags),
                links.map((link) => link.resolved ?? link.target),
              ),
            }
          },
        ),
      )
    case 'block': {
      const value = context.inputs[source.name]
      const rows =
        value && typeof value === 'object' && 'rows' in value
          ? value.rows
          : value
      if (!Array.isArray(rows))
        throw new QueryError(`#${source.name} is not a list of rows`)
      return rows.map((row) => ({ values: asObject(row) }))
    }
    case 'mentions': {
      const document = context.embark()
      const records = recordsUnder(
        document,
        source.heading === null
          ? { line: context.line }
          : { heading: source.heading },
      )
      const { records: computed } = await computeEmbark(
        records,
        context.engine,
        context.today,
      )
      return computed.map((record) => ({
        values: asObject(record.values),
        mention: {
          date: record.date,
          text: record.text,
          line: record.line,
          links: record.links,
          heading: record.heading,
        },
      }))
    }
  }
}

/** A row's value for a property as a view names it. */
function propertyOf(
  input: RowInput,
  formulas: Record<string, unknown>,
  key: string,
): unknown {
  const dot = key.indexOf('.')
  const prefix = dot === -1 ? '' : key.slice(0, dot)
  const name = key.slice(dot + 1)
  if (prefix === 'formula') return formulas[name] ?? null
  if (prefix === 'file') return input.file?.[name as keyof FileFacts] ?? null
  if (prefix === 'note') return input.values[name] ?? null
  if (prefix === 'mention') return input.mention?.[name] ?? null
  if (key in input.values) return input.values[key]
  if (key === 'date' && input.mention) return input.mention.date
  return null
}

const isEmpty = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

/** Orders two values one way or the other; empty values go last either way. */
function compare(a: unknown, b: unknown, way: 'ASC' | 'DESC' = 'ASC'): number {
  if (isEmpty(a) || isEmpty(b)) return isEmpty(a) ? (isEmpty(b) ? 0 : 1) : -1
  const order =
    typeof a === 'number' && typeof b === 'number'
      ? ascending(a, b)
      : String(a).localeCompare(String(b), undefined, { numeric: true })
  return way === 'DESC' ? -order : order
}

const numbers = (values: Array<unknown>) =>
  values.filter((v): v is number => typeof v === 'number')
const dates = (values: Array<unknown>) =>
  values
    .filter(
      (v): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v)),
    )
    .sort()

/** One of Bases' default summaries over a column's values. */
export function summarize(name: SummaryName, values: Array<unknown>): unknown {
  switch (name) {
    case 'Average':
      return mean(numbers(values)) ?? null
    case 'Min':
      return min(numbers(values)) ?? null
    case 'Max':
      return max(numbers(values)) ?? null
    case 'Sum':
      return sum(numbers(values))
    case 'Range': {
      const [low, high] = extent(numbers(values))
      if (low !== undefined) return high - low
      const sorted = dates(values)
      return sorted.length
        ? Math.round(
            (Date.parse(sorted.at(-1)!) - Date.parse(sorted[0]!)) / 86_400_000,
          )
        : null
    }
    case 'Median':
      return median(numbers(values)) ?? null
    case 'Stddev':
      return deviation(numbers(values)) ?? null
    case 'Earliest':
      return dates(values)[0] ?? null
    case 'Latest':
      return dates(values).at(-1) ?? null
    case 'Checked':
      return values.filter((v) => v === true).length
    case 'Unchecked':
      return values.filter((v) => v === false).length
    case 'Empty':
      return values.filter(isEmpty).length
    case 'Filled':
      return values.filter((v) => !isEmpty(v)).length
    case 'Unique':
      return new Set(values.map((v) => JSON.stringify(v))).size
  }
}

/** Runs a query: loads its rows, computes formulas and filters in QuickJS, then shapes each view. */
export async function runQuery(
  spec: QuerySpec,
  context: QueryContext,
): Promise<QueryResult> {
  const inputs = await loadRows(spec, context)
  const formulaNames = Object.keys(spec.formulas ?? {})
  // One filter per view: the query's filters and the view's, joined by AND.
  const filters = spec.views.map((v) => {
    const both = [spec.filters, v.filters].filter(
      (f): f is Filter => f !== undefined,
    )
    return both.length === 0
      ? null
      : both.length === 1
        ? both[0]!
        : { and: both }
  })
  const slash = context.documentPath.lastIndexOf('/')
  const output = await context.engine({
    kind: 'rows',
    today: context.today,
    rows: inputs,
    formulas: spec.formulas ?? {},
    filters,
    self: {
      file: facts(context.documentPath, 0, 0),
      name: context.documentPath.slice(slash + 1).replace(/\.md$/, ''),
    },
  })
  const errors = [...output.filterErrors]
  for (const [i, row] of output.rows.entries())
    for (const [name, message] of Object.entries(row.errors))
      errors.push(`row ${i + 1}, formula.${name}: ${message}`)

  const label = (key: string) =>
    spec.properties?.[key]?.displayName ??
    key.replace(/^(note|formula|file|mention)\./, '')
  const defaultColumns = () => {
    const keys = new Set<string>()
    if (inputs.some((input) => input.mention)) keys.add('mention.text')
    for (const input of inputs)
      for (const key of Object.keys(input.values)) keys.add(key)
    if (
      inputs.some((input) => input.file) &&
      !inputs.some((input) => input.mention)
    )
      keys.add('file.name')
    for (const name of formulaNames) keys.add(`formula.${name}`)
    return [...keys]
  }

  const views = spec.views.map((viewSpec, v): QueryViewResult => {
    const keys = viewSpec.order ?? defaultColumns()
    const dateKey =
      viewSpec.type === 'calendar'
        ? (viewSpec.date ??
          (inputs.some((i) => i.mention) ? 'mention.date' : 'date'))
        : null
    const needed = [...new Set([...keys, ...(dateKey ? [dateKey] : [])])]
    let rows = inputs
      .map((input, i) => ({ input, formulas: output.rows[i]?.formula ?? {} }))
      .filter((_row, i) => output.passed[v]?.[i] ?? true)
    const sorts = viewSpec.sort ?? []
    if (sorts.length)
      rows = rows.toSorted((a, b) => {
        for (const { property, direction: way } of sorts) {
          const order = compare(
            propertyOf(a.input, a.formulas, property),
            propertyOf(b.input, b.formulas, property),
            way,
          )
          if (order) return order
        }
        return 0
      })
    const total = rows.length
    if (viewSpec.limit) rows = rows.slice(0, viewSpec.limit)
    const shaped = rows.map(({ input, formulas }) =>
      Object.fromEntries(
        needed.map((key) => [key, propertyOf(input, formulas, key)]),
      ),
    )
    let groups: QueryViewResult['groups'] = null
    if (viewSpec.groupBy) {
      const { property, direction: way } = viewSpec.groupBy
      const byValue = new Map<
        string,
        { value: unknown; rows: Array<QueryRow> }
      >()
      rows.forEach(({ input, formulas }, i) => {
        const value = propertyOf(input, formulas, property)
        const key = JSON.stringify(value)
        const group = byValue.get(key) ?? { value, rows: [] }
        group.rows.push(shaped[i]!)
        byValue.set(key, group)
      })
      groups = [...byValue.values()].sort((a, b) =>
        compare(a.value, b.value, way),
      )
    }
    const summaries = Object.fromEntries(
      Object.entries(viewSpec.summaries ?? {}).map(([key, name]) => [
        key,
        summarize(
          name,
          shaped.map((row) => row[key]),
        ),
      ]),
    )
    return {
      type: viewSpec.type,
      name: viewSpec.name ?? `View ${v + 1}`,
      columns: keys.map((key) => ({ key, label: label(key) })),
      rows: shaped,
      groups,
      summaries,
      dateKey,
      total,
    }
  })
  return { views, rows: views[0]?.rows ?? [], errors }
}
