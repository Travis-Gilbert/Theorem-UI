// SOURCING: d3-scale (linear and log scales, ticks), d3-array (leastIndex for the nearest point, cumsum for where each stage starts), d3-shape (line), d3-brush
// with d3-selection (dragging out an x range, pointer position), the d3 modules
// the brief names for Plot; Timeline lays stages on one d3 linear scale in HTML.
import { cumsum, leastIndex } from 'd3-array'
import { brushX } from 'd3-brush'
import type { BrushBehavior, D3BrushEvent } from 'd3-brush'
import { scaleLinear, scaleLog } from 'd3-scale'
import { pointer, select } from 'd3-selection'
import { line } from 'd3-shape'
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useSelection, useTone } from './context'
import { formatNumber, formatValue } from './format'
import { Swatch } from './views'
import type { Region } from './views'

export type Axis = {
  label: string
  unit?: string | null
  scale?: 'linear' | 'log' | null
}
export type Series = { subject: string; x: number[]; y: number[] }
export type Mark = { at: number; label: string }

const HEIGHT = 260
const MARGIN = { top: 20, right: 16, bottom: 28, left: 48 }

/** The element's width, followed as it resizes. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry?.contentRect.width ?? 0),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width || fallback] as const
}

function scaleFor(axis: Axis, values: number[], range: [number, number]) {
  const log = axis.scale === 'log'
  const usable = log ? values.filter((v) => v > 0) : values
  const lo = Math.min(...usable)
  const hi = Math.max(...usable)
  if (log) return scaleLog().domain([lo, hi === lo ? lo * 10 : hi]).range(range).nice()
  return scaleLinear()
    .domain([Math.min(0, lo), hi === lo ? hi + 1 : hi])
    .range(range)
    .nice()
}

/** Log axes label powers of ten only; linear axes take d3's round ticks. */
function ticksOf(axis: Axis, scale: ReturnType<typeof scaleFor>) {
  const ticks = scale.ticks(5)
  return axis.scale === 'log'
    ? ticks.filter((t) => Number.isInteger(Math.log10(t)))
    : ticks
}

