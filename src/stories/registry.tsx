// SOURCING: the real components, wrapped only in the providers the app itself gives them. Loaded lazily by the story route so none of this reaches production. Artifact stories hand a committed OpenUI program to the thread's own part renderers inside an assistant-ui external-store message; the activity and composer stories hand committed messages to the thread itself the same way, converted by the SDK's toAssistantMessages.
import { ReactFlow, ReactFlowProvider, applyNodeChanges } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from '@tanstack/react-router'
import type { ComponentType } from 'react'
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import type { ReadonlyJSONObject } from 'assistant-stream/utils'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import {
  ARTIFACT_PART,
  readArtifact,
} from '@/components/artifacts/artifact-model'
import { ArtifactPanel } from '@/components/artifacts/artifact-panel'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import {
  LIBRARY_ID,
  LIBRARY_VERSION,
} from '@/components/artifacts/openui/library'
import { Canvas } from '@/components/canvas/canvas'
import { FaceBench, FaceBook } from '@/components/face/face-bench'
import { FaceStage } from '@/components/face/face-stage'
import { speechAdapter } from '@/lib/speech/adapter'
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
import { projectSearch } from '@/lib/theorem/project-views'
import { GlassCompareStory } from './glass-compare'
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
import { pointingMessages } from './fixtures/pointing'
import { PLAN_ARGS, PLAN_RESULT, PLAN_UNDER_WAY } from './fixtures/plan'
import { PlanGraph } from '@/components/chat/plan-graph'

import { ArtifactView } from '@/components/artifacts/artifact-renderers'
import { NOTEBOOK_DOCUMENTS, notebookPart } from './fixtures/notebook-parts'
import { LATIN_PROSE_V1_PARAGRAPHS } from '@/lib/appearance-corpus.mjs'

function WithRuntime({ children }: { children: React.ReactNode }) {
  const [threadId, setThreadId] = useState<string | undefined>(
    'thread-app-gallery',
  )
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

function ComparePaneStory({ standalone = false }: { standalone?: boolean }) {
  return (
    <WithRuntime>
      <div className="h-dvh w-[380px]">
        <ComparePane
          standalone={standalone}
          reviewId="review-app-gallery"
          onClose={() => undefined}
          onDetach={() => undefined}
          onExpandedChange={() => undefined}
        />
      </div>
    </WithRuntime>
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

/** Real mode routes over the story transport, without leaving the fixture. */
function ShellNavigationStory() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Outlet })
    const shell = createRoute({
      getParentRoute: () => root,
      id: '_chat',
      component: ShellNavigationFrame,
    })
    return createRouter({
      routeTree: root.addChildren([
        shell.addChildren(
          ['/', 'vault', 'notes', 'notes/$documentId'].map((path) =>
            createRoute({ getParentRoute: () => shell, path }),
          ),
        ),
      ]),
      history: createMemoryHistory({ initialEntries: ['/vault'] }),
    })
  })
  return <RouterProvider router={router} />
}

/** A project's home in the real shell: the projects route over the story transport, opened at the tab the story's own search names. */
function ProjectHomeStory() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Outlet })
    const shell = createRoute({
      getParentRoute: () => root,
      id: '_chat',
      component: ShellCompareStory,
    })
    const from = new URLSearchParams(window.location.search)
    const search = new URLSearchParams(
      [...from].filter(([key]) => key === 'view' || key === 'lens'),
    ).toString()
    return createRouter({
      routeTree: root.addChildren([
        shell.addChildren([
          createRoute({
            getParentRoute: () => shell,
            path: 'projects/$projectId',
            validateSearch: projectSearch,
          }),
          createRoute({ getParentRoute: () => shell, path: 'c/$threadId' }),
        ]),
      ]),
      history: createMemoryHistory({
        initialEntries: [
          `/projects/project-theorem${search ? `?${search}` : ''}`,
        ],
      }),
    })
  })
  return <RouterProvider router={router} />
}

