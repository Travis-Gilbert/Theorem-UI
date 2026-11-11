// SOURCING: assistant-ui's composer/form state, Theorem's existing useLiveRuns
// registry, and the run-input journal. This intercepts a form submission only;
// editor keys and the Send button keep using that same form.
import { useAui, useAuiState } from '@assistant-ui/react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLiveRuns } from '@/lib/theorem/runtime'
import { runInputSender } from '@/lib/theorem/run-input'
import type { RunInputState } from '@/lib/theorem/run-input'
import { useComposerReferences } from './composer-references'

export type ComposerRunInput = {
  /** Also true for an unresolved old request, even after its run finishes. */
  active: boolean
  canSend: boolean
  pending: boolean
  /** True means the form must prevent its ordinary chat submission. */
  submit: () => boolean
  retry: () => void
  reset: () => void
  status?: string
  canRetry: boolean
  canReset: boolean
  uncertain: boolean
  recoveryText?: string
}

const serverSnapshot = () => undefined

function configuredContext(custom: Record<string, unknown> | undefined) {
  const options = custom?.theoremTurnOptions as
    { contextReferences?: unknown; uploadIds?: unknown } | undefined
  return [options?.contextReferences, options?.uploadIds].some(
    (value) => Array.isArray(value) && value.length > 0,
  )
}