const usable = (axis: Axis, v: number | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && (axis.scale !== 'log' || v > 0)

const round3 = (v: number) => Number(v.toPrecision(3))

export function PlotView({
  id,
  x,
  y,
  series,
  marks,
  region,
  setRegion,
}: {
  id: string
  x: Axis
  y: Axis
  series: Series[]
  marks: Mark[]
  region?: Region | null
  setRegion: (region: Region | null) => void
}) {
  const [frame, width] = useWidth<HTMLDivElement>(640)
  const svgRef = useRef<SVGSVGElement>(null)
  const brushRef = useRef<SVGGElement>(null)
  const brush = useRef<BrushBehavior<unknown>>(null)
  const readoutId = useId()
  const { selected, select: choose } = useSelection()
  const [active, setActive] = useState<number>()

  const points = useMemo(
    () =>
      series.map((s) => ({
        subject: s.subject,
        points: s.x.flatMap((xv, i) => {
          const yv = s.y[i]
          return usable(x, xv) && usable(y, yv) ? [[xv, yv] as const] : []
        }),
      })),
    [series, x, y],
  )
  const grid = useMemo(
    () =>
      [...new Set(points.flatMap((s) => s.points.map(([xv]) => xv)))].sort(
        (a, b) => a - b,
      ),
    [points],
  )
  const ys = points.flatMap((s) => s.points.map(([, yv]) => yv))
  const xScale = useMemo(
    () => (grid.length ? scaleFor(x, grid, [MARGIN.left, width - MARGIN.right]) : undefined),
    [grid, x, width],
  )
  const yScale = grid.length
    ? scaleFor(y, ys, [HEIGHT - MARGIN.bottom, MARGIN.top])
    : undefined

  const pointAt = (i: number) => {
    const xv = grid[i]
    const where = `${x.label} ${formatValue(xv, x.unit)}`
    const values = points.flatMap((s) => {
      const hit = s.points.find(([px]) => px === xv)
      return hit ? [`${s.subject} ${formatValue(hit[1], y.unit)}`] : []
    })
    return {
      text: `${where}: ${values.join(', ')}`,
      field: x.label,
      entityId: `plot:${id}/x:${xv}`,
      entityLabel: where,
    }
  }

  const regionSelection = ({ from, to }: Region) => {
    const where = `${x.label} ${formatValue(from, x.unit)} to ${formatValue(to, x.unit)}`
    const spans = points.flatMap((s) => {
      const inside = s.points.filter(([px]) => px >= from && px <= to)
      if (!inside.length) return []
      const values = inside.map(([, py]) => py)
      return [
        `${s.subject} ${formatValue(Math.min(...values), y.unit)} to ${formatValue(Math.max(...values), y.unit)}`,
      ]
    })
    return {
      text: `${where}: ${spans.join(', ')}`,
      field: x.label,
      entityId: `plot:${id}/x:${from}..${to}`,
      entityLabel: where,
    }
  }

  const nearest = (px: number) =>
    xScale ? leastIndex(grid, (xv) => Math.abs(xScale(xv) - px)) : undefined

  const onBrushEnd = useEffectEvent((event: D3BrushEvent<unknown>) => {
    // Moves this component makes itself (following $region) carry no source event.
    if (!event.sourceEvent || !xScale) return
    if (!event.selection) {
      // A click without a drag picks the nearest point and lets go of a range.
      const svg = svgRef.current
      const i = svg ? nearest(pointer(event.sourceEvent, svg)[0]) : undefined
      if (region) setRegion(null)
      if (i !== undefined) choose(pointAt(i))
      return
    }
    const [a, b] = event.selection as [number, number]
    const next = { from: round3(xScale.invert(a)), to: round3(xScale.invert(b)) }
    setRegion(next)
    choose(regionSelection(next))
  })

  useEffect(() => {
    const g = brushRef.current
    if (!g) return
    const behavior = brushX<unknown>()
      .extent([
        [MARGIN.left, MARGIN.top],
        [width - MARGIN.right, HEIGHT - MARGIN.bottom],
      ])
      .on('end', (event: D3BrushEvent<unknown>) => onBrushEnd(event))
    select(g).call(behavior)
    brush.current = behavior
    return () => {
      behavior.on('end', null)
      select(g).on('.brush', null)
    }
  }, [width])

  const from = region?.from
  const to = region?.to
  useEffect(() => {
    const g = brushRef.current
    if (!g || !brush.current || !xScale) return
    select(g).call(
      brush.current.move,
      from !== undefined && to !== undefined ? [xScale(from), xScale(to)] : null,
    )
  }, [from, to, xScale])

  if (!xScale || !yScale)
    return (
      <p data-component="Plot" className="text-xs text-ink-faint">
        No values to plot.
      </p>
    )

  const path = line<readonly [number, number]>()
    .x(([xv]) => xScale(xv))
    .y(([, yv]) => yScale(yv))
  const shown = active ?? undefined
  const shownX = shown === undefined ? undefined : grid[shown]
  const selectedX = selected?.entityId?.startsWith(`plot:${id}/x:`)
    ? Number(selected.entityId.slice(`plot:${id}/x:`.length))
    : undefined
  const move = (i: number | undefined) =>
    setActive(i === undefined ? undefined : Math.max(0, Math.min(grid.length - 1, i)))

  return (
    <figure data-component="Plot" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
        <span className="text-ink-muted">
          {y.label}
          {y.unit && <span className="text-ink-faint"> ({y.unit})</span>}
        </span>
        <span className="flex flex-wrap gap-3">
          {points.map((s) => (
            <span key={s.subject} className="flex items-center gap-1.5 text-ink">
              <Swatch subject={s.subject} />
              {s.subject}
            </span>
          ))}
        </span>
      </div>
      <div ref={frame} className="relative w-full">
        <svg
          ref={svgRef}
          width={width}
          height={HEIGHT}
          tabIndex={0}
          role="group"
          aria-label={`${y.label} against ${x.label}`}
          aria-describedby={readoutId}
          className="block overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [&_.selection]:fill-ink [&_.selection]:fill-opacity-[0.08] [&_.selection]:stroke-ink-faint"
          onPointerMove={(event) => move(nearest(pointer(event.nativeEvent, event.currentTarget)[0]))}
          onPointerLeave={() => move(undefined)}
          onBlur={() => move(undefined)}
          onKeyDown={(event) => {
            const last = grid.length - 1
            const at = active ?? -1
            const keys: Record<string, () => void> = {
              ArrowRight: () => move(at + 1),
              ArrowLeft: () => move(at < 0 ? last : at - 1),
              Home: () => move(0),
              End: () => move(last),
              Enter: () => active !== undefined && choose(pointAt(active)),
              ' ': () => active !== undefined && choose(pointAt(active)),
              Escape: () => {
                choose(undefined)
                if (region) setRegion(null)
              },
            }
            const run = keys[event.key]
            if (!run) return
            event.preventDefault()
            run()
          }}
        >
          <g className="text-xs">
            {ticksOf(y, yScale).map((t) => (
              <g key={t} transform={`translate(0,${yScale(t)})`}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} className="stroke-separator" />
                <text x={MARGIN.left - 6} dy="0.32em" textAnchor="end" className="fill-ink-faint tabular-nums">
                  {formatNumber(t)}
                </text>
              </g>
            ))}
            {ticksOf(x, xScale).map((t) => (
              <text
                key={t}
                x={xScale(t)}
                y={HEIGHT - MARGIN.bottom + 16}
                textAnchor="middle"
                className="fill-ink-faint tabular-nums"
              >
                {formatNumber(t)}
              </text>
            ))}
          </g>
          {marks
            .filter((mark) => usable(x, mark.at))
            .map((mark) => {
              const at = xScale(mark.at)
              if (at < MARGIN.left || at > width - MARGIN.right) return null
              return (
                <g key={`${mark.label}:${mark.at}`} className="text-xs">
                  <line
                    x1={at}
                    x2={at}
                    y1={MARGIN.top}
                    y2={HEIGHT - MARGIN.bottom}
                    strokeDasharray="3 3"
                    className="stroke-ink-faint"
                  />
                  <text x={at} y={MARGIN.top - 6} textAnchor="middle" className="fill-ink-muted">
                    {mark.label}
                  </text>
                </g>
              )
            })}
          {points.map((s) => (
            <SeriesPath key={s.subject} subject={s.subject} d={path(s.points) ?? ''} />
          ))}
          {/* d3-brush paints its selection #777 at 30%; the theme's ink, faint, replaces it. */}
          <g
            ref={brushRef}
            className="[&_.selection]:fill-ink [&_.selection]:[fill-opacity:0.08] [&_.selection]:stroke-ink-faint"
          />
          {selectedX !== undefined && usable(x, selectedX) && (
            <line
              x1={xScale(selectedX)}
              x2={xScale(selectedX)}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
              className="pointer-events-none stroke-ink"
            />
          )}
          {shownX !== undefined && (
            <g className="pointer-events-none">
              <line
                x1={xScale(shownX)}
                x2={xScale(shownX)}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
                className="stroke-ink-faint"
              />
              {points.map((s) => {
                const hit = s.points.find(([px]) => px === shownX)
                return hit ? (
                  <SeriesDot key={s.subject} subject={s.subject} cx={xScale(hit[0])} cy={yScale(hit[1])} />
                ) : null
              })}
            </g>
          )}
        </svg>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
        <span className="text-ink-muted">
          {x.label}
          {x.unit && <span className="text-ink-faint"> ({x.unit})</span>}
        </span>
        <output id={readoutId} aria-live="polite" className="tabular-nums text-ink">
          {shown !== undefined ? (
            pointAt(shown).text
          ) : (
            <span className="text-ink-faint">
              Point to read values; drag across to select a range.
            </span>
          )}
        </output>
      </div>
    </figure>
  )
}

