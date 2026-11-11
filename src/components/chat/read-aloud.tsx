// SOURCING: @assistant-ui/react's ActionBarPrimitive.Speak and StopSpeaking (the message's own speech state decides which shows), as its Thread examples lay them out; lib/speech/adapter for how far a fetch of the voice has come. The words are this app's.
import { ActionBarPrimitive, AuiIf, useAuiState } from '@assistant-ui/react'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { useVoice } from '@/lib/speech/adapter'

/** What the stop button says while the voice is not yet heard: fetching it, with how far, or getting ready. */
function waitingWords(
  fetching: { loaded: number; total: number | undefined } | undefined,
) {
  if (!fetching) return 'Getting ready to read'
  if (!fetching.total) return 'Fetching the voice'
  return `Fetching the voice, ${Math.round((100 * fetching.loaded) / fetching.total)}%`
}

/**
 * Reads a reply aloud, and stops reading it. It is the person's to press:
 * nothing is read unasked. Where the thread has no voice it does not show;
 * where the voice fails, it says so beside the button.
 */
export function ReadAloud() {
  const can = useAuiState((s) => s.thread.capabilities.speech)
  const starting = useAuiState(
    (s) => s.message.speech?.status.type === 'starting',
  )
  const id = useAuiState((s) => s.message.id)
  const fetching = useVoice((voice) => voice.fetching)
  const failed = useVoice((voice) => voice.failed === id)
  if (!can) return null
  return (
    <>
      <AuiIf condition={(s) => s.message.speech == null}>
        <ActionBarPrimitive.Speak
          onClick={() => useVoice.setState({ asked: id })}
          render={<TooltipIconButton tooltip="Read aloud" />}
        >
          <Icon.ReadAloud />
        </ActionBarPrimitive.Speak>
      </AuiIf>
      <AuiIf condition={(s) => s.message.speech != null}>
        <ActionBarPrimitive.StopSpeaking
          render={
            <TooltipIconButton
              tooltip={starting ? waitingWords(fetching) : 'Stop reading'}
              aria-busy={starting || undefined}
              className={starting ? 'animate-pulse' : undefined}
            />
          }
        >
          <Icon.Stop />
        </ActionBarPrimitive.StopSpeaking>
      </AuiIf>
      {failed ? (
        <span
          role="alert"
          className="text-muted-foreground self-center px-1 text-xs"
        >
          This could not be read aloud.
        </span>
      ) : null}
    </>
  )
}
