import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { createRoot } from 'react-dom/client'
import { SavedPassageSearch } from '@/components/chat/saved-passage-search'

function Fixture() {
  const runtime = useExternalStoreRuntime({
    // The live transcript need not carry any stored citation IDs: search
    // reads the canonical native history on submission.
    messages: [] as ThreadMessageLike[],
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
    adapters: {
      threadList: {
        threadId: 'q8-browser',
        threads: [
          { status: 'regular', id: 'q8-browser', remoteId: 'q8-browser' },
        ],
      },
    },
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SavedPassageSearch />
    </AssistantRuntimeProvider>
  )
}

const container = document.getElementById('app')
if (!container) throw new Error('Fixture root is missing')
createRoot(container).render(<Fixture />)
