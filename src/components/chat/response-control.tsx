// SOURCING: coss ui Popover over Base UI Popover, ui/tooltip over Base UI Tooltip, lib/theorem/use-generation (the conversation's override), components/chat/run-footer (the limits panel the last run reported)
import { COMPOSER_TOOLTIP_DELAY } from '@/components/chat/composer-tools'
import { CountControl, DetailControl } from '@/components/chat/generation-fields'
import { LimitsPanel } from '@/components/chat/run-footer'
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/coss/popover'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useGenerationDefaults } from '@/lib/theorem/generation'
import { firstRenderedAt } from '@/lib/theorem/run-parts'
import { useConversationGeneration, useLatestRunFacts } from '@/lib/theorem/use-generation'
import { cn } from '@/lib/utils'

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-ink-muted">{label}</span>
    {children}
  </div>
)

/**
 * The composer's control for how long and how deep this conversation's
 * replies may be, beside the effort picker. What it sets is the
 * conversation's own and goes out with every turn over the account's
 * defaults; it marks itself while any of it is set and resets it in one
 * press. Below the fields it shows what the newest run actually ran under.
 */
export function ResponseControl() {
  const { override, change, reset } = useConversationGeneration()
  const defaults = useGenerationDefaults((s) => s.defaults)
  const facts = useLatestRunFacts()
  const active = Object.keys(override).length > 0
  return (
    <Popover>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            delay={COMPOSER_TOOLTIP_DELAY}
            render={
              <PopoverTrigger
                aria-label="Response length and detail"
                data-active={active ? '' : undefined}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-ink-muted transition-colors duration-100 outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-hover data-popup-open:text-ink',
                  active && 'text-ink',
                )}
              />
            }
          >
            <span>Length</span>
            {active && <span aria-hidden className="size-1.5 rounded-full bg-redwood" />}
          </TooltipTrigger>
          <TooltipContent side="top">
            {active
              ? 'This conversation has its own response limits'
              : 'How long and how detailed a response may be'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverPopup side="top" align="end">
        <div data-slot="response-control" className="flex w-72 max-w-full flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">This conversation</h3>
            {active && (
              <Button variant="ghost" size="xs" onClick={reset}>
                Reset
              </Button>
            )}
          </div>
          <Field label="Response detail">
            <DetailControl
              value={override.responseDetail}
              onChange={(responseDetail) => change({ responseDetail })}
            />
          </Field>
          <Field label="Maximum output per call">
            <CountControl
              label="Maximum output per call"
              value={override.maxOutputTokens}
              placeholder={defaults.maxOutputTokens ? `${defaults.maxOutputTokens} (your default)` : "Model's maximum"}
              onChange={(maxOutputTokens) => change({ maxOutputTokens })}
            />
          </Field>
          <Field label="Run budget: output tokens">
            <CountControl
              label="Run budget output tokens"
              value={override.runBudget?.maxOutputTokens}
              placeholder={defaults.runBudget?.maxOutputTokens ? `${defaults.runBudget.maxOutputTokens} (your default)` : 'No cap'}
              onChange={(maxOutputTokens) =>
                change({ runBudget: { ...override.runBudget, maxOutputTokens } })
              }
            />
          </Field>
          <Field label="Run budget: steps">
            <CountControl
              label="Run budget steps"
              value={override.runBudget?.maxSteps}
              placeholder={defaults.runBudget?.maxSteps ? `${defaults.runBudget.maxSteps} (your default)` : 'No cap'}
              onChange={(maxSteps) =>
                change({ runBudget: { ...override.runBudget, maxSteps } })
              }
            />
          </Field>
          {facts?.limits && (
            <section className="flex flex-col gap-2 border-t border-separator pt-3">
              <h3 className="text-xs font-medium text-ink-muted">Last reply ran under</h3>
              <LimitsPanel
                limits={facts.limits}
                timing={facts.timing}
                firstRenderAtMs={firstRenderedAt(facts.runId)}
              />
            </section>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  )
}
