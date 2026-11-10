// SOURCING: lib/theorem/run-parts (what a text part says about itself) over the installed MarkdownText element and @assistant-ui/react (the run the segment belongs to)
import { useAuiState } from '@assistant-ui/react'
import { useEffect } from 'react'
import { MarkdownText } from '@/components/assistant-ui/elements/markdown-text'
import { noteFirstRender, textMeta } from '@/lib/theorem/run-parts'
import { cn } from '@/lib/utils'

/**
 * One stretch of the run's prose. Commentary is the agent talking on the way
 * to its answer: slightly quieter, and as readable as the answer. A segment
 * from before purposes, or one that is the answer, is drawn as prose always
 * was. The wrapper is one element for the segment's whole life, so a segment
 * that settles as commentary changes its ink and nothing else. A segment cut
 * off before it finished says so.
 */
export function ProseSegment({ part }: { part: { text: string; providerMetadata?: unknown } }) {
  const { purpose, status } = textMeta(part)
  const runId = useAuiState((s) => {
    const id = (s.message.metadata.custom as { theoremRunId?: unknown } | undefined)?.theoremRunId
    return typeof id === 'string' ? id : undefined
  })
  const live = useAuiState((s) => s.message.status?.type === 'running')
  const shown = part.text.length > 0
  // The run's first words reaching this screen, for its timing; history opened later is not a first render.
  useEffect(() => {
    if (shown && live && runId) noteFirstRender(runId)
  }, [shown, live, runId])
  return (
    <div
      data-slot="prose-segment"
      data-purpose={purpose}
      className={cn(
        'transition-colors duration-(--duration-snap) ease-snap motion-reduce:transition-none',
        purpose === 'commentary' && 'text-ink-muted',
      )}
    >
      <MarkdownText />
      {status === 'incomplete' && (
        <p className="text-sm text-ink-faint">Cut off</p>
      )}
    </div>
  )
}