function SeriesPath({ subject, d }: { subject: string; d: string }) {
  const tone = useTone(subject)
  return (
    <path
      d={d}
      data-subject={subject}
      className={cn('pointer-events-none fill-none stroke-2', tone.stroke)}
    />
  )
}

function SeriesDot({ subject, cx, cy }: { subject: string; cx: number; cy: number }) {
  const tone = useTone(subject)
  return <circle cx={cx} cy={cy} r={4} className={cn('stroke-background stroke-2', tone.fill)} />
}

export type Stage = { label: string; duration: number; overhead?: boolean | null }
export type Lane = { subject: string; stages: Stage[] }

export function TimelineView({
  id,
  lanes,
  unit,
  marks,
}: {
  id: string
  lanes: Lane[]
  unit: string
  marks: Mark[]
}) {
  const totals = lanes.map((lane) =>
    lane.stages.reduce((sum, s) => sum + Math.max(0, s.duration), 0),
  )
  const end = Math.max(...totals, ...marks.map((m) => m.at), 0)
  const scale = scaleLinear().domain([0, end || 1]).range([0, 100]).nice(5)
  const ticks = scale.ticks(5)
  return (
    <figure data-component="Timeline" className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className={cn('flex w-24 shrink-0 flex-col gap-2', marks.length > 0 && 'pt-5')}>
          {lanes.map((lane, i) => (
            <div key={lane.subject} className="flex h-8 flex-col justify-center text-xs">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <Swatch subject={lane.subject} />
                {lane.subject}
              </span>
              <span className="tabular-nums text-ink-muted">{formatValue(totals[i], unit)}</span>
            </div>
          ))}
        </div>
        <div className={cn('relative min-w-0 flex-1', marks.length > 0 && 'pt-5')}>
          <div className="flex flex-col gap-2">
            {lanes.map((lane) => (
              <TimelineLane key={lane.subject} id={id} lane={lane} unit={unit} at={scale} />
            ))}
          </div>
          <div className="relative mt-1 h-4 text-xs text-ink-faint tabular-nums">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
                style={{ left: `${scale(t)}%` }}
              >
                {formatValue(t, unit)}
              </span>
            ))}
          </div>
          {marks.map((mark) => (
            <div
              key={`${mark.label}:${mark.at}`}
              className="pointer-events-none absolute top-0 bottom-5 border-l border-dashed border-ink-faint"
              style={{ left: `${scale(mark.at)}%` }}
            >
              <span className="absolute top-0 left-1 whitespace-nowrap text-xs text-ink-muted">
                {mark.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <dl className="flex flex-col gap-1 text-xs">
        {lanes.map((lane) => (
          <div key={lane.subject} className="flex flex-wrap gap-x-3 gap-y-0.5">
            <dt className="font-medium text-ink">{lane.subject}</dt>
            {lane.stages.map((stage) => (
              <dd key={stage.label} className="text-ink-muted">
                {stage.label}{' '}
                <span className="tabular-nums text-ink">{formatValue(stage.duration, unit)}</span>
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </figure>
  )
}

function TimelineLane({
  id,
  lane,
  unit,
  at,
}: {
  id: string
  lane: Lane
  unit: string
  at: (value: number) => number
}) {
  const tone = useTone(lane.subject)
  const { selected, select: choose } = useSelection()
  const ends = cumsum(lane.stages, (s) => Math.max(0, s.duration))
  const total = ends.at(-1) ?? 0
  return (
    <div className="relative h-8 rounded-md bg-raised">
      {lane.stages.map((stage, i) => {
        const duration = Math.max(0, stage.duration)
        const from = (ends[i] ?? 0) - duration
        if (duration === 0) return null
        const entityId = `timeline:${id}/lane:${lane.subject}/stage:${stage.label}`
        const entityLabel = `${lane.subject} · ${stage.label}`
        const left = at(from)
        const width = at(from + duration) - left
        return (
          <button
            key={stage.label}
            type="button"
            data-entity-id={entityId}
            data-entity-label={entityLabel}
            aria-pressed={selected?.entityId === entityId}
            aria-label={`${entityLabel}: ${formatValue(duration, unit)}`}
            title={`${stage.label}: ${formatValue(duration, unit)}`}
            onClick={() =>
              choose({
                text: `${entityLabel}: ${formatValue(duration, unit)}, from ${formatValue(from, unit)} to ${formatValue(from + duration, unit)} of ${formatValue(total, unit)}`,
                field: stage.label,
                entityId,
                entityLabel,
              })
            }
            className={cn(
              'absolute inset-y-0 overflow-hidden rounded-sm border px-1.5 text-start text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring',
              stage.overhead
                ? cn(tone.tint, tone.border, 'text-ink')
                : cn(tone.solid, tone.border, 'text-on-redwood'),
              selected?.entityId === entityId && 'ring-2 ring-ink',
            )}
            style={{ left: `${left}%`, width: `max(${width}%, 2px)` }}
          >
            {width >= 14 && <span className="block truncate leading-[1.875rem]">{stage.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