function ShellNavigationFrame() {
  const pathname = useLocation({ select: (location) => location.pathname })
  return (
    <div data-shell-route={pathname}>
      <ShellCompareStory />
    </div>
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
 * Theo on a page that has an artifact: the `visit` performance looks at the
 * card, travels to its side and looks it over. The live reply's gutter slot
 * above it is where Theo rests, so the trip has somewhere to start.
 */
function FaceVisitStory() {
  const Artifact = FACE_VISIT_ARTIFACT
  return (
    <div className="bg-background min-h-dvh pt-6" data-slot="face-visit">
      <div className="mx-auto flex w-full max-w-(--spacing-reading) items-center gap-3 px-4">
        <span data-face-perch="live" className="flex size-8" aria-hidden />
        <p className="text-ink-muted text-sm">Here is the comparison.</p>
      </div>
      <Artifact />
      <FaceStage />
    </div>
  )
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
          <ThreadPrimitive.Messages
            components={{ Message: ArtifactPartMessage }}
          />
        </div>
      </AssistantRuntimeProvider>
    )
  }
}

/** A program the agent wrote, as the row the conversation draws for it. */
const FACE_VISIT_ARTIFACT = artifactStory(ARTIFACT_STORIES[0] as ArtifactStory)

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

/** Every kind of formatting the composer takes, as the Markdown a draft holds. */
const COMPOSER_DRAFT = `## Release notes

Ship the **composer** with *Markdown* and \`inline code\`, as the [Milkdown docs](https://milkdown.dev) describe.

- Lists stay lists
- with a second item

> A quote reads as a quote.

\`\`\`ts
const sent = composer.text
\`\`\``

/** Writes a draft into the thread's composer the way any other writer does. */
function ComposerDraft({ text }: { text: string }) {
  const aui = useAui()
  useEffect(() => aui.composer.setText(text), [aui, text])
  return null
}

/**
 * The thread itself, composer and all, over committed messages: none for a new
 * conversation, or one question and its reply in a state of the activity line.
 * A `draft` is already in the composer.
 */
function threadStory(
  state?: ActivityState,
  stored = state ? activityMessages(state) : [],
  draft?: string,
  fixtureId?: string,
) {
  const messages: ThreadMessageLike[] = state
    ? toAssistantMessages(stored).map((message) =>
        message.role === 'assistant'
          ? { ...message, status: ACTIVITY_STATUS[state] }
          : message,
      )
    : fixtureId === 'F05'
      ? [{
          id: 'design-oracle-draft-context',
          role: 'assistant',
          status: { type: 'complete', reason: 'stop' },
          content: [{ type: 'text', text: 'A short conversation response gives the draft editor a real prose track for typography and alignment measurements.' }],
        }]
      : []
  const isRunning = state === 'working' || state === 'approval'
  return function ThreadStory() {
    const runtime = useExternalStoreRuntime({
      messages,
      isRunning,
      onNew: async () => {},
      ...(fixtureId === 'F06' && { onCancel: async () => {} }),
      convertMessage: (message: ThreadMessageLike) => message,
    })
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <TheoremPartRenderers />
        {draft && <ComposerDraft text={draft} />}
        <div data-appearance-fixture={fixtureId} className="h-dvh">
          <Thread autoFocus={false} />
        </div>
      </AssistantRuntimeProvider>
    )
  }
}

const POINTING_MESSAGES: ThreadMessageLike[] =
  toAssistantMessages(pointingMessages())

/**
 * Theo on a conversation with things to be sent to: a tool call that failed,
 * folded away among ones that did not; a worker's changed file and its diff;
 * a document whose card shows an excerpt, with the larger view beside the
 * conversation once it is opened, as the shell has it.
 */
function FacePointStory() {
  const runtime = useExternalStoreRuntime({
    messages: POINTING_MESSAGES,
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
  })
  const openId = useArtifactView((s) => s.openId)
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TheoremPartRenderers />
      <div className="flex h-dvh">
        <div className="min-w-0 flex-1">
          <Thread autoFocus={false} />
        </div>
        {openId && (
          <ArtifactPanel
            artifactId={openId}
            onClose={() => useArtifactView.getState().closed(openId)}
            className="border-separator w-[46%] shrink-0 border-s"
          />
        )}
      </div>
      <FaceStage />
    </AssistantRuntimeProvider>
  )
}

