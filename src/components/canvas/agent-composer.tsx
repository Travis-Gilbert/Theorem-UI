// SOURCING: Base UI Popover (virtual anchor at the pointer), ui/button and ui/textarea, NoteExcerpt over react-markdown for the streamed answer
//
// The right-click panel carried over from Theorem Web: context chips, the
// standard actions or a free-form prompt, the answer streaming in, and the
// result placed on the canvas as a note beside its sources.
import { Popover } from '@base-ui/react/popover'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { NoteExcerpt } from '@/components/notes/note-excerpt'
import { useNoteView } from '@/components/notes/note-view'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { askOnCanvas, CANVAS_ACTIONS } from '@/lib/theorem/canvas-agent'
import type { CanvasSource } from '@/lib/theorem/canvas-agent'
import type { Theorem } from '@/lib/theorem/client'
import { describeError } from '@/lib/theorem/client'
import { createNote, primeNote } from '@/lib/theorem/notes'
import {
  editSpace,
  spaceIdFor,
  spaceKey,
  upsertConnection,
  upsertPlacement,
  userAuthorship,
} from '@/lib/theorem/spaces'
import type { SpaceEdit } from '@/lib/theorem/spaces'
import { useComposer } from './composer-state'
import type { ComposerRequest } from './composer-state'

const RESULT_SIZE = { w: 380, h: 300 }
const RESULT_GAP = 80

type Run =
  | { phase: 'idle' }
  | { phase: 'running'; text: string; threadId?: string }
  | { phase: 'placed'; text: string; threadId: string; documentId: string }
  | { phase: 'failed'; text: string; threadId?: string; error: string }

/** Where the answer goes: right of the placed sources, else at the request point. */
function resultRect(
  space: Theorem.Space | undefined,
  request: ComposerRequest,
): Theorem.SpaceRect {
  const ids = new Set(request.sources.map((s) => s.placementId))
  const rects = (space?.placements ?? [])
    .filter((p) => ids.has(p.id))
    .map((p) => p.rect)
  if (!rects.length) {
    const at = request.at ?? { x: 0, y: 0 }
    return { ...at, ...RESULT_SIZE }
  }
  const right = Math.max(...rects.map((r) => r.x + r.w))
  const top = Math.min(...rects.map((r) => r.y))
  return { x: right + RESULT_GAP, y: top, ...RESULT_SIZE }
}

function resultMarkdown(
  answer: string,
  label: string,
  sources: readonly CanvasSource[],
  threadId: string,
) {
  const heading = /^#{1,6}\s/.test(answer.trimStart())
    ? ''
    : `# ${sources[0] ? `${label}: ${sources[0].title}` : label}\n\n`
  return `${heading}${answer.trim()}\n\n---\n\n[Open the conversation](/c/${threadId})\n`
}

function Chips({ sources }: { sources: readonly CanvasSource[] }) {
  const removeSource = useComposer((s) => s.removeSource)
  if (!sources.length)
    return <p className="text-xs text-ink-faint">No context. Ask anything.</p>
  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((source, index) => (
        <span
          key={`${source.documentId}:${source.selection?.start ?? 'all'}`}
          className="inline-flex max-w-full items-center gap-1 rounded-md bg-frame py-0.5 ps-1.5 pe-0.5 text-xs text-ink-muted"
        >
          <Icon.Article className="size-3 shrink-0" />
          <span className="min-w-0 truncate">
            {source.selection ? `"${source.selection.quote}"` : source.title}
          </span>
          <button
            type="button"
            aria-label={`Remove ${source.title}`}
            onClick={() => removeSource(index)}
            className="rounded p-0.5 hover:bg-hover hover:text-ink"
          >
            <Icon.Close className="size-3" />
          </button>
        </span>
      ))}
    </div>
  )
}

