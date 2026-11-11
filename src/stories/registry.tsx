// SOURCING: the real components, wrapped only in the providers the app itself gives them. Loaded lazily by the story route so none of this reaches production. Artifact stories hand a committed OpenUI program to the thread's own part renderers inside an assistant-ui external-store message; the activity and composer stories hand committed messages to the thread itself the same way, converted by the SDK's toAssistantMessages.
import { ReactFlow, ReactFlowProvider, applyNodeChanges } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useState } from 'react'
import type { ComponentType } from 'react'
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { ARTIFACT_PART, readArtifact } from '@/components/artifacts/artifact-model'
import { LIBRARY_ID, LIBRARY_VERSION } from '@/components/artifacts/openui/library'
import { Canvas } from '@/components/canvas/canvas'
import { FaceBench, FaceBook } from '@/components/face/face-bench'
import { NoteNodeView } from '@/components/program/program-annotations'
import { NoteEditor } from '@/components/notes/note-editor'
import { NoteExcerpt } from '@/components/notes/note-excerpt'
import { TheoremPartRenderers } from '@/components/chat/theorem-parts'
import { ComparePane } from '@/components/review/compare-pane'
import { ReviewCard } from '@/components/review/review-card'
import { LibrarianFooter } from '@/components/organize/librarian-footer'
import { ContextPanel } from '@/components/shell/sidebar'
import { ChatShell } from '@/components/shell/chat-shell'
import { LifeBackdrop } from '@/components/life/life-backdrop'
import { useNote } from '@/lib/theorem/notes'
import { useOrganization } from '@/lib/theorem/organization'
import type { NoteFlowNode } from '@/lib/program/flow'
import { TheoremRuntimeProvider } from '@/lib/theorem/runtime'
import { useReview } from '@/lib/theorem/reviews'
import {
  ACTIVITY_STATES,
  activityMessages,
  appCheckMessages,
  toolPillMessages,
} from './fixtures/activity'
import type { ActivityState } from './fixtures/activity'
import { ARTIFACT_STORIES } from './fixtures/artifacts'
import type { ArtifactStory } from './fixtures/artifacts'
import { documentFixtures } from './fixtures/notes'
import { PROGRAM_PART } from './fixtures/program'

import { ArtifactView } from '@/components/artifacts/artifact-renderers'
import { NOTEBOOK_DOCUMENTS, notebookPart } from './fixtures/notebook-parts'

function WithRuntime({ children }: { children: React.ReactNode }) {
  const [threadId, setThreadId] = useState<string | undefined>('thread-app-gallery')
  return (
    <TheoremRuntimeProvider
      projectId="project-theorem"
      threadId={threadId}
      onThreadIdChange={setThreadId}
    >
      {children}
    </TheoremRuntimeProvider>
  )
}

function OrganizedSidebarStory() {
  return (
    <WithRuntime>
      <div className="h-dvh w-[354px] bg-sidebar">
        <ContextPanel />
      </div>
    </WithRuntime>
  )
}

function LibrarianFooterStory() {
  const { data } = useOrganization()
  if (!data) return null
  return (
    <div className="w-[354px] bg-sidebar">
      <LibrarianFooter librarian={data.librarian} />
    </div>
  )
}

function ComparePaneStory() {
  return (
    <div className="h-dvh w-[423px]">
      <ComparePane
        reviewId="review-app-gallery"
        onClose={() => undefined}
        onDetach={() => undefined}
      />
    </div>
  )
}

function ReviewCardStory() {
  const { data } = useReview('review-app-gallery')
  if (!data) return null
  return (
    <div className="w-[575px] p-4">
      <ReviewCard review={data} />
    </div>
  )
}

function ShellCompareStory() {
  return (
    <WithRuntime>
      <ChatShell projectId="project-theorem" threadId="thread-app-gallery" />
    </WithRuntime>
  )
}

/** The thread alone on the sheet: the reading column and the composer at desktop width. */
/** The conversation as the chat mode shows it (ModeView): over the Life field, on the sheet's gradient. */
function ConversationWideStory() {
  return (
    <WithRuntime>
      <div className="bg-sheet h-dvh w-full">
        <LifeBackdrop>
          <Thread />
        </LifeBackdrop>
      </div>
    </WithRuntime>
  )
}

function NoteKindsStory() {
  const { data: note } = useNote('doc-everything')
  if (!note) return null
  return (
    <div className="grid h-dvh grid-cols-2 divide-x divide-separator">
      <div className="overflow-y-auto">
        <NoteEditor note={note} />
      </div>
      <div className="overflow-y-auto">
        <NoteExcerpt live markdown={note.markdown} className="p-6" />
      </div>
    </div>
  )
}

function CanvasNoteTypesStory() {
  return (
    <WithRuntime>
      <div className="h-dvh w-full">
        <Canvas />
      </div>
    </WithRuntime>
  )
}

const PROGRAM_NOTE_TYPES = { note: NoteNodeView }

function ProgramNoteStory() {
  const [nodes, setNodes] = useState<NoteFlowNode[]>(() =>
    [
      { id: 'filled', x: 40, text: documentFixtures['doc-track'] ?? '' },
      { id: 'empty', x: 500, text: '' },
    ].map(({ id, x, text }) => ({
      id,
      type: 'note' as const,
      position: { x, y: 40 },
      width: 400,
      height: 320,
      data: { note: { id, text, x, y: 40, width: 400, height: 320 } },
    })),
  )
  return (
    <div className="h-dvh w-full">
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          nodeTypes={PROGRAM_NOTE_TYPES}
          onNodesChange={(changes) =>
            setNodes((current) => applyNodeChanges(changes, current))
          }
        />
      </ReactFlowProvider>
    </div>
  )
}