export function useComposerRunInput(): ComposerRunInput {
  const aui = useAui()
  const threadId = useAuiState((s) => s.threadListItem.remoteId)
  const isRunning = useAuiState((s) => s.thread.isRunning)
  const text = useAuiState((s) => s.composer.text)
  const disabled = useAuiState(
    (s) =>
      s.thread.isDisabled ||
      !s.composer.canSend ||
      s.composer.submission !== undefined,
  )
  const attachmentCount = useAuiState((s) => s.composer.attachments.length)
  const hasQuote = useAuiState((s) => s.composer.quote != null)
  const hasConfiguredContext = useAuiState((s) =>
    configuredContext(s.composer.runConfig.custom),
  )
  const references = useComposerReferences((s) => s.references)
  const runId = useLiveRuns((s) => (threadId ? s[threadId] : undefined))
  const sender = runInputSender()
  const state = useSyncExternalStore(
    sender.subscribe,
    () => (threadId ? sender.getState(threadId) : undefined),
    serverSnapshot,
  )
  const unresolved =
    state?.kind === 'unresolved' || state?.kind === 'unavailable'
  const active = isRunning || !!runId || unresolved
  const pending = state?.kind === 'unresolved' && state.pending
  const unsupported =
    attachmentCount > 0 ||
    hasQuote ||
    hasConfiguredContext ||
    references.length > 0
  const closed = state?.kind === 'closed' && state.envelope.runId === runId
  const canSend =
    active &&
    !!threadId &&
    !!runId &&
    !!text.trim() &&
    !disabled &&
    !pending &&
    !unresolved &&
    !unsupported &&
    !closed

  // A reload retains the original envelope even if the editor draft was not
  // restored. Never overwrite anything the person has since started writing.
  const restored = useRef(new Set<string>())
  useEffect(() => {
    if (!threadId || state?.kind !== 'unresolved') return
    const { envelope } = state
    if (restored.current.has(envelope.key)) return
    if (aui.threadListItem.getState().remoteId !== threadId) return
    const empty = aui.composer.getState().text === ''
    if (state.pending && empty) return
    restored.current.add(envelope.key)
    if (empty) aui.composer.setText(envelope.text)
  }, [aui, state, threadId])

  const cleanups = useRef(new Set<() => void>())
  useEffect(() => {
    const pendingCleanups = cleanups.current
    return () => {
      for (const cleanup of pendingCleanups) cleanup()
      pendingCleanups.clear()
    }
  }, [])

  const settle = (request: () => Promise<RunInputState> | undefined) => {
    const captured = aui.composer.getState()
    const capturedThread = aui.threadListItem.getState().remoteId
    const capturedReferences = useComposerReferences.getState().references
    let unchanged = true
    // Observe edits while HTTP is pending, including leaving and returning to
    // the same thread. An old acknowledgement must never clear a newer draft.
    const off = aui.subscribe(() => {
      const current = aui.composer.getState()
      if (
        aui.threadListItem.getState().remoteId !== capturedThread ||
        current.text !== captured.text ||
        current.attachments !== captured.attachments ||
        current.quote !== captured.quote ||
        current.runConfig !== captured.runConfig
      )
        unchanged = false
    })
    const cleanup = () => {
      unchanged = false
      off()
    }
    cleanups.current.add(cleanup)
    const result = request()
    if (!result) {
      off()
      cleanups.current.delete(cleanup)
      return
    }
    void result.then((outcome) => {
      off()
      cleanups.current.delete(cleanup)
      if (
        outcome.kind === 'accepted' &&
        unchanged &&
        outcome.envelope.text === captured.text &&
        aui.threadListItem.getState().remoteId === capturedThread &&
        aui.composer.getState().text === captured.text &&
        useComposerReferences.getState().references === capturedReferences
      )
        aui.composer.setText('')
    })
  }

  return {
    active,
    canSend,
    pending,
    submit: () => {
      // Re-read the thread at the event boundary: a run can start or finish
      // between render and submission. A missing run id never means accepted.
      const id = aui.threadListItem.getState().remoteId
      const live = id ? useLiveRuns.getState()[id] : undefined
      const saved = id ? sender.getState(id) : undefined
      if (
        !aui.thread.getState().isRunning &&
        !live &&
        saved?.kind !== 'unresolved' &&
        saved?.kind !== 'unavailable'
      ) {
        if (id && aui.composer.getState().canSend) sender.clearNotice(id)
        return false
      }
      const draft = aui.composer.getState()
      if (
        !id ||
        !live ||
        draft.submission ||
        !draft.canSend ||
        aui.thread.getState().isDisabled ||
        !draft.text.trim() ||
        draft.attachments.length ||
        draft.quote ||
        configuredContext(draft.runConfig.custom) ||
        useComposerReferences.getState().references.length ||
        saved?.kind === 'unresolved' ||
        saved?.kind === 'unavailable' ||
        (saved?.kind === 'closed' && saved.envelope.runId === live)
      )
        return true
      settle(() => sender.send(id, live, draft.text))
      return true
    },
    retry: () => {
      const id = aui.threadListItem.getState().remoteId
      if (id) settle(() => sender.retry(id))
    },
    reset: () => {
      const id = aui.threadListItem.getState().remoteId
      if (id) sender.reset(id)
    },
    canRetry: state?.kind === 'unresolved' && !state.pending,
    canReset:
      state?.kind === 'unavailable' ||
      (state?.kind === 'unresolved' && !state.pending),
    uncertain:
      state?.kind === 'unresolved' ||
      ((state?.kind === 'unavailable' || state?.kind === 'released') &&
        state.uncertain),
    recoveryText:
      state?.kind === 'unresolved' || state?.kind === 'released'
        ? state.envelope?.text
        : undefined,
    status: unresolved
      ? state.message
      : active && unsupported
        ? 'Attachments, quotes, and context can be sent after this response finishes. Your draft is unchanged.'
        : active && !runId
          ? 'Waiting for this response to connect. Your draft has not been sent.'
          : state?.kind === 'released'
            ? state.message
            : (state?.kind === 'closed' || state?.kind === 'refused') &&
                (!runId || state.envelope.runId === runId)
              ? state.message
              : state?.kind === 'accepted' &&
                  (!text.trim() || text === state.envelope.text)
                ? state.message
                : active && text.trim()
                  ? 'Sends text to the current response. Model and tool settings apply to the next turn.'
                  : undefined,
  }
}

export function ComposerRunInputStatus({ input }: { input: ComposerRunInput }) {
  if (!input.status) return null
  return (
    <div
      className="px-2 pb-1 text-xs text-ink-muted"
      data-slot="composer-run-input-status"
    >
      <p role="status" aria-live="polite">
        {input.status}
      </p>
      {input.recoveryText && !input.pending && (
        <details className="mt-1">
          <summary className="cursor-pointer">Previous message</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans">
            {input.recoveryText}
          </pre>
        </details>
      )}
      {input.canReset && input.uncertain && (
        <p className="mt-1">
          Delivery may already have happened. Stopping recovery clears only the
          saved request; it does not undo delivery.
        </p>
      )}
      {input.canRetry && (
        <button
          type="button"
          onClick={input.retry}
          className="mt-1 underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
        >
          Retry previous message
        </button>
      )}
      {input.canReset && (
        <button
          type="button"
          onClick={input.reset}
          className="ms-3 mt-1 underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
        >
          {input.canRetry ? 'Stop retrying' : 'Reset saved delivery state'}
        </button>
      )}
    </div>
  )
}
