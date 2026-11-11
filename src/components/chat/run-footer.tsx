// SOURCING: coss ui Popover over Base UI Popover (the limits popover), ui/button, @assistant-ui/react (the message and thread a run's footer belongs to), lib/theorem/run-parts (the stop notice, limit rows and timing rows)
import { useAui, useAuiState } from '@assistant-ui/react'
import type { DataMessagePartComponent } from '@assistant-ui/react'
import { useState } from 'react'
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/coss/popover'
import { Button } from '@/components/ui/button'
import {
  firstRenderedAt,
  limitRows,
  readCompletion,
  spokenMs,
  stopNotice,
  timingRows,
} from '@/lib/theorem/run-parts'
import type { Limits, Timing } from '@/lib/theorem/run-parts'
import type { Generation } from '@/lib/theorem/generation'
import { useConversationGeneration } from '@/lib/theorem/use-generation'

const Facts = ({ rows }: { rows: { label: string; value: string; note?: string | undefined }[] }) => (
  <dl className="flex flex-col gap-2">
    {rows.map(({ label, value, note }) => (
      <div key={label} className="flex flex-col">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-muted">{label}</dt>
          <dd className="text-end tabular-nums">{value}</dd>
        </div>
        {note && <dd className="text-xs text-ink-faint">{note}</dd>}
      </div>
    ))}
  </dl>
)

/**
 * What a run was allowed and when its moments happened: the limits it ran
 * under, and, when Theorem measured them, the run's timing as offsets from the
 * moment it was accepted. Draws nothing for a run that reported no limits.
 */
export function LimitsPanel({
  limits,
  timing,
  firstRenderAtMs,
}: {
  limits: Limits | undefined
  timing?: Timing | undefined
  firstRenderAtMs?: number | undefined
}) {
  if (!limits) return null
  const rows = limitRows(limits)
  const moments = timing
    ? timingRows(timing, firstRenderAtMs).map(({ label, ms }) => ({ label, value: spokenMs(ms) }))
    : []
  if (!rows.length && !moments.length) return null
  return (
    <div data-slot="limits-panel" className="flex w-72 max-w-full flex-col gap-3 text-sm">
      {rows.length > 0 && <Facts rows={rows} />}
      {moments.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-separator pt-3">
          <h3 className="text-xs font-medium text-ink-muted">Timing</h3>
          <Facts rows={moments} />
        </section>
      )}
    </div>
  )
}

/** The limits panel behind a quiet "Limits" button; absent when the run reported none. */
export function LimitsPopover(props: {
  limits: Limits | undefined
  timing?: Timing | undefined
  firstRenderAtMs?: number | undefined
}) {
  if (!props.limits) return null
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="xs" className="text-ink-muted hover:text-ink" />}
      >
        Limits
      </PopoverTrigger>
      <PopoverPopup side="top" align="start">
        <LimitsPanel {...props} />
      </PopoverPopup>
    </Popover>
  )
}

/**
 * The line under a run that stopped at a limit rather than finishing or
 * failing, joined to the run's summary: why it stopped in plain words, a way
 * to carry on, and, when a setting of the person's was the limit, a way to
 * raise it for this conversation. A run that ended, was stopped or failed
 * shows nothing here; its summary line and error already say so.
 */
export const CompletionFooter: DataMessagePartComponent = ({ data }) => {
  const completion = readCompletion(data)
  const notice = completion && stopNotice(completion)
  const aui = useAui()
  const { override, change } = useConversationGeneration()
  const [raised, setRaised] = useState(false)
  const runId = useAuiState((s) => {
    const id = (s.message.metadata.custom as { theoremRunId?: unknown } | undefined)?.theoremRunId
    return typeof id === 'string' ? id : undefined
  })
  const actionable = useAuiState((s) => s.message.isLast && !s.thread.isRunning)
  if (!completion || !notice) return null

  const raise = (patch: Generation) => {
    change(
      patch.runBudget
        ? { runBudget: { ...override.runBudget, ...patch.runBudget } }
        : patch,
    )
    setRaised(true)
  }

  return (
    <div
      data-slot="run-footer"
      className="my-1 flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-sm text-ink-muted"
    >
      <p>{notice.text}</p>
      {actionable && (
        <span className="flex flex-wrap items-center gap-1.5">
          {notice.raise &&
            (raised ? (
              <span className="text-ink-faint">Raised for this conversation</span>
            ) : (
              <Button
                variant="outline"
                size="xs"
                onClick={() => raise(notice.raise!.patch)}
              >
                {notice.raise.label} for this conversation
              </Button>
            ))}
          <Button variant="outline" size="xs" onClick={() => aui.thread.append('Continue')}>
            Continue
          </Button>
        </span>
      )}
      <LimitsPopover
        limits={completion.limits}
        timing={completion.timing}
        firstRenderAtMs={firstRenderedAt(runId)}
      />
    </div>
  )
}
