import { useAuiState } from '@assistant-ui/react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { browserEncoder } from '@/lib/semantic-q8/browser-encoder'
import {
  retainedPassageIndex,
  savedPassageSearchError,
} from '@/lib/semantic-q8/retained-index'
import { searchSavedPassages } from '@/lib/semantic-q8/search'
import type { SearchProgress } from '@/lib/semantic-q8/search'
import {
  citationKey,
  threadCitations,
} from '@/lib/semantic-q8/thread-citations'
import type { SearchableCitation } from '@/lib/semantic-q8/thread-citations'
import { theorem } from '@/lib/theorem/client'
import { OpenPassage } from './citation-sources'

type SearchState =
  | { phase: 'idle' }
  | SearchProgress
  | { phase: 'done'; matches: SearchableCitation[] }
  | { phase: 'failed'; message: string }

const labels: Partial<Record<SearchState['phase'], string>> = {
  checking: 'Checking access to the saved passages…',
  starting: 'Loading the Q8 model on this device…',
  ranking: 'Searching saved passages…',
}

/** Only saved, versioned citations can be candidates. The index does not use
 * the excerpts in the rendered messages as input or as search results. */
export function SavedPassageSearch() {
  const threadId = useAuiState((s) => s.threadListItem.remoteId)
  return threadId ? <SearchPanel key={threadId} threadId={threadId} /> : null
}

function SearchPanel({ threadId }: { threadId: string }) {
  const inputId = useId()
  const descriptionId = useId()
  const [text, setText] = useState('')
  const [state, setState] = useState<SearchState>({ phase: 'idle' })
  const running = useRef<AbortController>(null)
  useEffect(() => () => running.current?.abort(), [])

  function cancel() {
    running.current?.abort()
    running.current = null
    setState({ phase: 'idle' })
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (running.current || !text.trim()) return
    const request = new AbortController()
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(300_000),
    ])
    running.current = request
    try {
      setState({ phase: 'checking' })
      // A just-completed turn may not have durable IDs in its live
      // assistant-ui projection. Read the native thread, not the transcript.
      const { messages } = await theorem().chat.threads.get(
        { threadId },
        { abortSignal: signal, maxRetries: 0 },
      )
      const citations = threadCitations(messages)
      const byId = new Map(
        citations.map((citation) => [citationKey(citation), citation]),
      )
      const matches = await searchSavedPassages({
        text,
        citations: citations.map(({ messageId, partId }) => ({
          messageId,
          partId,
        })),
        encoder: browserEncoder,
        index: retainedPassageIndex(threadId, signal),
        signal,
        progress: setState,
      })
      if (running.current === request)
        setState({
          phase: 'done',
          matches: matches.flatMap(
            (match) => byId.get(citationKey(match)) ?? [],
          ),
        })
    } catch (error) {
      if (running.current === request && !request.signal.aborted)
        setState({ phase: 'failed', message: savedPassageSearchError(error) })
    } finally {
      if (running.current === request) running.current = null
    }
  }

  const busy =
    state.phase === 'checking' ||
    state.phase === 'starting' ||
    state.phase === 'indexing' ||
    state.phase === 'ranking'
  const visibleMatches = state.phase === 'done' ? state.matches : []

  return (
    <details
      className="mb-3 self-start text-sm"
      data-slot="saved-passage-search"
      onToggle={(event) => {
        if (!event.currentTarget.open) cancel()
      }}
    >
      <summary className="cursor-pointer rounded-sm px-1.5 py-1 text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
        Search saved passages
      </summary>
      <div className="flex max-w-lg flex-col gap-2 px-1.5 py-2">
        <p id={descriptionId} className="text-xs text-ink-muted">
          Search recent sources in this conversation. The model runs on this
          device and stays ready in this tab after a roughly 560 MB download.
        </p>
        <form
          onSubmit={(event) => void start(event)}
          className="flex flex-wrap items-center gap-2"
        >
          <label htmlFor={inputId} className="sr-only">
            Search saved passages
          </label>
          <input
            id={inputId}
            type="search"
            aria-describedby={descriptionId}
            className="min-w-40 flex-1 rounded-md border border-line bg-sheet px-2 py-1 text-ink outline-none focus-visible:outline-2 focus-visible:outline-focus"
            value={text}
            maxLength={1024}
            onChange={(event) => {
              setText(event.target.value)
              cancel()
            }}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={busy || !text.trim()}
          >
            Search
          </Button>
          {busy && (
            <Button type="button" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          )}
        </form>
        <div role="status" className="text-xs text-ink-muted">
          {state.phase === 'indexing'
            ? `Indexing passages: ${state.done} of ${state.total}`
            : state.phase === 'done'
              ? visibleMatches.length
                ? `${visibleMatches.length} matching ${visibleMatches.length === 1 ? 'passage' : 'passages'}.`
                : 'No available passages matched this search.'
              : labels[state.phase]}
        </div>
        {state.phase === 'failed' && (
          <p role="alert" className="text-xs text-error-ink">
            {state.message}
          </p>
        )}
        {visibleMatches.length > 0 && (
          <ol className="space-y-2">
            {visibleMatches.map((citation) => (
              <li
                key={citationKey(citation)}
                className="border-t border-line pt-2"
              >
                <div className="text-sm text-ink">{citation.source.label}</div>
                <OpenPassage
                  source={citation.source}
                  passageNumber={0}
                  threadId={threadId}
                  messageId={citation.messageId}
                  partId={citation.partId}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  )
}