const SOUND_MESSAGES: ThreadMessageLike[] = [
  {
    id: 'sound-ask',
    role: 'user',
    content: [{ type: 'text', text: 'What did the build turn up?' }],
  },
  {
    id: 'sound-reply',
    role: 'assistant',
    status: { type: 'complete', reason: 'stop' },
    content: [
      {
        type: 'text',
        text: [
          'The build passed, with **two things** worth a look.',
          '',
          '1. The map loader now reads tiles in parallel, which took the cold start from nine seconds to four.',
          '2. One test is slow: `tiles.test.ts` spends most of its time waiting on a timer.',
          '',
          'Nothing failed. I would fix the timer next, then cut the release.',
        ].join('\n'),
      },
    ],
  },
]

/**
 * Theo on a conversation with a reply to read aloud. Pressing "Read aloud"
 * speaks it with the page's voice through the page's sound graph, and Theo
 * hears what plays: it is the thread as the shell has it, with nothing told
 * to the face but the sound.
 */
function FaceSoundStory() {
  const speech = useMemo(() => speechAdapter(), [])
  const runtime = useExternalStoreRuntime({
    messages: SOUND_MESSAGES,
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
    adapters: { speech },
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TheoremPartRenderers />
      <div className="h-dvh">
        <Thread autoFocus={false} />
      </div>
      <FaceStage />
    </AssistantRuntimeProvider>
  )
}

/**
 * The harness plan as the thread draws its draft_plan call, at the thread's
 * own reading width. The result names no plan id, so the card shows the plan
 * as drafted and reads no live copy.
 */
function PlanCardStory() {
  const { planId: _written, ...result } = PLAN_RESULT
  const messages = useMemo<ThreadMessageLike[]>(
    () => [
      {
        id: 'plan-ask',
        role: 'user',
        content: [{ type: 'text', text: 'Make the harness easier for agents to use. Plan it before you start.' }],
      },
      {
        id: 'plan-answer',
        role: 'assistant',
        status: { type: 'complete', reason: 'stop' },
        content: [
          { type: 'text', text: 'Here is the plan. The audit and the scope can start together.' },
          {
            type: 'tool-call',
            toolCallId: 'call-plan',
            toolName: 'draft_plan',
            args: PLAN_ARGS as unknown as ReadonlyJSONObject,
            result,
          },
        ],
      },
    ],
    [result],
  )
  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: false,
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

/** The same plan from Theorem's copy, one root claimed and the other deviating, at the reading width. */
function PlanCardUnderWayStory() {
  return (
    <div className="mx-auto w-full max-w-(--spacing-reading) px-4 py-4">
      <PlanGraph view={PLAN_UNDER_WAY} />
    </div>
  )
}

/** Fixed Latin calibration prose rendered by the actual assistant-ui Thread. */
const ORACLE_F02_CONTENT = [
  '# Conversation reading fixture',
  '',
  'Prepared for the fixed Latin calibration corpus. **Six paragraphs** remain plain so browser line measurement is reproducible.',
  '',
  '# Reading and writing',
  '',
  'The article uses the same measure as the draft editor.',
  '',
  '## Reading settings',
  '',
  'The displayed text follows the selected content size.',
  '',
  '### Stable reading measure',
  '',
  LATIN_PROSE_V1_PARAGRAPHS.join('\n\n'),
  '',
  'Reviewed against the current appearance policy · metadata',
  '',
  '```ts',
  'const reading = { fixture: "latin-prose-v1", paragraphs: 6 }',
  '```',
].join('\n')

function DesignOracleThreadStory({ empty = false, fixtureId = empty ? 'F01' : 'F02', content, draft = empty ? undefined : 'Draft a follow-up question.' }: { empty?: boolean; fixtureId?: string; content?: string; draft?: string }) {
  const messages: ThreadMessageLike[] = empty ? [] : [
    {
      id: 'appearance-oracle-long-answer',
      role: 'assistant',
      status: { type: 'complete', reason: 'stop' },
      content: [
        // The real Activity metadata line is part of the reading fixture. Two
        // settled progress steps make its Details label visible through the
        // production MessageMetadata slot without duplicating that component.
        { type: 'data', name: 'theorem-progress', data: { label: 'Reading the conversation', status: 'complete' } },
        { type: 'data', name: 'theorem-progress', data: { label: 'Checking the measure', status: 'complete' } },
        { type: 'text', text: content ?? ORACLE_F02_CONTENT },
      ],
    },
  ]
  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
  })
  return (
    <div data-appearance-fixture={fixtureId}>
      <AssistantRuntimeProvider runtime={runtime}>
        <TheoremPartRenderers />
        {draft && <ComposerDraft text={draft} />}
        <div className="h-dvh"><Thread autoFocus={false} /></div>
      </AssistantRuntimeProvider>
    </div>
  )
}

