// SOURCING: the real components, wrapped only in the providers the app itself gives them. Loaded lazily by the story route so none of this reaches production. Artifact stories hand a committed OpenUI program to the thread's own part renderers inside an assistant-ui external-store message.
import { ReactFlow, ReactFlowProvider, applyNodeChanges } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { ARTIFACT_PART, readArtifact } from '@/components/artifacts/artifact-model'
import { LIBRARY_ID, LIBRARY_VERSION } from '@/components/artifacts/openui/library'
import { Canvas } from '@/components/canvas/canvas'
import { NoteNodeView } from '@/components/program/program-annotations'
import { NoteEditor } from '@/components/notes/note-editor'
import { NoteExcerpt } from '@/components/notes/note-excerpt'
import { useResponseDetails } from '@/components/chat/response-style-details'
import { TheoremPartRenderers } from '@/components/chat/theorem-parts'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { ComparePane } from '@/components/review/compare-pane'
import { ReviewCard } from '@/components/review/review-card'
import { LibrarianFooter } from '@/components/organize/librarian-footer'
import { ResponseStylesPage } from '@/components/settings/styles/response-styles-page'
import { ContextPanel } from '@/components/shell/sidebar'
import { ChatShell } from '@/components/shell/chat-shell'
import { useNote } from '@/lib/theorem/notes'
import { useOrganization } from '@/lib/theorem/organization'
import type { NoteFlowNode } from '@/lib/program/flow'
import { TheoremRuntimeProvider } from '@/lib/theorem/runtime'
import { useReview } from '@/lib/theorem/reviews'
import { ARTIFACT_STORIES } from './fixtures/artifacts'
import type { ArtifactStory } from './fixtures/artifacts'
import { documentFixtures } from './fixtures/notes'
import { seedResponseStylesSettings } from './fixtures/response-styles-settings'

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
  return function OpenUIArtifactStory() {
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

/** Which of the reply's details are shown: the style, a loaded framework, and what the suggestions did. */
const RESPONSE_STYLE_PART = {
  style: {
    id: 'theorem.style.concise',
    name: 'Concise',
    revision: 0,
    revisionId: 'shipped-concise',
    source: 'account',
  },
  frameworks: [
    {
      id: 'theorem.framework.explanation',
      name: 'Understanding through explanation',
      revision: 0,
      revisionId: 'shipped-explanation',
      references: ['references/source-notes.md'],
    },
  ],
  suggestions: {
    state: 'suggested',
    model: 'openrouter/typesafe/jev-1.14',
    items: [
      {
        id: 'theorem.framework.related-questions',
        category: 'framework',
        name: 'Related questions',
        relevance: 0.82,
      },
      { id: 'web_search', category: 'tool', name: 'Web search', relevance: 0.71 },
    ],
  },
}

/**
 * A new conversation's composer over the fake Theorem, which serves response
 * styles, so the picker beside the model and effort pickers names the style
 * the first message will use.
 */
function ResponseStylePickerStory() {
  const runtime = useExternalStoreRuntime({
    messages: [],
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="mx-auto flex h-[320px] w-full max-w-(--spacing-reading) flex-col">
        <Thread autoFocus={false} />
      </div>
    </AssistantRuntimeProvider>
  )
}

/**
 * An assistant message carrying a `response_style` part, with its details
 * open as the More menu's "Response details" item opens them. The transcript
 * itself shows no routing text.
 */
function ResponseDetailsStory() {
  const runtime = useExternalStoreRuntime({
    messages: [
      {
        id: 'message-response-details',
        role: 'assistant',
        status: { type: 'complete', reason: 'stop' },
        content: [
          {
            type: 'data',
            name: 'theorem-response_style',
            data: RESPONSE_STYLE_PART,
          },
          { type: 'text', text: 'Denver gets about 300 days of sun a year.' },
        ],
      },
    ],
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
  })
  useEffect(() => {
    useResponseDetails.getState().show('message-response-details')
    return () => useResponseDetails.getState().show(undefined)
  }, [])
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TheoremPartRenderers />
      <div className="mx-auto h-[620px] w-full max-w-(--spacing-reading)">
        <Thread autoFocus={false} />
      </div>
    </AssistantRuntimeProvider>
  )
}

/**
 * Settings, Response styles over the fake Theorem: a shipped style the person
 * edited (with a newer shipped version waiting) and one of their own, seeded
 * once through the fake's own routes before the page reads them.
 */
function ResponseStylesSettingsStory() {
  const [ready, setReady] = useState(false)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void seedResponseStylesSettings().then(() => setReady(true))
  }, [])
  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-6 bg-sheet px-6 py-8">
      {ready && <ResponseStylesPage />}
    </div>
  )
}

export const REGISTRY: Readonly<Record<string, ComponentType>> = {
  ...Object.fromEntries(
    ARTIFACT_STORIES.map((story) => [story.id, artifactStory(story)]),
  ),
  'organized-sidebar': OrganizedSidebarStory,
  'librarian-footer': LibrarianFooterStory,
  'compare-pane': ComparePaneStory,
  'review-card': ReviewCardStory,
  'shell-compare': ShellCompareStory,
  'note-kinds': NoteKindsStory,
  'canvas-note-types': CanvasNoteTypesStory,
  'program-note': ProgramNoteStory,
  'response-style-picker': ResponseStylePickerStory,
  'response-details': ResponseDetailsStory,
  'response-styles-settings': ResponseStylesSettingsStory,
  'cpu-gpu-tradeoff': () => <NotebookStory id="cpu-gpu-tradeoff" />,
  'cpu-gpu-measured': () => <NotebookStory id="cpu-gpu-measured" />,
  'cpu-gpu-awaiting-gpu': () => <NotebookStory id="cpu-gpu-awaiting-gpu" />,
  'cpu-gpu-model': () => <NotebookStory id="cpu-gpu-model" />,
}
