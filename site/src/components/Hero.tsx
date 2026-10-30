import { hero } from '@/content'
import { GraphWindow } from './GraphWindow'
import { WaitlistForm } from './WaitlistForm'

const rise = (d: number) => ({ ['--d' as string]: d })

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* A warm haze drifting behind the window, after Antimetal. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[38%] h-[900px] [mask-image:radial-gradient(60%_55%_at_50%_45%,#000_40%,transparent)]"
      >
        <div className="absolute inset-0 animate-haze [background:radial-gradient(40%_35%_at_35%_50%,rgb(232_137_86/0.55),transparent_70%),radial-gradient(35%_30%_at_68%_45%,rgb(214_170_92/0.45),transparent_70%),radial-gradient(45%_40%_at_50%_70%,rgb(200_97_43/0.35),transparent_70%)] blur-2xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pt-36 pb-20 md:pt-44">
        <div className="mx-auto max-w-3xl text-center">
          <p
            className="rise mx-auto flex w-fit items-center gap-2 rounded-full bg-card/70 px-3.5 py-1.5 text-[13px] text-muted-foreground shadow-sm ring-1 ring-foreground/8 backdrop-blur"
            style={rise(0)}
          >
            <span className="size-1.5 rounded-full bg-primary" />
            {hero.badge}
          </p>
          <h1
            className="rise mt-7 font-serif text-[clamp(52px,9vw,112px)] leading-[0.95] font-medium tracking-[-0.025em] text-balance"
            style={rise(1)}
          >
            {hero.title[0]}
            <br />
            <em className="text-primary">{hero.title[1]}</em>
          </h1>
          <p
            className="rise mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-balance text-muted-foreground"
            style={rise(2)}
          >
            {hero.body}
          </p>
          <div
            id="join"
            className="rise mx-auto mt-9 max-w-md scroll-mt-32"
            style={rise(3)}
          >
            <WaitlistForm source="hero" />
          </div>
        </div>

        <div className="rise relative mx-auto mt-14 max-w-5xl" style={rise(5)}>
          <GraphWindow />
        </div>
      </div>
    </section>
  )
}