function ComposerBody({
  request,
  projectId,
}: {
  request: ComposerRequest
  projectId: string
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const close = useComposer((s) => s.close)
  const [prompt, setPrompt] = useState('')
  const [run, setRun] = useState<Run>({ phase: 'idle' })
  const abort = useRef<AbortController>(undefined)
  const spaceId = spaceIdFor(projectId)

  // Closing the composer stops a run that is still streaming.
  useEffect(() => () => abort.current?.abort(), [])

  const start = async (text: string, label: string) => {
    const controller = new AbortController()
    abort.current = controller
    const sources = request.sources
    setRun({ phase: 'running', text: '' })
    let threadId: string | undefined
    let answer = ''
    try {
      for await (const update of askOnCanvas({
        projectId,
        spaceId,
        prompt: text,
        sources,
        signal: controller.signal,
      })) {
        threadId = update.threadId
        answer = update.text
        if (update.failed) throw new Error('The Theorem run did not finish')
        setRun({ phase: 'running', text: answer, threadId })
      }
      if (controller.signal.aborted || !threadId) {
        setRun({ phase: 'idle' })
        return
      }
      const note = await createNote(
        resultMarkdown(answer, label, sources, threadId),
      )
      primeNote(queryClient, note)
      const record = queryClient.getQueryData<Theorem.SpaceRecord>(
        spaceKey(spaceId),
      )
      const placementId = `p:${crypto.randomUUID()}`
      const edits: SpaceEdit[] = [
        upsertPlacement({
          target: 'object',
          id: placementId,
          rect: resultRect(record?.space, request),
          authorship: userAuthorship,
          object: { kind: 'document', id: note.documentId },
        }),
        ...[...new Set(sources.map((s) => s.placementId))]
          .filter((id): id is string => !!id)
          .map((from) =>
            upsertConnection({
              id: `c:${crypto.randomUUID()}`,
              from,
              to: placementId,
              // The result sits right of its sources (resultRect).
              from_side: 'right',
              to_side: 'left',
              to_end: 'arrow',
            }),
          ),
      ]
      for (const edit of edits) editSpace(queryClient, spaceId, edit)
      setRun({
        phase: 'placed',
        text: answer,
        threadId,
        documentId: note.documentId,
      })
    } catch (error) {
      if (controller.signal.aborted) return setRun({ phase: 'idle' })
      setRun({
        phase: 'failed',
        text: answer,
        threadId,
        error: describeError(error),
      })
    }
  }

  const running = run.phase === 'running'
  const setBusy = useComposer((s) => s.setBusy)
  useEffect(() => setBusy(running), [running, setBusy])
  const submit = () => {
    const text = prompt.trim()
    if (text && !running) void start(text, 'Answer')
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Chips sources={request.sources} />
      {run.phase === 'idle' && (
        <>
          <div className="flex flex-wrap gap-1">
            {CANVAS_ACTIONS.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="xs"
                disabled={!request.sources.length}
                onClick={() => void start(action.prompt, action.label)}
              >
                {action.label}
              </Button>
            ))}
          </div>
          <div className="flex items-end gap-1.5">
            <Textarea
              autoFocus
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              placeholder="Ask Theorem about this"
              className="max-h-40 min-h-9 bg-background text-sm"
            />
            <Button
              size="icon-sm"
              aria-label="Ask"
              disabled={!prompt.trim()}
              onClick={submit}
            >
              <Icon.Send />
            </Button>
          </div>
        </>
      )}
      {run.phase !== 'idle' && (
        <div className="flex flex-col gap-2">
          <div className="max-h-64 overflow-y-auto rounded-lg bg-background p-2.5">
            {run.text ? (
              <NoteExcerpt markdown={run.text} />
            ) : (
              <p className="text-sm text-ink-faint shimmer">Thinking…</p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {running && (
              <Button
                variant="outline"
                size="xs"
                onClick={() => abort.current?.abort()}
              >
                <Icon.Stop />
                Stop
              </Button>
            )}
            {run.phase === 'placed' && (
              <>
                <span className="me-auto text-xs text-ink-muted">
                  Added to the canvas
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    useNoteView.getState().open(run.documentId)
                    close()
                  }}
                >
                  Open note
                </Button>
              </>
            )}
            {run.phase === 'failed' && (
              <span className="me-auto text-xs text-error-ink">
                {run.error}
              </span>
            )}
            {run.threadId && run.phase !== 'running' && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  close()
                  void navigate({
                    to: '/c/$threadId',
                    params: { threadId: run.threadId! },
                  })
                }}
              >
                Conversation
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Mounted once in the shell; opened by right-click on the canvas or a note. */
export function AgentComposer({ projectId }: { projectId: string }) {
  const request = useComposer((s) => s.request)
  const close = useComposer((s) => s.close)
  const anchor = request?.anchor
  return (
    <Popover.Root
      open={!!request}
      onOpenChange={(open) => {
        if (!open && !useComposer.getState().busy) close()
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={
            anchor && {
              getBoundingClientRect: () =>
                DOMRect.fromRect({
                  x: anchor.x,
                  y: anchor.y,
                  width: 0,
                  height: 0,
                }),
            }
          }
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50"
        >
          <Popover.Popup className="w-[min(420px,calc(100vw-24px))] rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0">
            <Popover.Title className="sr-only">Ask Theorem</Popover.Title>
            {request && (
              // A new request starts a fresh body, so its run state resets.
              <ComposerBody
                key={`${request.anchor.x},${request.anchor.y}`}
                request={request}
                projectId={projectId}
              />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
