import { appearancePair } from '@/lib/appearance-policy'
import { useAui, useAuiEvent, useAuiState } from '@assistant-ui/react'
import { useComposerSend } from '@assistant-ui/core/react'
import type { FormEvent, KeyboardEvent } from 'react'
import { retryRunInput, stopRunInputs, submitRunInput, useRunInputs } from '@/lib/theorem/run-input-store'

/** assistant-ui disables ordinary sends during a run; native inbox input is separate. */
export function useRunInputSendDisabled() {
  const { disabled } = useComposerSend()
  const running = useAuiState((s) => s.thread.isRunning)
  const inputDisabled = useAuiState((s) => s.thread.isDisabled || !s.composer.canSend || !s.composer.text.trim())
  return running ? inputDisabled : disabled
}

/** Keep the existing form boundary, without starting or aborting a second run. */
export function useBusyComposerInput(options: {
  hasReferences: () => boolean
  onError: (message: string) => void
}) {
  const aui = useAui()
  useAuiEvent('composer.cancel', (event) => stopRunInputs(event.threadId))
  return {
    onSubmit(event: FormEvent<HTMLFormElement>) {
      if (!aui.thread().getState().isRunning) return false
      event.preventDefault()
      const composer = aui.composer.getState()
      if (!composer.canSend || !composer.text.trim()) return true
      if (composer.attachments.length || composer.quote || options.hasReferences()) {
        options.onError('This response can take text only. Your draft, attachments and references are kept for the next response.')
        return true
      }
      try {
        if (!submitRunInput(aui.threadListItem.getState().id, composer.text)) {
          options.onError('The conversation is reconnecting. Your message is still in the composer.')
          return true
        }
        aui.composer.setText('')
      } catch {
        options.onError('Could not save this message for recovery. Your draft is still in the composer.')
      }
      return true
    },
    onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
      // Runs after the input's slash-command and composition handlers. Preserve
      // their prevented events, IME commits, Shift+Enter and every other key.
      if (
        event.defaultPrevented || event.key !== 'Enter' || event.shiftKey ||
        event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 ||
        !(event.target instanceof HTMLTextAreaElement) ||
        !aui.thread().getState().isRunning
      ) return
      event.preventDefault()
      event.currentTarget.requestSubmit()
    },
  }
}

/** Accepted native receipts render in the transcript's existing UserInputPart. */
export function RunInputStatus() {
  const threadKey = useAuiState((s) => s.threadListItem.id)
  const items = useRunInputs((s) => s[threadKey])
  const pending = items?.filter((item) => !item.visible || item.state === 'failed' || item.state === 'next')
  if (!pending?.length) return null
  return (
    <div aria-live="polite" className="flex flex-col gap-2 px-2 text-sm">
      {pending.map((item) => (
        <div key={item.id} data-slot="pending-run-input" className="flex flex-col gap-1 py-1">
          <p data-appearance-recipe="prose" {...appearancePair('primary', 'composer')} className="whitespace-pre-wrap text-ink">{item.text}</p>
          <div data-appearance-recipe="metadata" {...appearancePair('secondary', 'composer')} className="flex items-center gap-2 text-ink-muted">
            <span>{item.error ?? (item.state === 'next' ? 'Queued for the next response' : item.state === 'queued' ? 'Queued for the next step' : 'Sending to this response…')}</span>
            {item.state === 'failed' && (
              <button type="button" className="underline underline-offset-2" onClick={() => retryRunInput(threadKey, item.id)}>
                Retry
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
