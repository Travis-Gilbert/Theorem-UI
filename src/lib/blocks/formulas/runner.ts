// SOURCING: none; this file is the script QuickJS runs (engine.ts strips its
// types with Sucrase and evaluates it in a fresh QuickJS context). It may use
// ECMAScript built-ins only: no imports, no DOM. User expressions are compiled
// here with the Function constructor, inside QuickJS, so they never reach the
// page's realm. The expression language borrows Obsidian Bases' filters and
// formulas (bare names, `note.`, `file.`, `formula.`, `this`) with plain
// JavaScript operators; docs/blocks/live-blocks.md describes it.

/** A filter as Bases writes one: an expression, or `and`/`or`/`not` of filters. */
export type Filter =
  | string
  | { and: Array<Filter> }
  | { or: Array<Filter> }
  | { not: Array<Filter> }

/** A file a row came from, for `file.*` and the `file.has…()` functions. */
export interface FileFacts {
  name: string
  path: string
  folder: string
  ext: string
  size: number
  mtime: string
  tags: Array<string>
  links: Array<string>
}

export interface RowInput {
  /** Columns, frontmatter or mention fields: what a bare name reads. */
  values: Record<string, unknown>
  file?: FileFacts
  /** Where an Embark mention sits: `mention.date`, `mention.text` and so on. */
  mention?: Record<string, unknown>
}

/** Formulas and filters over rows (query blocks). */
export interface RowsTask {
  kind: 'rows'
  today: string
  rows: Array<RowInput>
  formulas: Record<string, string>
  /** Each filter is applied to every row; null keeps every row. */
  filters: Array<Filter | null>
  /** What `this` is: the document the block sits in. */
  self: Record<string, unknown> | null
}

export interface RowsOutput {
  rows: Array<{
    formula: Record<string, unknown>
    errors: Record<string, string>
  }>
  /** For each filter, whether each row passed. */
  passed: Array<Array<boolean>>
  /** Filter expressions that failed, with their messages. */
  filterErrors: Array<string>
}

/** A formula written on an outline node, evaluated on each record below it. */
export interface ChainFormula {
  expression: string
  /** The node it was written on: records under one node chain together. */
  scope: number
}

export interface ChainRecord {
  date: string | null
  values: Record<string, unknown>
  formulas: Record<string, ChainFormula>
}

/** Per-day formulas: each record's formulas see the record before it as `prev`. */
export interface ChainTask {
  kind: 'chain'
  today: string
  /** In document order. */
  records: Array<ChainRecord>
}

export interface ChainOutput {
  records: Array<{
    values: Record<string, unknown>
    errors: Record<string, string>
  }>
}

export type FormulaTask = RowsTask | ChainTask
export type FormulaOutput<TTask extends FormulaTask> = TTask extends RowsTask
  ? RowsOutput
  : ChainOutput

const DAY = 86_400_000

/** `YYYY-MM-DD` for a date, a timestamp or text that starts with one. */
function isoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const date =
    typeof value === 'number' ? new Date(value) : new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function helpers(today: string) {
  return {
    today: () => today,
    now: () => new Date().toISOString(),
    date: isoDate,
    addDays: (value: unknown, days: number) => {
      const date = isoDate(value)
      return date && isoDate(Date.parse(date) + days * DAY)
    },
    daysBetween: (from: unknown, to: unknown) => {
      const a = isoDate(from)
      const b = isoDate(to)
      return a && b ? Math.round((Date.parse(b) - Date.parse(a)) / DAY) : null
    },
    list: (value: unknown) =>
      Array.isArray(value)
        ? value
        : value === null || value === undefined
          ? []
          : [value],
    number: (value: unknown) => {
      const number = Number(value)
      return Number.isNaN(number) ? null : number
    },
    sum: (values: Array<unknown>) =>
      values.reduce<number>((total, value) => total + (Number(value) || 0), 0),
  }
}

type Compiled = (scope: object) => unknown
const compiled = new Map<string, Compiled>()

