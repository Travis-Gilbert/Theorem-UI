// SOURCING: coss ui Tabs (Base UI's Tabs: roving focus, arrow keys, panel association), vendored in components/ui/tabs.tsx; coss Button for the one action.
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'
import { possibilities as copy } from '@/content'
import { useExperience } from '@/experience/experience'

/** One surface: three things a person might bring, one shown at a time. */
export function Possibilities({ canTry }: { canTry: boolean }) {
  const exp = useExperience()
  return (
    <div className="flex h-full flex-col gap-5 p-5 md:gap-7 md:p-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2
          data-heading="possibilities"
          tabIndex={-1}
          className="text-3xl font-semibold tracking-[-0.02em] text-balance outline-none md:text-[2.75rem] md:leading-[1.08]"
        >
          {copy.heading}
        </h2>
        <p className="text-sm text-muted-ink">{copy.note}</p>
      </div>
      <Tabs defaultValue={copy.examples[0].id} className="min-h-0 flex-1 gap-5 md:gap-7">
        <TabsList
          activateOnFocus
          className="w-full max-w-full flex-wrap justify-start md:w-fit"
        >
          {copy.examples.map((example) => (
            <TabsTab key={example.id} value={example.id} className="px-3 md:text-base">
              {example.label}
            </TabsTab>
          ))}
        </TabsList>
        {copy.examples.map((example) => (
          <TabsPanel
            key={example.id}
            value={example.id}
            className="grid gap-5 outline-none md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-8"
          >
            <div>
              <p className="text-xl font-medium tracking-[-0.01em] text-balance md:text-2xl">
                “{example.intention}”
              </p>
              <p className="mt-2 text-muted-ink md:text-lg">{example.context}</p>
              <h3 className="mt-5 text-sm font-medium text-brass-deep">
                {copy.stepsLabel}
              </h3>
              <ol className="mt-2 space-y-2">
                {example.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 md:text-lg">
                    <span
                      aria-hidden
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-slate text-xs font-semibold text-brass"
                    >
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
            <div className="on-slate flex flex-col justify-between gap-6 rounded-xl bg-slate p-5 text-paper shadow-lg md:p-7">
              <div>
                <h3 className="text-sm font-medium text-brass">
                  {copy.outcomeLabel}
                </h3>
                <p className="mt-2 text-xl font-medium tracking-[-0.01em] text-balance md:text-2xl">
                  {example.outcome}
                </p>
              </div>
              {canTry && (
                <Button
                  className="brass-action w-fit"
                  size="lg"
                  onClick={() => exp.carryDraft(example.draft)}
                >
                  {copy.tryThis}
                  <ArrowUpRight aria-hidden />
                </Button>
              )}
            </div>
          </TabsPanel>
        ))}
      </Tabs>
    </div>
  )
}
