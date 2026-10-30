import type { ReactNode } from 'react'
import {
  architecture,
  cli,
  closing,
  faq,
  footer,
  hero,
  nav,
  propositions,
  thesis,
  ticker,
} from '../content'
import type { FigureName } from '../content'
import { Euclid } from './figures/Euclid'
import { Figure, ink, order } from './figures/Figure'
import {
  Commutes,
  FixedPoint,
  Konigsberg,
  Petersen,
  SquaredRectangle,
} from './figures/Propositions'
import { WaitlistForm } from './WaitlistForm'

const roman = ['i', 'ii', 'iii', 'iv', 'v']

function Mono({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`font-mono text-[11px] tracking-[0.08em] uppercase ${className}`}
    >
      {children}
    </span>
  )
}

// Registration marks at a frame's four corners.
function Marks() {
  const mark =
    'pointer-events-none absolute font-mono text-[13px] leading-none text-ink-faint'
  return (
    <>
      <span aria-hidden className={`${mark} top-2 left-2.5`}>
        +
      </span>
      <span aria-hidden className={`${mark} top-2 right-2.5`}>
        +
      </span>
      <span aria-hidden className={`${mark} bottom-2 left-2.5`}>
        +
      </span>
      <span aria-hidden className={`${mark} right-2.5 bottom-2`}>
        +
      </span>
    </>
  )
}

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden className="h-[18px] w-[15px] bg-human" />
      <span className="font-serif text-[21px] leading-none tracking-[-0.01em]">
        Theorem
      </span>
    </span>
  )
}

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="flex h-14 items-stretch">
        <a
          href="#top"
          className="flex items-center px-5 md:border-r md:border-line"
          aria-label="Theorem home"
        >
          <Logo />
        </a>
        <nav aria-label="Sections" className="ml-auto hidden md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="relative flex w-[140px] border-l border-line px-3 pt-2 text-ink-muted transition-colors hover:bg-well hover:text-ink lg:w-[160px]"
            >
              <Mono>{item.label}</Mono>
              <span
                aria-hidden
                className="absolute right-2 bottom-1 text-[10px] text-ink-faint"
              >
                ↘
              </span>
            </a>
          ))}
        </nav>
        <a
          href="#join"
          className="relative ml-auto flex w-[150px] border-l border-line px-3 pt-2 text-human transition-colors hover:bg-human hover:text-paper md:ml-0 lg:w-[180px]"
        >
          <Mono>Join waitlist</Mono>
          <span
            aria-hidden
            className="absolute right-2.5 bottom-1.5 text-[13px]"
          >
            →
          </span>
        </a>
      </div>
    </header>
  )
}