const ORACLE_PREVIEW_USER = [
  'Please compare these workspace choices. '.repeat(22),
  'I need to understand which source is current, what changed since the last review, and how to keep the draft while moving between conversations. '.repeat(4),
].join('')

function DesignOraclePreviewStory() {
  const runtime = useExternalStoreRuntime({
    messages: [
      { id: 'design-oracle-preview-user', role: 'user', content: [{ type: 'text', text: ORACLE_PREVIEW_USER }] },
      { id: 'design-oracle-preview-answer', role: 'assistant', status: { type: 'complete', reason: 'stop' }, content: [{ type: 'text', text: 'Short answer.' }] },
    ],
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
  })
  return <div data-appearance-fixture="F03"><AssistantRuntimeProvider runtime={runtime}><TheoremPartRenderers /><div className="h-dvh"><Thread autoFocus={false} /></div></AssistantRuntimeProvider></div>
}

const ORACLE_MARKUP_CONTENT = [
  '## Expanded content fixture',
  '',
  'A paragraph with **strong text**, *emphasis*, `inline code`, and [a link](https://example.com/a-long-reference-path).',
  '',
  'A long URL should wrap or scroll locally: https://example.com/reference/this/is/a/very/long/unbroken/path/used/to/verify/reflow-and-horizontal-overflow',
  '',
  '| Role | State | Meaning |',
  '| --- | --- | --- |',
  '| Composer | Ready | Draft remains editable |',
  '| Navigation | Selected | Current location stays visible |',
  '',
  '```ts',
  'const appearance = { material: "flat", contentScale: 1 }',
  '```',
].join('\n')

function DesignOracleContentStory({ fixtureId, content, direction = 'ltr', lang = 'en', includeArtifact = false }: { fixtureId: string; content: string; direction?: 'ltr' | 'rtl'; lang?: string; includeArtifact?: boolean }) {
  const artifact = ARTIFACT_STORIES[0] as ArtifactStory
  const contentItems: ThreadMessageLike['content'] = [{ type: 'text', text: content }]
  if (includeArtifact && Array.isArray(contentItems)) {
    contentItems.push({ type: 'data', name: ARTIFACT_PART, data: {
      artifactId: `art_${artifact.id}`, artifactRevision: 'rev_1', artifactKind: 'openui',
      rendererId: 'theorem-openui', contractVersion: 'theorem-artifact-v1', lifecycle: 'ready',
      patchSequence: 1, fallbackText: artifact.title,
      payload: { documentId: `doc_${artifact.id}`, revision: { position: 1 }, title: artifact.title,
        content: artifact.program, language: 'openui', form: 'openui', formVersion: 1,
        library: { id: LIBRARY_ID, version: artifact.version ?? LIBRARY_VERSION }, program: artifact.program },
    } } as ThreadMessageLike['content'][number])
  }
  const runtime = useExternalStoreRuntime({
    messages: [{ id: `design-oracle-${fixtureId}`, role: 'assistant', status: { type: 'complete', reason: 'stop' }, content: contentItems }],
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
  })
  return (
    <div data-appearance-fixture={fixtureId} dir={direction} lang={lang}>
      <AssistantRuntimeProvider runtime={runtime}>
        <TheoremPartRenderers />
        <div className="h-dvh"><Thread autoFocus={false} /></div>
      </AssistantRuntimeProvider>
    </div>
  )
}

