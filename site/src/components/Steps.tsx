import type { ReactNode } from 'react'
import { how } from '@/content'
import type { FigureName } from '@/content'
import {
  Commutes,
  FixedPoint,
  Konigsberg,
  Petersen,
} from './figures/Propositions'
import { Reveal } from './Reveal'

const figures: Record<FigureName, () => ReactNode> = {
  konigsberg: Konigsberg,
  petersen: Petersen,
  commutes: Commutes,
  'fixed-point': FixedPoint,
}

// The page turns to night for the four steps, after Antimetal: each step's
// text holds its place while its figure, framed in a copper bezel, is ruled in.
export function Steps() {
  return (
    <section
      id="how"
      className="night relative scroll-mt-16 bg-background text-foreground"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 -top-px h-48 bg-gradient-to-b from-[#faf7f2] to-transparent"
      />
      <div className="relative mx-auto max-w-6xl px-6 pt-48 pb-32">
        <Reveal className="max-w-2xl">
          <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
            <span className="text-primary">§</span> {how.label}
          </p>
          <h2 className="mt-5 font-serif text-[clamp(36px,5vw,64px)] leading-[1.02] font-medium tracking-[-0.02em] text-balance">
            {how.title}
          </h2>
        </Reveal>

        <div className="mt-24 space-y-28 md:space-y-40">
          {how.steps.map((step, i) => {
            const Drawing = figures[step.figure]
            return (
              <article
                key={step.label}
                className="grid items-start gap-10 md:grid-cols-[1fr_1.25fr] md:gap-16"
              >
                <div
                  className={`md:sticky md:top-32 ${i % 2 ? 'md:order-2' : ''}`}
                >
                  <Reveal>
                    <p className="flex items-center gap-3 font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
                      <span className="text-primary">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="h-px w-8 bg-border" />
                      {step.label}
                    </p>
                    <h3 className="mt-5 font-serif text-[clamp(28px,3vw,40px)] leading-[1.08] font-medium tracking-[-0.01em] text-balance">
                      {step.title}
                    </h3>
                    <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </Reveal>
                </div>
                <Reveal delay={1}>
                  <figure className="bezel rounded-[22px] p-[5px]">
                    <div className="relative overflow-hidden rounded-[18px] bg-card">
                      <div
                        aria-hidden
                        className="absolute inset-0 [background-image:radial-gradient(color-mix(in_oklab,var(--foreground)_10%,transparent)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(70%_60%_at_50%_45%,#000,transparent)]"
                      />
                      <div className="relative mx-auto aspect-[520/500] max-w-[480px] p-6 md:p-10">
                        <Drawing />
                      </div>
                    </div>
                    <figcaption className="px-4 pt-3 pb-2 font-mono text-[11px] text-muted-foreground">
                      Fig. {i + 1} · {step.caption}
                    </figcaption>
                  </figure>
                </Reveal>
              </article>
            )
          })}
        </div>
      </div>
      <div
        aria-hidden
        className="absolute inset-x-0 -bottom-px h-48 bg-gradient-to-t from-[#faf7f2] to-transparent"
      />
    </section>
  )
}
