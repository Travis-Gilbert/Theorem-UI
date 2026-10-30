import { closing } from '@/content'
import { Euclid } from './figures/Euclid'
import { Reveal } from './Reveal'
import { WaitlistForm } from './WaitlistForm'

// An ember colour field with grain and a squiggle rule, after Arc's closing
// band, with Euclid I.47 ruled faintly behind it.
const squiggle = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='12'%3E%3Cpath d='M0 6 Q5 0 10 6 T20 6' fill='none' stroke='white' stroke-width='1.2'/%3E%3C/svg%3E") repeat-x center`

function Squiggle() {
  return (
    <span
      aria-hidden
      className="h-3 flex-1 opacity-50"
      style={{ background: squiggle }}
    />
  )
}

export function Closing() {
  return (
    <section className="px-3 pb-3 md:px-6 md:pb-6">
      <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(160deg,#d8743c,#b9521f_55%,#8f3c17)] text-white">
        <div
          aria-hidden
          className="grain absolute inset-0 opacity-40 mix-blend-overlay"
        />
        <div
          aria-hidden
          className="absolute inset-0 [background:radial-gradient(60%_50%_at_50%_110%,rgb(255_214_170/0.45),transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -bottom-24 hidden aspect-[920/960] h-[115%] opacity-25 lg:block"
          style={{
            ['--color-ink' as string]: '#fff3e6',
            ['--color-ink-muted' as string]: '#ffe2c8',
            ['--color-ink-faint' as string]: '#ffd9bb',
            ['--color-paper' as string]: 'transparent',
            ['--color-human' as string]: 'rgb(255 243 230 / 0.35)',
            ['--color-agent' as string]: '#ffe2c8',
          }}
        >
          <Euclid className="h-full w-full" />
        </div>

        <div className="relative mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center md:py-32">
          <Reveal>
            <h2 className="font-serif text-[clamp(76px,12vw,168px)] leading-[0.9] font-medium tracking-[-0.03em] italic">
              {closing.title}
            </h2>
            <p className="mt-8 text-[19px] text-white/90">{closing.body}</p>
          </Reveal>
          <Reveal delay={1} className="mt-10 w-full max-w-md">
            <WaitlistForm source="closing" tone="ember" />
          </Reveal>
          <div className="mt-8 flex w-full max-w-md items-center gap-4">
            <Squiggle />
            <span className="font-mono text-[11px] tracking-[0.14em] whitespace-nowrap text-white/75 uppercase">
              {closing.note}
            </span>
            <Squiggle />
          </div>
        </div>
      </div>
    </section>
  )
}