function compile(expression: string): Compiled {
  let fn = compiled.get(expression)
  if (!fn) {
    // Sloppy-mode on purpose: `with` makes every name a lookup in the scope,
    // so a missing column reads as undefined, as a missing property does in
    // Bases. The newline lets an expression end in a line comment.
    fn = new Function(
      '__scope',
      `with (__scope) { return (${expression}\n) }`,
    ) as Compiled
    compiled.set(expression, fn)
  }
  return fn
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/** A scope where names are looked up in `lookup`, then the helpers, then the built-ins. */
function scopeOf(
  lookup: (name: string) => { found: boolean; value?: unknown },
  base: Record<string, unknown>,
): object {
  return new Proxy(Object.create(null) as object, {
    has: (_target, name) => typeof name === 'string' && name !== '__scope',
    get(_target, name) {
      if (typeof name !== 'string') return undefined
      const own = lookup(name)
      if (own.found) return own.value
      if (name in base) return base[name]
      return (globalThis as Record<string, unknown>)[name]
    },
  })
}

function fileObject(file: FileFacts | undefined) {
  if (!file) return undefined
  const lower = (values: Array<string>) => values.map((v) => v.toLowerCase())
  return {
    ...file,
    hasTag: (...tags: Array<string>) =>
      tags.some((tag) =>
        lower(file.tags).includes(tag.replace(/^#/, '').toLowerCase()),
      ),
    inFolder: (folder: string) => {
      const clean = folder.replace(/\/+$/, '')
      return file.folder === clean || file.folder.startsWith(`${clean}/`)
    },
    hasLink: (target: string) =>
      file.links.some(
        (link) => link === target || link.replace(/\.md$/, '') === target,
      ),
  }
}

function runRows(task: RowsTask): RowsOutput {
  const base = helpers(task.today)
  const output: RowsOutput = { rows: [], passed: [], filterErrors: [] }
  const filterErrors = new Set<string>()

  const scopes = task.rows.map((row, index) => {
    const values: Record<string, unknown> = {}
    const errors: Record<string, string> = {}
    const evaluating = new Set<string>()
    const file = fileObject(row.file)
    const formula: Record<string, unknown> = new Proxy(values, {
      get(target, name) {
        if (typeof name !== 'string' || !(name in task.formulas))
          return undefined
        if (name in target) return target[name]
        if (evaluating.has(name)) throw new Error(`formula.${name} uses itself`)
        evaluating.add(name)
        try {
          target[name] = compile(task.formulas[name]!).call(task.self, scope)
        } catch (error) {
          errors[name] = message(error)
          target[name] = null
        } finally {
          evaluating.delete(name)
        }
        return target[name]
      },
    })
    const scope = scopeOf((name) => {
      if (name === 'note') return { found: true, value: row.values }
      if (name === 'file') return { found: true, value: file }
      if (name === 'formula') return { found: true, value: formula }
      if (name === 'mention') return { found: true, value: row.mention }
      if (Object.hasOwn(row.values, name))
        return { found: true, value: row.values[name] }
      if (name === 'date' && row.mention)
        return { found: true, value: row.mention.date }
      return { found: false }
    }, base)
    for (const name of Object.keys(task.formulas)) void formula[name]
    output.rows[index] = { formula: values, errors }
    return scope
  })

  const test = (filter: Filter, scope: object): boolean => {
    if (typeof filter === 'string') {
      try {
        return Boolean(compile(filter).call(task.self, scope))
      } catch (error) {
        filterErrors.add(`${filter}: ${message(error)}`)
        return false
      }
    }
    if ('and' in filter) return filter.and.every((f) => test(f, scope))
    if ('or' in filter) return filter.or.some((f) => test(f, scope))
    return !filter.not.some((f) => test(f, scope))
  }
  output.passed = task.filters.map((filter) =>
    scopes.map((scope) => (filter === null ? true : test(filter, scope))),
  )
  output.filterErrors = [...filterErrors]
  return output
}

function runChain(task: ChainTask): ChainOutput {
  const base = helpers(task.today)
  interface Live extends ChainRecord {
    computed: Record<string, unknown>
    errors: Record<string, string>
    evaluating: Set<string>
  }
  const records = task.records.map(
    (record): Live => ({
      ...record,
      computed: {},
      errors: {},
      evaluating: new Set(),
    }),
  )

  // Records under one node chain in date order; undated ones keep their place
  // after the dated ones, in document order.
  const chains = new Map<number, Array<Live>>()
  for (const record of records)
    for (const { scope } of Object.values(record.formulas)) {
      const chain = chains.get(scope) ?? []
      if (!chain.includes(record)) chain.push(record)
      chains.set(scope, chain)
    }
  for (const chain of chains.values())
    chain.sort((a, b) =>
      a.date === b.date
        ? 0
        : a.date === null
          ? 1
          : b.date === null
            ? -1
            : a.date < b.date
              ? -1
              : 1,
    )

  const valueOf = (record: Live, name: string): unknown => {
    const formula = record.formulas[name]
    if (!formula) return record.values[name]
    if (name in record.computed) return record.computed[name]
    if (record.evaluating.has(name)) throw new Error(`${name} uses itself`)
    record.evaluating.add(name)
    try {
      const chain = chains.get(formula.scope)!
      const previous = chain[chain.indexOf(record) - 1]
      record.computed[name] = compile(formula.expression)(
        scopeFor(record, previous),
      )
    } catch (error) {
      record.errors[name] = message(error)
      record.computed[name] = null
    } finally {
      record.evaluating.delete(name)
    }
    return record.computed[name]
  }

  const fieldsOf = (record: Live) =>
    new Proxy(Object.create(null) as Record<string, unknown>, {
      get: (_target, name) =>
        typeof name === 'string' ? valueOf(record, name) : undefined,
    })

  function scopeFor(record: Live, previous: Live | undefined): object {
    return scopeOf((name) => {
      if (name === 'prev')
        return { found: true, value: previous && fieldsOf(previous) }
      if (name === 'day') return { found: true, value: record.date }
      if (name in record.formulas || Object.hasOwn(record.values, name))
        return { found: true, value: valueOf(record, name) }
      return { found: false }
    }, base)
  }

  // In chain order, so `prev` is always computed before what reads it and the
  // stack never grows with the number of days.
  for (const chain of chains.values())
    for (const record of chain)
      for (const name of Object.keys(record.formulas)) valueOf(record, name)

  return {
    records: records.map((record) => ({
      values: record.computed,
      errors: record.errors,
    })),
  }
}

/** The entry point engine.ts calls with the task as JSON. */
export function run(input: string): string {
  const task = JSON.parse(input) as FormulaTask
  const output = task.kind === 'rows' ? runRows(task) : runChain(task)
  // JSON for the trip back: dates become ISO text, functions are dropped.
  return JSON.stringify(output)
}
