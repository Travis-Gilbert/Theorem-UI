// SOURCING: the existing waitlist form over worker/index.ts; lucide-react for the link mark. A writing surface and two links: nothing to adopt.
import { ArrowUpRight } from 'lucide-react'
import { WaitlistForm } from '@/components/waitlist-form'
import { join as copy } from '@/content'

export function Join() {
  return (
    <div className="flex h-full flex-col justify-between gap-8 p-5 md:p-10">
      <div>
        <h2
          data-heading="join"
          tabIndex={-1}
          className="text-3xl font-semibold tracking-[-0.02em] text-balance outline-none md:text-[2.5rem] md:leading-[1.1]"
        >
          {copy.heading}
        </h2>
        <p className="mt-2 text-pretty md:text-lg">{copy.invitation}</p>
        <p className="mt-2 text-muted-ink md:text-lg">{copy.body}</p>
        <WaitlistForm source="join" className="mt-5 md:mt-6" />
      </div>
      <div className="border-t border-rule pt-5">
        <h3 className="font-medium">{copy.technical.heading}</h3>
        <p className="mt-1 text-sm text-muted-ink">{copy.technical.body}</p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          {copy.technical.links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-brass-deep underline underline-offset-3"
              >
                {link.label}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