function Ticker() {
  const run = (hidden: boolean) => (
    <ul aria-hidden={hidden} className="flex shrink-0 items-center">
      {ticker.map((item) => (
        <li key={item} className="flex items-center gap-5 pr-5">
          <span aria-hidden className="text-human">
            ∴
          </span>
          <Mono className="whitespace-nowrap text-ink-muted">{item}</Mono>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="overflow-hidden border-t border-line py-2.5">
      <div className="flex w-max animate-ticker">
        {run(false)}
        {run(true)}
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section id="top" className="scroll-mt-14 border-b border-line">
      <div className="grid-field relative h-[clamp(420px,64vh,720px)] overflow-hidden">
        <Marks />
        <Mono className="absolute top-3 left-8 text-ink-faint">[0, 0]</Mono>
        <Mono className="absolute top-3 right-8 hidden text-ink-faint sm:block">
          Fig. 1
        </Mono>
        <Mono className="absolute top-1/2 left-3 hidden -translate-y-1/2 rotate-180 text-ink-faint [writing-mode:vertical-rl] lg:block">
          Proposition 0 · the harness
        </Mono>
        <Mono className="absolute right-8 bottom-3 hidden text-ink-faint sm:block">
          x: 444 · y: 328{' '}
          <span className="ml-1 inline-block size-1.5 bg-human align-middle" />
        </Mono>
        <div className="absolute inset-x-4 inset-y-8 flex justify-center">
          <Euclid className="aspect-[920/960] h-full max-w-full" />
        </div>
      </div>

      <div className="grid border-t border-line lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="px-5 py-8 md:px-8 lg:py-12">
          <Mono className="text-ink-faint">{hero.eyebrow}</Mono>
          <h1 className="mt-4 font-serif text-[clamp(52px,8vw,120px)] leading-[0.9] tracking-[-0.025em]">
            {hero.title[0]}
            <br />
            <em className="text-human">{hero.title[1]}</em>
          </h1>
        </div>
        <div
          id="join"
          className="flex scroll-mt-20 flex-col justify-between gap-8 border-t border-line px-5 py-8 md:px-8 lg:border-t-0 lg:border-l lg:py-12"
        >
          <p className="max-w-md text-[17px] leading-relaxed text-ink-muted">
            {hero.body}
          </p>
          <div>
            <Mono className="mb-3 block text-ink">{hero.cta}</Mono>
            <WaitlistForm source="hero" />
          </div>
        </div>
      </div>
      <Ticker />
    </section>
  )
}

function MarginNote({
  label,
  text,
  side,
}: {
  label: string
  text: string
  side: 'left' | 'right'
}) {
  return (
    <aside
      className={`relative flex min-h-[120px] items-center border-line px-5 ${
        side === 'left'
          ? 'border-b md:border-r md:border-b-0'
          : 'border-t md:border-t-0 md:border-l'
      }`}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-1/2 border-t border-dashed border-line-strong"
      />
      <p
        className={`relative w-full ${side === 'right' ? 'md:text-right' : ''}`}
      >
        <span className="bg-paper pr-2 font-mono text-[11px] tracking-[0.08em] text-human uppercase md:px-2">
          {label}.
        </span>
        <span className="mt-2 block font-mono text-[11px] leading-relaxed tracking-[0.06em] text-ink-muted uppercase">
          <span className="bg-paper md:px-2">{text}</span>
        </span>
      </p>
    </aside>
  )
}

export function Thesis() {
  return (
    <section
      id="thesis"
      className="grid scroll-mt-14 border-b border-line md:grid-cols-[1fr_2.2fr_1fr]"
    >
      <MarginNote side="left" {...thesis.given} />
      <div className="px-6 py-16 text-center md:py-24">
        <h2 className="mx-auto max-w-2xl font-serif text-[clamp(30px,3.6vw,52px)] leading-[1.06] tracking-[-0.015em]">
          {thesis.title}
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-ink-muted">
          {thesis.body}
        </p>
      </div>
      <MarginNote side="right" {...thesis.prove} />
    </section>
  )
}

const figures: Record<FigureName, () => ReactNode> = {
  petersen: Petersen,
  konigsberg: Konigsberg,
  commutes: Commutes,
  'fixed-point': FixedPoint,
  squared: SquaredRectangle,
}

export function Propositions() {
  return (
    <section id="propositions" className="scroll-mt-14">
      <div className="flex items-center justify-between border-b border-line px-5 py-3 md:px-8">
        <Mono className="text-ink">§ Propositions</Mono>
        <Mono className="text-ink-faint">
          {String(propositions.length).padStart(2, '0')} statements
        </Mono>
      </div>
      {propositions.map((p, i) => {
        const Drawing = figures[p.figure]
        const flip = i % 2 === 1
        return (
          <article
            key={p.title}
            className="grid border-b border-line md:grid-cols-2"
          >
            <div
              className={`grid-field relative flex items-center justify-center border-line p-8 md:min-h-[560px] md:p-12 ${
                flip ? 'md:order-2 md:border-l' : 'md:border-r'
              }`}
            >
              <Marks />
              <Mono className="absolute top-3 left-8 text-ink-faint">
                Fig. {i + 2}
              </Mono>
              <div className="aspect-[520/500] w-full max-w-[520px]">
                <Drawing />
              </div>
            </div>
            <div className="flex flex-col justify-between px-5 py-10 md:px-10 md:py-12">
              <div>
                <Mono className="text-human">Proposition {i + 1}</Mono>
                <h3 className="mt-4 max-w-md font-serif text-[clamp(30px,3vw,44px)] leading-[1.05] tracking-[-0.015em]">
                  {p.title}
                </h3>
                <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-ink-muted">
                  {p.body}
                </p>
              </div>
              <div className="mt-10">
                <p className="border-b border-line pb-2 font-serif text-[17px] italic">
                  Proof.
                </p>
                <ul>
                  {p.proof.map((line, k) => (
                    <li
                      key={line}
                      className="flex items-center justify-between gap-6 border-b border-dashed border-line-strong py-3"
                    >
                      <Mono className="text-ink-muted normal-case tracking-[0.02em] text-[12.5px]">
                        {line}
                      </Mono>
                      <span className="w-6 shrink-0 text-right font-serif text-[14px] text-ink-faint italic">
                        {k === p.proof.length - 1 ? (
                          <span className="text-human not-italic">∎</span>
                        ) : (
                          roman[k]
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}

// Five planes stacked in isometric projection; the graph is the ground.
function Layers() {
  const plane = (y: number) =>
    `M260,${y} L470,${y + 70} L260,${y + 140} L50,${y + 70} Z`
  const ys = [40, 110, 180, 250, 320]
  return (
    <Figure
      label="Five layers stacked one above another, with the graph store at the base."
      className="aspect-[520/500] w-full max-w-[420px]"
    >
      <svg viewBox="0 0 520 500" className="h-full w-full overflow-visible">
        {ys.map((y, k) => (
          <path
            key={y}
            d={plane(y)}
            {...ink}
            fill={
              k === ys.length - 1 ? 'var(--color-human)' : 'var(--color-paper)'
            }
            fillOpacity={k === ys.length - 1 ? 1 : 0.85}
            style={order(ys.length - k)}
          />
        ))}
        {[50, 260, 470].map((x) => (
          <line
            key={x}
            x1={x}
            y1={x === 260 ? 180 : 110}
            x2={x}
            y2={x === 260 ? 460 : 390}
            stroke="var(--color-ink-faint)"
            strokeDasharray="3 5"
            className="reveal"
            style={order(7)}
          />
        ))}
      </svg>
    </Figure>
  )
}

export function Architecture() {
  const layers = [...architecture.layers].reverse()
  return (
    <section
      id="architecture"
      className="grid scroll-mt-14 border-b border-line lg:grid-cols-[1fr_1.35fr]"
    >
      <div className="flex flex-col justify-between gap-10 border-line px-5 py-10 md:px-10 md:py-12 lg:border-r">
        <div>
          <Mono className="text-human">{architecture.label}</Mono>
          <h2 className="mt-4 font-serif text-[clamp(34px,3.6vw,52px)] leading-[1.04] tracking-[-0.015em]">
            {architecture.title}
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-muted">
            {architecture.body}
          </p>
        </div>
        <Layers />
      </div>
      <ol className="flex flex-col border-t border-line lg:border-t-0">
        {layers.map((layer, k) => {
          const level = layers.length - 1 - k
          return (
            <li
              key={layer.name}
              className="grid flex-1 grid-cols-[64px_1fr_56px] border-b border-line last:border-b-0"
            >
              <span className="flex items-center justify-center border-r border-line">
                <Mono className="text-ink-faint">L{level}</Mono>
              </span>
              <div className="px-5 py-6">
                <p className="font-serif text-[24px] leading-tight">
                  {layer.name}
                </p>
                <p className="mt-1.5 font-mono text-[12px] leading-relaxed tracking-[0.02em] text-ink-muted">
                  {layer.role}
                </p>
              </div>
              <span className="flex items-center justify-center border-l border-line">
                <span
                  aria-hidden
                  className={`size-3 border ${level === 0 ? 'border-human bg-human' : 'border-line-strong'}`}
                />
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export function Cli() {
  return (
    <section className="grid grid-cols-1 border-b border-line lg:grid-cols-2">
      <div className="px-5 py-10 md:px-10 md:py-12 lg:border-r lg:border-line">
        <Mono className="text-human">{cli.label}</Mono>
        <h2 className="mt-4 font-serif text-[clamp(34px,3.6vw,52px)] leading-[1.04] tracking-[-0.015em]">
          {cli.title}
        </h2>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-muted">
          {cli.body}
        </p>
      </div>
      <div className="flex items-center bg-ink px-5 py-10 md:px-10">
        <div className="w-full border border-paper/15">
          <div className="flex items-center justify-between border-b border-paper/15 px-4 py-2.5">
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2 rounded-full border border-paper/30" />
              <span className="size-2 rounded-full border border-paper/30" />
              <span className="size-2 rounded-full border border-paper/30" />
            </span>
            <Mono className="text-paper/45">~/work — theorem</Mono>
          </div>
          <pre className="overflow-x-auto px-4 py-5 font-mono text-[13px] leading-[2] text-paper">
            {cli.lines.map((line) => (
              <div
                key={line.text}
                className={line.prompt ? '' : 'text-paper/40'}
              >
                {line.prompt && (
                  <span className="mr-3 text-agent-soft/70 select-none">$</span>
                )}
                {line.text}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </section>
  )
}

export function Faq() {
  return (
    <section
      id="faq"
      className="grid scroll-mt-14 border-b border-line lg:grid-cols-[1fr_2fr]"
    >
      <div className="px-5 py-10 md:px-10 md:py-12 lg:border-r lg:border-line">
        <Mono className="text-human">FAQ</Mono>
        <h2 className="mt-4 font-serif text-[clamp(34px,3.6vw,52px)] leading-[1.04] tracking-[-0.015em]">
          Lemmas, briefly.
        </h2>
      </div>
      <div className="border-t border-line lg:border-t-0">
        {faq.map((item) => (
          <details
            key={item.q}
            className="group border-b border-line last:border-b-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-5 py-6 md:px-8 [&::-webkit-details-marker]:hidden">
              <span className="font-serif text-[21px] leading-snug">
                {item.q}
              </span>
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center border border-line-strong font-mono text-[14px] text-ink-muted transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="max-w-2xl px-5 pb-7 text-[16px] leading-relaxed text-ink-muted md:px-8">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  )
}

export function Closing() {
  return (
    <section className="relative overflow-hidden bg-human text-paper">
      <div
        aria-hidden
        className="grain absolute inset-0 opacity-50 mix-blend-multiply"
      />
      <div
        aria-hidden
        className="absolute inset-0 [background-image:radial-gradient(ellipse_at_50%_120%,rgba(246,245,244,0.28),transparent_60%)]"
      />
      <div className="relative mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center md:py-32">
        <span aria-hidden className="mb-8 h-7 w-6 bg-paper" />
        <h2 className="font-serif text-[clamp(72px,11vw,160px)] leading-[0.9] tracking-[-0.03em] italic">
          {closing.title}
        </h2>
        <p className="mt-6 text-[19px] text-paper/90">{closing.body}</p>
        <div className="mt-10 w-full max-w-md text-left">
          <WaitlistForm source="closing" tone="clay" />
        </div>
        <Mono className="mt-4 text-paper/70">{closing.note}</Mono>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer>
      <div className="grid gap-10 px-5 py-12 md:grid-cols-[2fr_1fr_1fr] md:px-10">
        <div>
          <Logo />
          <p className="mt-4 font-serif text-[17px] text-ink-muted italic">
            {footer.tagline}
          </p>
        </div>
        {footer.columns.map((col) => (
          <div key={col.title}>
            <Mono className="text-ink-faint">{col.title}</Mono>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-[15px] text-ink-muted transition-colors hover:text-human"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div aria-hidden className="overflow-hidden border-t border-line">
        <p className="translate-y-[14%] text-center font-serif text-[24vw] leading-[0.8] tracking-[-0.04em] text-transparent select-none [-webkit-text-stroke:1px_var(--color-line-strong)] min-[1440px]:text-[340px]">
          Theorem
        </p>
      </div>
      <div className="flex justify-between border-t border-line px-5 py-4 md:px-10">
        <Mono className="text-ink-faint">© 2026 Theorem</Mono>
        <Mono className="text-ink-faint">join.theorem.rs</Mono>
      </div>
    </footer>
  )
}
