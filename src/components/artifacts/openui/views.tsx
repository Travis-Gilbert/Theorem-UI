// SOURCING: ui/slider (shadcn base-nova over Base UI Slider, Slider.Label naming
// the thumb), coss Switch, Alert and Badge, ui/button, ui/table. The layouts
// (stat rows, control grids, aligned measures) are this library's own, set in
// the theme's tokens; programs never reach them.
import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { isElementNode } from '@openuidev/lang-core'
import { Fragment, useId } from 'react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/coss/alert'
import { Badge } from '@/components/coss/badge'
import { Switch } from '@/components/coss/switch'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useSelection, useTone } from './context'
import { formatValue } from './format'

type RenderNode = (value: unknown) => ReactNode
export type Region = { from: number; to: number }

const ROLE: Record<string, 'stats' | 'controls'> = {
  Stat: 'stats',
  Slider: 'controls',
  Toggle: 'controls',
}

/** Runs of stats share a row and runs of controls share a grid; the program only lists them. */
export function Blocks({
  children,
  renderNode,
}: {
  children: unknown[]
  renderNode: RenderNode
}) {
  const runs: Array<{ role?: 'stats' | 'controls'; items: unknown[] }> = []
  for (const child of children) {
    const role = isElementNode(child) ? ROLE[child.typeName] : undefined
    const last = runs.at(-1)
    if (role && last?.role === role) last.items.push(child)
    else runs.push({ role, items: [child] })
  }
  return runs.map((run, i) =>
    run.role === 'stats' ? (
      <div
        key={i}
        className="grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-x-6 gap-y-3"
      >
        {renderNode(run.items)}
      </div>
    ) : run.role === 'controls' ? (
      <ControlGrid key={i}>{renderNode(run.items)}</ControlGrid>
    ) : (
      <Fragment key={i}>{renderNode(run.items)}</Fragment>
    ),
  )
}

const ControlGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-x-6 gap-y-4">
    {children}
  </div>
)

export const StackView = ({
  children,
  renderNode,
}: {
  children: unknown[]
  renderNode: RenderNode
}) => (
  <div data-component="Stack" className="flex flex-col gap-5">
    <Blocks renderNode={renderNode}>{children}</Blocks>
  </div>
)

export const SectionView = ({
  title,
  description,
  children,
  renderNode,
}: {
  title: string
  description?: string
  children: unknown[]
  renderNode: RenderNode
}) => (
  <section data-component="Section" className="flex flex-col gap-3">
    <header className="flex flex-col gap-0.5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="text-xs text-ink-muted">{description}</p>}
    </header>
    <Blocks renderNode={renderNode}>{children}</Blocks>
  </section>
)

export const Prose = ({ text }: { text: string }) => (
  <p data-component="Text" className="text-sm leading-6 text-ink">
    {text}
  </p>
)

const CALLOUT = {
  note: { variant: 'default', eyebrow: undefined },
  warning: { variant: 'warning', eyebrow: 'Caveat' },
  assumption: { variant: 'default', eyebrow: 'Assumption' },
} as const

export function CalloutView({
  text,
  kind = 'note',
}: {
  text: string
  kind?: keyof typeof CALLOUT
}) {
  const { variant, eyebrow } = CALLOUT[kind]
  return (
    <Alert data-component="Callout" data-kind={kind} variant={variant}>
      <AlertDescription className="text-sm leading-6 text-ink">
        {eyebrow && (
          <span className="mr-1.5 font-medium text-ink-muted">{eyebrow}</span>
        )}
        {text}
      </AlertDescription>
    </Alert>
  )
}

/** A dot in the subject's color, beside its name. */
export function Swatch({ subject }: { subject?: string | null }) {
  const tone = useTone(subject)
  if (!subject) return null
  return (
    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', tone.solid)} />
  )
}

export function StatView({
  label,
  value,
  unit,
  subject,
  note,
}: {
  label: string
  value: number | string | null
  unit?: string | null
  subject?: string | null
  note?: string | null
}) {
  const shown = formatValue(value, unit)
  return (
    <div
      data-component="Stat"
      data-subject={subject ?? undefined}
      className="flex min-w-0 flex-col gap-0.5"
    >
      <span className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Swatch subject={subject} />
        {label}
      </span>
      <span
        data-slot="value"
        className={cn(
          'font-medium tabular-nums text-ink',
          shown.length > 14 ? 'text-sm leading-5' : 'text-xl',
        )}
      >
        {shown}
      </span>
      {note && <span className="text-xs text-ink-faint">{note}</span>}
    </div>
  )
}

const STEPS = 1000

