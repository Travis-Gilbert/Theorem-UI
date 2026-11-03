import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

// Wraps a figure's <svg>; marks it in view once so its strokes rule themselves
// in (see .figure in styles.css).
export function Figure({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          node.dataset.inview = ''
          observer.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className={`figure ${className}`}
    >
      {children}
    </div>
  )
}

// Stroke and label presets shared by every figure.
export const ink = {
  fill: 'none',
  stroke: 'var(--color-ink)',
  strokeWidth: 1.25,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
  pathLength: 1,
  className: 'draw',
} as const

// Construction lines are dashed, so they fade in rather than rule in.
export const dashed = {
  fill: 'none',
  stroke: 'var(--color-ink-faint)',
  strokeWidth: 1,
  strokeDasharray: '3 5',
  className: 'reveal',
} as const

export function Label({
  x,
  y,
  children,
  i = 12,
  anchor = 'middle',
  mono = false,
  size,
  fill = 'var(--color-ink)',
}: {
  x: number
  y: number
  children: ReactNode
  i?: number
  anchor?: 'start' | 'middle' | 'end'
  mono?: boolean
  size?: number
  fill?: string
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="middle"
      className="reveal"
      style={{
        ['--i' as string]: i,
        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-serif)',
        fontStyle: mono ? 'normal' : 'italic',
        fontSize: size ?? (mono ? 11 : 20),
        letterSpacing: mono ? '0.06em' : undefined,
        fill,
      }}
    >
      {children}
    </text>
  )
}

export const order = (i: number) => ({ ['--i' as string]: i })

// Fine diagonal hatching and a dot screen, the two fills the figures use to
// show equal areas.
export function Patterns({ id }: { id: string }) {
  return (
    <defs>
      <pattern
        id={`${id}-hatch`}
        width="7"
        height="7"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="7"
          stroke="var(--color-ink-faint)"
          strokeWidth="0.9"
        />
      </pattern>
      <pattern
        id={`${id}-dots`}
        width="7"
        height="7"
        patternUnits="userSpaceOnUse"
      >
        <circle cx="3.5" cy="3.5" r="1.1" fill="var(--color-agent)" />
      </pattern>
    </defs>
  )
}
