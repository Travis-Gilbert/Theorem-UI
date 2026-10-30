// Adapted from Tailark Veil features/one.tsx (MIT; see tailark/LICENCE.md):
// the same 2×2 outline cards with an illustration under each, redrawn for
// Theorem.
import { Card } from '@/components/tailark/card'
import { features } from '@/content'
import { SquaredRectangle } from './figures/Propositions'
import { Reveal } from './Reveal'

function Chip({ children }: { children: string }) {
  return (
    <div className="relative flex h-8 items-center rounded-full bg-card px-3 font-mono text-xs shadow-sm ring ring-border shadow-black/6.5">
      {children}
    </div>
  )
}

function Models() {
  const [a, b, c, d, e, f] = features.cards.models.chips
  return (
    <div aria-hidden className="flex h-44 flex-col justify-between pt-8">
      <div className="relative flex h-10 items-center gap-10 px-6">
        <div className="absolute inset-0 my-auto h-px bg-border" />
        <Chip>{a!}</Chip>
        <Chip>{b!}</Chip>
      </div>
      <div className="relative flex h-10 items-center justify-between gap-10 pr-6 pl-16">
        <div className="absolute inset-0 my-auto h-px bg-border" />
        <Chip>{c!}</Chip>
        <div className="relative size-3 rounded-full bg-primary shadow-[0_0_0_6px_color-mix(in_oklab,var(--primary)_18%,transparent)]" />
        <Chip>{d!}</Chip>
      </div>
      <div className="relative flex h-10 items-center gap-16 px-8">
        <div className="absolute inset-0 my-auto h-px bg-border" />
        <Chip>{e!}</Chip>
        <Chip>{f!}</Chip>
      </div>
    </div>
  )
}

// A main line with two branches, each ending where a replayed run diverged.
function Fork() {
  return (
    <svg aria-hidden viewBox="0 0 320 176" className="h-44 w-full">
      <path
        d="M10,120 H310"
        stroke="var(--foreground)"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M90,120 C130,120 130,64 175,64 H300"
        stroke="var(--primary)"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M180,120 C215,120 215,160 250,160 H300"
        stroke="var(--sage)"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="3 4"
      />
      {[40, 90, 140, 180, 230, 280].map((x) => (
        <circle
          key={x}
          cx={x}
          cy={120}
          r={4}
          fill="var(--card)"
          stroke="var(--foreground)"
          strokeOpacity="0.5"
        />
      ))}
      <circle
        cx={220}
        cy={64}
        r={4}
        fill="var(--card)"
        stroke="var(--primary)"
      />
      <circle cx={290} cy={64} r={6} fill="var(--primary)" />
      <circle cx={290} cy={160} r={5} fill="var(--card)" stroke="var(--sage)" />
      <text
        x={90}
        y={146}
        textAnchor="middle"
        style={{
          font: '11px var(--font-mono)',
          fill: 'var(--muted-foreground)',
        }}
      >
        run 2191
      </text>
      <text
        x={250}
        y={50}
        textAnchor="middle"
        style={{ font: '11px var(--font-mono)', fill: 'var(--primary)' }}
      >
        b/plan-2
      </text>
    </svg>
  )
}

// Journal frames: most are chunks, the highlighted ones are synced roots.
function Journal() {
  const roots = new Set([4, 9, 13, 18, 23, 31])
  return (
    <div aria-hidden className="flex h-44 justify-between pt-12 pb-6">
      {Array.from({ length: 32 }, (_, i) => (
        <div
          key={i}
          className={`h-full w-px ${roots.has(i) ? 'bg-primary' : 'bg-foreground/15'}`}
        />
      ))}
    </div>
  )
}

export function Features() {
  const { cards } = features
  return (
    <section id="features" className="scroll-mt-16 py-28 @container">
      <div className="mx-auto max-w-3xl px-6">
        <Reveal>
          <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
            <span className="text-primary">§</span> Features
          </p>
          <h2 className="mt-5 font-serif text-[clamp(34px,4.4vw,52px)] leading-[1.05] font-medium tracking-[-0.015em] text-balance">
            {features.title}
          </h2>
          <p className="mt-4 max-w-lg text-balance text-muted-foreground">
            {features.body}
          </p>
        </Reveal>
        <Reveal className="mt-12 grid gap-3 *:p-6 @xl:grid-cols-2">
          <Card
            variant="outline"
            className="row-span-2 grid grid-rows-subgrid p-6"
          >
            <div className="space-y-2">
              <h3 className="font-medium">{cards.models.title}</h3>
              <p className="text-sm text-muted-foreground">
                {cards.models.body}
              </p>
            </div>
            <Models />
          </Card>
          <Card
            variant="outline"
            className="row-span-2 grid grid-rows-subgrid overflow-hidden p-6"
          >
            <div className="space-y-2">
              <h3 className="font-medium">{cards.fork.title}</h3>
              <p className="text-sm text-muted-foreground">{cards.fork.body}</p>
            </div>
            <Fork />
          </Card>
          <Card
            variant="outline"
            className="row-span-2 grid grid-rows-subgrid overflow-hidden p-6"
          >
            <div className="space-y-2">
              <h3 className="font-medium">{cards.durable.title}</h3>
              <p className="text-sm text-muted-foreground">
                {cards.durable.body}
              </p>
            </div>
            <Journal />
          </Card>
          <Card
            variant="outline"
            className="row-span-2 grid grid-rows-subgrid overflow-hidden p-6"
          >
            <div className="space-y-2">
              <h3 className="font-medium">{cards.compose.title}</h3>
              <p className="text-sm text-muted-foreground">
                {cards.compose.body}
              </p>
            </div>
            <div className="h-44">
              <SquaredRectangle />
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  )
}