export function SliderView({
  label,
  value,
  setValue,
  min,
  max,
  unit,
  scale,
  step,
}: {
  label: string
  value: number
  setValue: (value: number) => void
  min: number
  max: number
  unit?: string | null
  scale?: 'linear' | 'log' | null
  step?: number | null
}) {
  // A log slider moves through orders of magnitude evenly; the bound value
  // keeps three significant digits so a model reads round numbers, and stays
  // in range where rounding would carry it past an end (9999 to 10000).
  const log = scale === 'log' && min > 0 && max > min
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const position = log
    ? Math.round((Math.log(clamp(value) / min) / Math.log(max / min)) * STEPS)
    : clamp(value)
  const valueAt = (p: number) =>
    log ? clamp(Number((min * (max / min) ** (p / STEPS)).toPrecision(3))) : p
  // The filled range stays neutral: in an artifact, color marks subjects.
  return (
    <div data-component="Slider">
      <Slider
        className="flex flex-col gap-2.5 **:data-[slot=slider-range]:bg-ink-muted"
        value={[position]}
        min={log ? 0 : min}
        max={log ? STEPS : max}
        step={log ? 1 : (step ?? (max - min) / 100)}
        onValueChange={(next) => {
          const p = Array.isArray(next) ? next[0] : next
          if (typeof p === 'number') setValue(valueAt(p))
        }}
        getAriaValueText={(_, p) => formatValue(valueAt(p), unit)}
      >
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <SliderPrimitive.Label className="text-ink-muted">
            {label}
          </SliderPrimitive.Label>
          <output className="font-medium tabular-nums text-ink">
            {formatValue(value, unit)}
          </output>
        </div>
      </Slider>
    </div>
  )
}

export function ToggleView({
  label,
  value,
  setValue,
  note,
}: {
  label: string
  value: boolean
  setValue: (value: boolean) => void
  note?: string | null
}) {
  const id = useId()
  return (
    <div data-component="Toggle" className="flex items-start gap-2.5">
      <Switch
        id={id}
        checked={value}
        onCheckedChange={setValue}
        aria-describedby={note ? `${id}-note` : undefined}
        className="mt-0.5"
      />
      <span className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-xs font-medium text-ink">
          {label}
        </label>
        {note && (
          <span id={`${id}-note`} className="text-xs text-ink-faint">
            {note}
          </span>
        )}
      </span>
    </div>
  )
}

export type Measure = {
  label: string
  unit: string
  values: number[]
  better?: 'lower' | 'higher' | null
}

export function ComparisonView({
  id,
  subjects,
  measures,
  note,
}: {
  id: string
  subjects: string[]
  measures: Measure[]
  note?: string | null
}) {
  const { selected, select } = useSelection()
  return (
    <div data-component="Comparison" className="flex flex-col gap-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
        {measures.map((measure) => {
          const top = Math.max(...measure.values.map(Math.abs), 0) || 1
          const best =
            measure.better &&
            (measure.better === 'lower' ? Math.min : Math.max)(
              ...measure.values,
            )
          return (
            <Fragment key={measure.label}>
              <p className="col-span-3 mt-2 flex items-baseline gap-2 text-xs first:mt-0">
                <span className="font-medium text-ink">{measure.label}</span>
                {measure.better && (
                  <span className="text-ink-faint">
                    {measure.better} is better
                  </span>
                )}
              </p>
              {subjects.map((subject, i) => {
                const value = measure.values[i]
                if (value === undefined) return null
                const entityId = `comparison:${id}/measure:${measure.label}/subject:${subject}`
                const shown = formatValue(value, measure.unit)
                return (
                  <ComparisonRow
                    key={subject}
                    subject={subject}
                    share={Math.abs(value) / top}
                    shown={shown}
                    best={value === best}
                    entityId={entityId}
                    entityLabel={`${subject} · ${measure.label}`}
                    selected={selected?.entityId === entityId}
                    onSelect={() =>
                      select({
                        text: `${measure.label}: ${subject} ${shown}`,
                        field: measure.label,
                        entityId,
                        entityLabel: `${subject} · ${measure.label}`,
                      })
                    }
                  />
                )
              })}
            </Fragment>
          )
        })}
      </div>
      {note && <p className="text-xs text-ink-faint">{note}</p>}
    </div>
  )
}

function ComparisonRow({
  subject,
  share,
  shown,
  best,
  entityId,
  entityLabel,
  selected,
  onSelect,
}: {
  subject: string
  share: number
  shown: string
  best: boolean
  entityId: string
  entityLabel: string
  selected: boolean
  onSelect: () => void
}) {
  const tone = useTone(subject)
  return (
    <button
      type="button"
      data-entity-id={entityId}
      data-entity-label={entityLabel}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'col-span-3 grid grid-cols-subgrid items-center rounded-md px-1 py-0.5 text-start text-xs outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'bg-selected',
      )}
    >
      <span className="flex items-center gap-1.5 text-ink-muted">
        <Swatch subject={subject} />
        {subject}
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-raised">
        <span
          className={cn('block h-full rounded-full', tone.solid)}
          style={{ width: `${Math.max(share * 100, 1)}%` }}
        />
      </span>
      <span
        className={cn(
          'text-end tabular-nums',
          best ? 'font-semibold text-ink' : 'text-ink-muted',
        )}
      >
        {shown}
      </span>
    </button>
  )
}

export type Step = { title: string; children: unknown[]; note?: string | null }

