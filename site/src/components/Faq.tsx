// Adapted from Tailark Veil faqs/one.tsx (MIT; see tailark/LICENCE.md).
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/tailark/accordion'
import { Card } from '@/components/tailark/card'
import { faq } from '@/content'
import { Reveal } from './Reveal'

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 py-24 @container">
      <div className="mx-auto max-w-2xl px-6">
        <Reveal className="text-center">
          <h2 className="font-serif text-[clamp(34px,4.4vw,48px)] leading-[1.05] font-medium tracking-[-0.015em] text-balance">
            {faq.title}
          </h2>
        </Reveal>
        <Reveal delay={1}>
          <Card variant="outline" className="mt-12 p-2">
            <Accordion>
              {faq.items.map((item) => (
                <AccordionItem
                  key={item.q}
                  value={item.q}
                  className="border-b-0 px-4 not-last:border-b"
                >
                  <AccordionTrigger className="cursor-pointer py-4 text-[15px] font-medium hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="pb-2 text-[15px] leading-relaxed text-muted-foreground">
                      {item.a}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </Reveal>
      </div>
    </section>
  )
}
