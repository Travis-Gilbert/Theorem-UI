// SOURCING: @assistant-ui/react (the open conversation's id and its messages) with lib/theorem/generation and lib/theorem/run-parts
import { useAuiState } from '@assistant-ui/react'
import { useMemo } from 'react'
import { DRAFT, useGenerationOverrides } from './generation'
import type { Generation, GenerationChange } from './generation'
import { latestRunFacts } from './run-parts'

const NONE: Generation = {}

/**
 * The open conversation's response override and the means to change it. A
 * conversation that is not a thread yet keeps its override under `DRAFT`
 * until its first send. Every reader and writer of an override goes through
 * here, so keeping overrides on the server instead is a change to this hook
 * and to `generation.ts`.
 */
export function useConversationGeneration() {
  const thread = useAuiState((s) => s.threadListItem.remoteId) ?? DRAFT
  const override = useGenerationOverrides((s) => s.byThread[thread]) ?? NONE
  return useMemo(
    () => ({
      override,
      change: (change: GenerationChange) => useGenerationOverrides.getState().change(thread, change),
      reset: () => useGenerationOverrides.getState().reset(thread),
    }),
    [thread, override],
  )
}

/** What the conversation's newest run published about its limits and timing. */
export function useLatestRunFacts() {
  const messages = useAuiState((s) => s.thread.messages)
  return useMemo(() => latestRunFacts(messages), [messages])
}
