// SOURCING: the real components, wrapped only in the providers the app itself gives them. Loaded lazily by the story route so none of this reaches production.
import { ReactFlow, ReactFlowProvider, applyNodeChanges } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useState } from 'react'
import type { ComponentType } from 'react'
import { readArtifact } from '@/components/artifacts/artifact-model'
import { ArtifactView } from '@/components/artifacts/artifact-renderers'
import { Canvas } from '@/components/canvas/canvas'
import { NoteNodeView } from '@/components/program/program-annotations'
import { NoteEditor } from '@/components/notes/note-editor'
import { NoteExcerpt } from '@/components/notes/note-excerpt'
import { ComparePane } from '@/components/review/compare-pane'
import { ReviewCard } from '@/components/review/review-card'
import { LibrarianFooter } from '@/components/organize/librarian-footer'
import { ContextPanel } from '@/components/shell/sidebar'
import { ChatShell } from '@/components/shell/chat-shell'
import { useNote } from '@/lib/theorem/notes'
import { useOrganization } from '@/lib/theorem/organization'
import type { NoteFlowNode } from '@/lib/program/flow'
import { TheoremRuntimeProvider } from '@/lib/theorem/runtime'
import { useReview } from '@/lib/theorem/reviews'
import { documentFixtures } from './fixtures/notes'
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

export const REGISTRY: Readonly<Record<string, ComponentType>> = {
  'organized-sidebar': OrganizedSidebarStory,
  'librarian-footer': LibrarianFooterStory,
  'compare-pane': ComparePaneStory,
  'review-card': ReviewCardStory,
  'shell-compare': ShellCompareStory,
  'note-kinds': NoteKindsStory,
  'canvas-note-types': CanvasNoteTypesStory,
  'program-note': ProgramNoteStory,
  'cpu-gpu-tradeoff': () => <NotebookStory id="cpu-gpu-tradeoff" />,
  'cpu-gpu-measured': () => <NotebookStory id="cpu-gpu-measured" />,
  'cpu-gpu-awaiting-gpu': () => <NotebookStory id="cpu-gpu-awaiting-gpu" />,
  'cpu-gpu-model': () => <NotebookStory id="cpu-gpu-model" />,
}