/**
 * A notebook artifact as a thread shows it, read from the part Theorem stores
 * for it; the fake Theorem answers its outputs and host routes.
 */
function NotebookStory({ id }: { id: string }) {
  const { notebook, sourceRevision } = NOTEBOOK_DOCUMENTS[id]!
  const artifact = readArtifact(notebookPart(id, notebook, { sourceRevision }))
  if (!artifact) return null
  return (
    <div className="mx-auto w-full max-w-[880px] p-6">
      <ArtifactView artifact={artifact} distance="thing" latest />
    </div>
  )
}

function ArtifactPartMessage() {
  return <MessagePrimitive.Parts />
}

/**
 * An OpenUI artifact as the conversation shows it: one assistant message
 * carrying the artifact part, drawn by the thread's own part renderers at the
 * thread's reading width.
 */
function artifactStory({ id, title, program, version }: ArtifactStory) {
  const messages: ThreadMessageLike[] = [
    {
      id: `message-${id}`,
      role: 'assistant',
      status: { type: 'complete', reason: 'stop' },
      content: [
        {
          type: 'data',
          name: ARTIFACT_PART,
          data: {
            artifactId: `art_${id}`,
            artifactRevision: 'rev_1',
            artifactKind: 'openui',
            rendererId: 'theorem-openui',
            contractVersion: 'theorem-artifact-v1',
            lifecycle: 'ready',
            patchSequence: 1,
            fallbackText: title,
            // The stored publication's fields (#978 payload plus the openui form's own).
            payload: {
              documentId: `doc_${id}`,
              revision: { position: 1 },
              title,
              content: program,
              language: 'openui',
              form: 'openui',
              formVersion: 1,
              library: { id: LIBRARY_ID, version: version ?? LIBRARY_VERSION },
              program,
            },
          },
        },
      ],
    },
  ]
  return partsStory(messages)
}

/**
 * Finished messages drawn by the thread's own part renderers, at the thread's
 * reading width.
 */
function partsStory(messages: ThreadMessageLike[]) {
  return function PartsStory() {
    const runtime = useExternalStoreRuntime({
      messages,
      isRunning: false,
      onNew: async () => {},
      convertMessage: (message: ThreadMessageLike) => message,
    })
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <TheoremPartRenderers />
        <div className="mx-auto w-full max-w-(--spacing-reading) px-4 py-4">
          <ThreadPrimitive.Messages components={{ Message: ArtifactPartMessage }} />
        </div>
      </AssistantRuntimeProvider>
    )
  }
}

/** A program the agent wrote, as the row the conversation draws for it. */
const programStory = partsStory([
  {
    id: 'message-program',
    role: 'assistant',
    status: { type: 'complete', reason: 'stop' },
    content: [{ type: 'data', name: 'theorem-program', data: PROGRAM_PART }],
  },
])

const ACTIVITY_STATUS: Record<ActivityState, ThreadMessageLike['status']> = {
  working: { type: 'running' },
  approval: { type: 'running' },
  finished: { type: 'complete', reason: 'stop' },
  stopped: { type: 'incomplete', reason: 'cancelled' },
  unfinished: {
    type: 'incomplete',
    reason: 'error',
    error: 'The response could not be saved.',
  },
}

/**
 * The thread itself, composer and all, over committed messages: none for a new
 * conversation, or one question and its reply in a state of the activity line.
 */
function threadStory(
  state?: ActivityState,
  stored = state ? activityMessages(state) : [],
) {
  const messages: ThreadMessageLike[] = state
    ? toAssistantMessages(stored).map((message) =>
        message.role === 'assistant'
          ? { ...message, status: ACTIVITY_STATUS[state] }
          : message,
      )
    : []
  const isRunning = state === 'working' || state === 'approval'
  return function ThreadStory() {
    const runtime = useExternalStoreRuntime({
      messages,
      isRunning,
      onNew: async () => {},
      convertMessage: (message: ThreadMessageLike) => message,
    })
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <TheoremPartRenderers />
        <div className="h-dvh">
          <Thread autoFocus={false} />
        </div>
      </AssistantRuntimeProvider>
    )
  }
}

export const REGISTRY: Readonly<Record<string, ComponentType>> = {
  'composer-paper': threadStory(),
  'chat-program': programStory,
  ...Object.fromEntries(
    ACTIVITY_STATES.map((state) => [`activity-${state}`, threadStory(state)]),
  ),
  ...Object.fromEntries(
    ARTIFACT_STORIES.map((story) => [story.id, artifactStory(story)]),
  ),
  'activity-approval-high': threadStory('approval', activityMessages('approval', 'high')),
  'tool-pills': threadStory('working', toolPillMessages()),
  'tool-calls-check': threadStory('finished', appCheckMessages()),
  'face-bench': FaceBench,
  'face-book': FaceBook,
  'face-in-shell': ShellCompareStory,
  'organized-sidebar': OrganizedSidebarStory,
  'librarian-footer': LibrarianFooterStory,
  'compare-pane': ComparePaneStory,
  'review-card': ReviewCardStory,
  'shell-compare': ShellCompareStory,
  'conversation-wide': ConversationWideStory,
  'note-kinds': NoteKindsStory,
  'canvas-note-types': CanvasNoteTypesStory,
  'program-note': ProgramNoteStory,
  'cpu-gpu-tradeoff': () => <NotebookStory id="cpu-gpu-tradeoff" />,
  'cpu-gpu-measured': () => <NotebookStory id="cpu-gpu-measured" />,
  'cpu-gpu-awaiting-gpu': () => <NotebookStory id="cpu-gpu-awaiting-gpu" />,
  'cpu-gpu-model': () => <NotebookStory id="cpu-gpu-model" />,
}
