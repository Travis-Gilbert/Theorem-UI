// SOURCING: hand-rolled. Headings and paragraphs from content.ts on the site's tokens, with plain anchors; there is no component to adopt for reading text. The Field is the site's own, and lucide-react marks the outside links.
import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { howItWorks, nav, ourThinking } from '@/content'
import { Field } from '@/field'

/** One page of reading, outside the scene: the same paper and the same links, with no camera. */
function Reading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <title>{`${title} · Theorem`}</title>
      <Field className="fixed inset-0 -z-10" />
      <header className="site-nav">
        <a href="/#experience" aria-label={nav.home} className="wordmark text-xl md:text-2xl">
          {nav.wordmark}
        </a>
        <nav aria-label={nav.label} className="flex items-center">
          {nav.links.map((link) => (
            <a key={link.id} href={`/${link.href}`} className="nav-link">
              {link.label}
            </a>
          ))}
        </nav>
      </header>
      <main data-field-quiet className="reading">
        <p className="text-sm font-medium text-brass-deep">{title}</p>
        {children}
      </main>
    </>
  )
}

export function HowItWorks() {
  return (
    <Reading title={howItWorks.title}>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-balance md:text-[3.25rem] md:leading-[1.08]">
        {howItWorks.heading}
      </h1>
      {howItWorks.sections.map((section) => (
        <section key={section.heading} className="mt-12 border-t border-rule pt-6">
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-balance">{section.heading}</h2>
          <p className="mt-3 text-pretty md:text-lg">{section.body}</p>
        </section>
      ))}
    </Reading>
  )
}

export function OurThinking() {
  return (
    <Reading title={ourThinking.title}>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-balance md:text-[3.25rem] md:leading-[1.08]">
        {ourThinking.heading}
      </h1>
      <div className="mt-8 space-y-4 md:text-lg">
        {ourThinking.paragraphs.map((paragraph) => (
          <p key={paragraph} className="text-pretty">
            {paragraph}
          </p>
        ))}
      </div>
      <figure className="on-slate mt-10 rounded-xl bg-slate p-6 text-paper md:p-8">
        <blockquote className="text-2xl font-medium tracking-[-0.01em] text-balance md:text-3xl">
          “{ourThinking.quotation.text}”
        </blockquote>
        <figcaption className="mt-3 text-sm text-brass">{ourThinking.quotation.source}</figcaption>
      </figure>
      <section className="mt-10 border-t border-rule pt-6">
        <h2 className="font-medium">{ourThinking.sourcesLabel}</h2>
        <ul className="mt-3 space-y-2">
          {ourThinking.sources.map((source) => (
            <li key={source.href}>
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-baseline gap-1 text-sm font-medium text-brass-deep underline underline-offset-3"
              >
                {source.label}
                <ArrowUpRight aria-hidden className="size-3.5 shrink-0 self-center" />
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-ink">{ourThinking.note}</p>
      </section>
    </Reading>
  )
}
