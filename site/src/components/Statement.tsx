import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import type { MotionValue } from 'motion/react'
import { statement } from '@/content'

// Words fill in as the paragraph scrolls past, after Antimetal's statement.
function Word({
  progress,
  range,
  accent,
  children,
}: {
  progress: MotionValue<number>
  range: [number, number]
  accent: boolean
  children: string
}) {
  const opacity = useTransform(progress, range, [0.22, 1])
  return (
    <motion.span
      style={{ opacity }}
      className={
        accent
          ? 'bg-gradient-to-r from-primary to-gold bg-clip-text text-transparent italic'
          : undefined
      }
    >
      {children}
    </motion.span>
  )
}

export function Statement() {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.85', 'end 0.45'],
  })
  const words = statement.split(' ')

  return (
    <section className="py-28 md:py-40">
      <div className="mx-auto max-w-4xl px-6">
        <p className="mb-8 font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
          <span className="text-primary">00</span> — Thesis
        </p>
        <p
          ref={ref}
          className="font-serif text-[clamp(30px,4.4vw,54px)] leading-[1.15] font-medium tracking-[-0.015em] text-balance"
        >
          {words.map((raw, i) => {
            const accent = raw.startsWith('*')
            const text = raw.replace(/\*/g, '')
            const start = i / words.length
            return (
              <span key={i}>
                <Word
                  progress={scrollYProgress}
                  range={[start, start + 1 / words.length]}
                  accent={accent}
                >
                  {text}
                </Word>{' '}
              </span>
            )
          })}
        </p>
      </div>
    </section>
  )
}