export function SequenceView({
  steps,
  current,
  setCurrent,
  renderNode,
}: {
  steps: Step[]
  current: number
  setCurrent: (step: number) => void
  renderNode: RenderNode
}) {
  const index = Math.min(steps.length - 1, Math.max(0, Math.round(current)))
  const step = steps[index]
  if (!step) return null
  return (
    <div data-component="Sequence" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ol className="flex flex-wrap items-center gap-1 text-xs">
          {steps.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                aria-current={i === index ? 'step' : undefined}
                onClick={() => setCurrent(i)}
                className={cn(
                  'rounded-md px-2 py-1 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
                  i === index
                    ? 'bg-selected font-medium text-ink'
                    : 'text-ink-muted',
                )}
              >
                {i + 1}. {s.title}
              </button>
            </li>
          ))}
        </ol>
        <div className="flex gap-1">
          <Button
            size="xs"
            variant="ghost"
            disabled={index === 0}
            onClick={() => setCurrent(index - 1)}
          >
            Previous
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={index === steps.length - 1}
            onClick={() => setCurrent(index + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      <div
        aria-live="polite"
        data-step={index}
        className="flex flex-col gap-3 border-t border-separator pt-3"
      >
        {step.note && <p className="text-xs text-ink-muted">{step.note}</p>}
        <Blocks renderNode={renderNode}>{step.children}</Blocks>
      </div>
    </div>
  )
}

export function ExperimentView({
  question,
  controls,
  results,
  assumptions,
  illustrative,
  renderNode,
}: {
  question: string
  controls: unknown[]
  results: unknown[]
  assumptions: string[]
  illustrative: boolean
  renderNode: RenderNode
}) {
  return (
    <div data-component="Experiment" className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-medium leading-6 text-ink">{question}</p>
        {illustrative && (
          <Badge variant="outline" className="mt-0.5">
            Illustrative
          </Badge>
        )}
      </div>
      {controls.length > 0 && (
        <div className="rounded-lg border border-separator bg-raised p-4">
          <ControlGrid>{renderNode(controls)}</ControlGrid>
        </div>
      )}
      <Blocks renderNode={renderNode}>{results}</Blocks>
      {assumptions.length > 0 && (
        <section className="flex flex-col gap-1.5 border-t border-separator pt-3">
          <h4 className="text-xs font-medium text-ink-muted">
            Assumptions
            {illustrative && (
              <span className="font-normal text-ink-faint">
                {' '}
                · an illustrative model, not a measurement
              </span>
            )}
          </h4>
          <ul className="list-disc space-y-0.5 pl-4 text-xs leading-5 text-ink-muted">
            {assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export type Column = {
  key: string
  label: string
  unit?: string | null
  subject?: string | null
}
type Cell = string | number | boolean | null
export type Row = Record<string, Cell>

const within = (value: Cell, region: Region) =>
  typeof value === 'number' &&
  value >= Math.min(region.from, region.to) &&
  value <= Math.max(region.from, region.to)

export function LinkedTableView({
  id,
  columns,
  rows,
  region,
  by,
}: {
  id: string
  columns: Column[]
  rows: Row[]
  region?: Region | null
  by?: string | null
}) {
  const { selected, owner, select } = useSelection()
  const linked = region && by ? region : undefined
  const cell = (row: Row, column: Column) => {
    const value = row[column.key]
    return typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : formatValue(value, column.unit)
  }
  return (
    <div data-component="LinkedTable" className="flex flex-col gap-2">
      <Table className="text-xs">
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key} className="text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Swatch subject={column.subject} />
                  {column.label}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => {
            const rowId = String(row.id ?? i)
            const inside = linked && by ? within(row[by] ?? null, linked) : false
            const [first, ...rest] = columns
            const label = first ? `${first.label} ${cell(row, first)}` : rowId
            const isSelected = owner === id && selected?.rowId === rowId
            // No entityId: the host reads a selection with only a rowId as table
            // rows. Which table it came from stays local, as the owner.
            const choose = () =>
              select(
                {
                  text: [label, ...rest.map((c) => `${c.label} ${cell(row, c)}`)].join(
                    ', ',
                  ),
                  rowId,
                  entityLabel: label,
                },
                id,
              )
            return (
              <TableRow
                key={rowId}
                data-row-id={rowId}
                data-in-region={inside || undefined}
                aria-selected={isSelected}
                tabIndex={0}
                onClick={choose}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    choose()
                  }
                }}
                className={cn(
                  'cursor-pointer outline-none focus-visible:bg-hover',
                  linked && !inside && 'text-ink-faint',
                  inside && 'bg-raised',
                  isSelected && 'bg-selected',
                )}
              >
                {columns.map((column) => (
                  <TableCell key={column.key} className="tabular-nums">
                    {cell(row, column)}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {linked && (
        <p className="text-xs text-ink-faint">
          Rows inside the selected{' '}
          {(columns.find((c) => c.key === by)?.label ?? by)?.toLowerCase()} range
          are marked.
        </p>
      )}
    </div>
  )
}
