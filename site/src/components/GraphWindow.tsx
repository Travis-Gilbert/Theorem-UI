import { useEffect, useState } from 'react'
import { graphWindow } from '@/content'
import { cn } from '@/lib/utils'

// Models on the left feed the harness, which writes to the stores on the
// right. Particles flow along dotted edges and the run log plays line by line.
const MODEL_X = 92
const HUB = { x: 300, y: 210, r: 36 }
const STORE_X = 506
const modelY = [70, 163, 256, 349]
const storeY = [115, 210, 305]

const inbound = modelY.map(
  (y) => `M152,${y} C220,${y} 222,${HUB.y} ${HUB.x - HUB.r},${HUB.y}`,
)
const outbound = storeY.map(
  (y) =>
    `M${HUB.x + HUB.r},${HUB.y} C390,${HUB.y} 392,${y} ${STORE_X - 66},${y}`,
)

function Pill({
  x,
  y,
  w,
  label,
  active,
}: {
  x: number
  y: number
  w: number
  label: string
  active?: boolean
}) {
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - 15}
        width={w}
        height={30}
        rx={15}
        fill="var(--card)"
        stroke={
          active
            ? 'var(--primary)'
            : 'color-mix(in oklab, var(--foreground) 22%, transparent)'
        }
        strokeWidth={active ? 1.5 : 1}
        style={{ transition: 'stroke 400ms' }}
      />
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ font: '500 12px var(--font-mono)', fill: 'var(--foreground)' }}
      >
        {label}
      </text>
    </g>
  )
}

export function GraphWindow() {
  const lines = graphWindow.log
  // Prerendered with the whole log shown; once mounted it replays in a loop.
  const [step, setStep] = useState(lines.length)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setStep(0)
    const timer = window.setInterval(
      () => setStep((s) => (s >= lines.length + 2 ? 0 : s + 1)),
      1300,
    )
    return () => window.clearInterval(timer)
  }, [lines.length])

  const activeModel = step <= 3 ? 0 : 1

  return (
    <div className="bezel rounded-[22px] p-[5px]">
      <div className="night overflow-hidden rounded-[18px] bg-background text-foreground">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {graphWindow.title}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-xs text-sage">
            <span className="size-1.5 animate-pulse rounded-full bg-sage" />
            live
          </span>
        </div>

        <div className="grid md:grid-cols-[1.55fr_1fr]">
          <div className="relative border-border md:border-r">
            <svg
              viewBox="0 0 600 420"
              className="block h-auto w-full"
              role="img"
              aria-label="Four models feed one harness, which writes to the graph, skills and capabilities."
            >
              <defs>
                <pattern
                  id="gw-dots"
                  width="14"
                  height="14"
                  patternUnits="userSpaceOnUse"
                >
                  <circle
                    cx="7"
                    cy="7"
                    r="0.9"
                    fill="color-mix(in oklab, var(--foreground) 14%, transparent)"
                  />
                </pattern>
                <radialGradient id="gw-fade">
                  <stop offset="0.35" stopColor="#fff" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
                <mask id="gw-mask">
                  <rect width="600" height="420" fill="url(#gw-fade)" />
                </mask>
                <filter
                  id="gw-glow"
                  x="-200%"
                  y="-200%"
                  width="500%"
                  height="500%"
                >
                  <feGaussianBlur stdDeviation="3" />
                </filter>
              </defs>
              <rect
                width="600"
                height="420"
                fill="url(#gw-dots)"
                mask="url(#gw-mask)"
              />

              {[...inbound, ...outbound].map((d, i) => (
                <g key={d}>
                  <path
                    d={d}
                    fill="none"
                    stroke="color-mix(in oklab, var(--foreground) 16%, transparent)"
                    strokeWidth="1"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={
                      i === activeModel || i >= inbound.length
                        ? 'var(--primary)'
                        : 'color-mix(in oklab, var(--foreground) 45%, transparent)'
                    }
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    className="flow"
                    style={{
                      animationDelay: `${-i * 0.37}s`,
                      transition: 'stroke 400ms',
                    }}
                  />
                  <circle
                    r="4"
                    fill="var(--primary)"
                    filter="url(#gw-glow)"
                    className="pulse"
                  >
                    <animateMotion
                      dur="2.6s"
                      repeatCount="indefinite"
                      begin={`${i * 0.45}s`}
                      path={d}
                    />
                  </circle>
                </g>
              ))}
              <path
                d={`M${STORE_X},130 V195 M${STORE_X},225 V290`}
                stroke="color-mix(in oklab, var(--foreground) 25%, transparent)"
                strokeDasharray="2 4"
              />

              <circle
                cx={HUB.x}
                cy={HUB.y}
                r={HUB.r}
                fill="none"
                stroke="var(--primary)"
                className="beat"
              />
              <circle
                cx={HUB.x}
                cy={HUB.y}
                r={HUB.r}
                fill="var(--card)"
                stroke="var(--primary)"
                strokeWidth="1.5"
              />
              <text
                x={HUB.x}
                y={HUB.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{
                  font: 'italic 500 17px var(--font-serif)',
                  fill: 'var(--foreground)',
                }}
              >
                {graphWindow.hub}
              </text>

              {graphWindow.models.map((m, i) => (
                <Pill
                  key={m}
                  x={MODEL_X}
                  y={modelY[i]!}
                  w={120}
                  label={m}
                  active={i === activeModel}
                />
              ))}
              {graphWindow.stores.map((s, i) => (
                <Pill key={s} x={STORE_X} y={storeY[i]!} w={128} label={s} />
              ))}
            </svg>
          </div>

          <ol
            className="space-y-2.5 border-t border-border p-5 font-mono text-[12.5px] leading-relaxed md:border-t-0 md:p-6"
            aria-label="Run log"
          >
            {lines.map((line, i) => (
              <li
                key={line.text}
                className={cn(
                  'flex gap-3 transition-all duration-500',
                  i < step
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-1.5 opacity-0',
                )}
              >
                <span
                  className={cn(
                    'w-3 shrink-0',
                    line.mark === '∎' ? 'text-primary' : 'text-sage',
                  )}
                >
                  {line.mark}
                </span>
                <span
                  className={
                    i === step - 1 ? 'text-foreground' : 'text-muted-foreground'
                  }
                >
                  {line.text}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