const ORACLE_RTL_CONTENT = [
  'مرحبا، هذا نص تجريبي للتحقق من اتجاه القراءة والمحاذاة في الواجهة.',
  '日本語の文章も表示し、ラテン文字と日本語のフォールバックが混在する状態を確認します。',
  ...LATIN_PROSE_V1_PARAGRAPHS.slice(0, 2),
].join('\n\n')

export const REGISTRY: Readonly<Record<string, ComponentType>> = {
  'design-oracle-empty': () => <DesignOracleThreadStory empty />,
  'design-oracle-long': DesignOracleThreadStory,
  'design-oracle-reflow': () => <DesignOracleThreadStory fixtureId="F09" />,
  'design-oracle-draft': threadStory(undefined, [], COMPOSER_DRAFT, 'F05'),
  'design-oracle-stream': threadStory('working', activityMessages('working'), undefined, 'F06'),
  'design-oracle-failure': threadStory('unfinished', activityMessages('unfinished'), undefined, 'F07'),
  'design-oracle-continuity': threadStory(undefined, [], COMPOSER_DRAFT, 'F11'),
  'design-oracle-preview': DesignOraclePreviewStory,
  'design-oracle-content': () => <DesignOracleContentStory fixtureId="F04" content={ORACLE_MARKUP_CONTENT} includeArtifact />,
  'design-oracle-error': threadStory('unfinished'),
  'design-oracle-navigation': () => <div data-appearance-fixture="F08"><ShellCompareStory /></div>,
  'design-oracle-rtl': () => <DesignOracleContentStory fixtureId="F10" content={ORACLE_RTL_CONTENT} direction="rtl" lang="ar" />,
  'composer-paper': threadStory(),
  'composer-markdown': threadStory(undefined, [], COMPOSER_DRAFT),
  'chat-program': programStory,
  ...Object.fromEntries(
    ACTIVITY_STATES.map((state) => [`activity-${state}`, threadStory(state)]),
  ),
  ...Object.fromEntries(
    ARTIFACT_STORIES.map((story) => [story.id, artifactStory(story)]),
  ),
  'activity-approval-high': threadStory(
    'approval',
    activityMessages('approval', 'high'),
  ),
  'tool-pills': threadStory('working', toolPillMessages()),
  'tool-calls-check': threadStory('finished', appCheckMessages()),
  'plan-card': PlanCardStory,
  'plan-card-under-way': PlanCardUnderWayStory,
  'face-bench': FaceBench,
  'face-book': FaceBook,
  'face-in-shell': ShellCompareStory,
  'face-visit': FaceVisitStory,
  'face-point': FacePointStory,
  'face-sound': FaceSoundStory,
  'organized-sidebar': OrganizedSidebarStory,
  'librarian-footer': LibrarianFooterStory,
  'compare-pane': ComparePaneStory,
  'compare-pane-standalone': () => <ComparePaneStory standalone />,
  'review-card': ReviewCardStory,
  'shell-compare': ShellCompareStory,
  'project-home': ProjectHomeStory,
  'shell-navigation': ShellNavigationStory,
  'glass-compare': () => (
    <WithRuntime>
      <GlassCompareStory />
    </WithRuntime>
  ),
  'conversation-wide': ConversationWideStory,
  'note-kinds': NoteKindsStory,
  'canvas-note-types': CanvasNoteTypesStory,
  'program-note': ProgramNoteStory,
  'cpu-gpu-tradeoff': () => <NotebookStory id="cpu-gpu-tradeoff" />,
  'cpu-gpu-measured': () => <NotebookStory id="cpu-gpu-measured" />,
  'cpu-gpu-awaiting-gpu': () => <NotebookStory id="cpu-gpu-awaiting-gpu" />,
  'cpu-gpu-model': () => <NotebookStory id="cpu-gpu-model" />,
}
