// The real composer in an actual form; only the receiving runtime is in memory.
// Native key and button behavior is the browser's, with no mocked editor parts.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { AppendMessage, ThreadMessageLike } from '@assistant-ui/react'
import { ComposerEditor } from '@/components/chat/composer-editor'

const samples = {
  Plain: 'First paragraph',
  Code: '```ts\nconst first = 1\n```',
  List: '- First item',
  Markdown: 'Select this text',
}

function Composer({ sent, reset }: { sent: string[]; reset: () => void }) {
  const aui = useAui()
  const draft = useAuiState((s) => s.composer.text)
  const [submits, setSubmits] = useState(0)
  useEffect(() => aui.composer.setText(samples.Plain), [aui])
  return (
    <>
      <h1>Composer send contract</h1>
      <nav aria-label="Load fixture">
        {Object.entries(samples).map(([name, text]) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              reset()
              setSubmits(0)
              aui.composer.setText(text)
            }}
          >
            Load {name}
          </button>
        ))}
      </nav>
      <ComposerPrimitive.Root
        onSubmitCapture={() => setSubmits((count) => count + 1)}
      >
        <ComposerEditor label="Message input" />
        <ComposerPrimitive.Send aria-label="Send message">
          Send message
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
      <p>
        Messages accepted:{' '}
        <output data-testid="sent-count">{sent.length}</output>
        {' · '}Form submits:{' '}
        <output data-testid="submit-count">{submits}</output>
      </p>
      <h2>Draft Markdown</h2>
      <pre data-testid="draft">{draft}</pre>
      <h2>Accepted messages</h2>
      <pre data-testid="sent">{JSON.stringify(sent)}</pre>
    </>
  )
}

function Harness() {
  const [sent, setSent] = useState<string[]>([])
  const runtime = useExternalStoreRuntime({
    messages: [],
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: false,
    onNew: async (message: AppendMessage) => {
      const text = message.content
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('\n')
      setSent((current) => [...current, text])
    },
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Composer sent={sent} reset={() => setSent([])} />
    </AssistantRuntimeProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
