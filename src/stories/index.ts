// SOURCING: none: the list /stories.json serves and the story route looks up, kept free of components so the server route can read it. Each story's lane and reference are the license ledger's, docs/plans/evidence/ledger.md.
import { ACTIVITY_STATES } from './fixtures/activity'
import { ARTIFACT_STORIES } from './fixtures/artifacts'

export type StoryMeta = {
  id: string
  title: string
  lane: 'translation' | 'original'
  /** Under docs/plans/evidence/refs/; an original drawn to no reference has none, and the oracle skips it. */
  reference?: string
  /** Width and height the reference's region is read at. */
  viewport: { width: number; height: number }
  /** The region of the reference this story answers: left, top, width, height. */
  region?: readonly [number, number, number, number]
  /** Selected in the sidebar, the way a route would. */
  threadId?: string
}

const SIDEBAR_REF = 'sidebar-compare@2026-11-05.webp'
const CANVAS_REF = 'canvas-note-types@2026-11-05.png'
/** The coding-workspace mockup the person attached: the terminal against the code pane, and the fox. */
const CODING_REF = 'coding-workspace-mockup@2026-11-08.png'

export const STORIES: readonly StoryMeta[] = [
  {
    id: 'organized-sidebar',
    title: 'Organized sidebar',
    lane: 'translation',
    reference: SIDEBAR_REF,
    viewport: { width: 354, height: 1064 },
    region: [59, 0, 354, 1064],
    threadId: 'thread-app-gallery',
  },
  {
    id: 'librarian-footer',
    title: 'Librarian footer',
    lane: 'original',
    reference: SIDEBAR_REF,
    viewport: { width: 354, height: 110 },
    region: [59, 855, 354, 110],
  },
  {
    id: 'compare-pane',
    title: 'Compare pane',
    lane: 'translation',
    reference: SIDEBAR_REF,
    viewport: { width: 423, height: 1064 },
    region: [1056, 0, 423, 1064],
  },
  {
    id: 'review-card',
    title: 'Review card',
    lane: 'translation',
    reference: SIDEBAR_REF,
    viewport: { width: 575, height: 80 },
    region: [471, 370, 575, 80],
  },
  {
    id: 'note-kinds',
    title: 'Note kinds',
    lane: 'original',
    reference: CANVAS_REF,
    viewport: { width: 1280, height: 1000 },
  },
  {
    id: 'program-note',
    title: 'Note on the program canvas',
    lane: 'original',
    reference: CANVAS_REF,
    viewport: { width: 900, height: 600 },
  },
  {
    id: 'canvas-note-types',
    title: 'Canvas with typed notes',
    lane: 'original',
    reference: CANVAS_REF,
    viewport: { width: 1440, height: 900 },
  },
  {
    id: 'conversation-wide',
    title: 'Conversation on a wide sheet',
    lane: 'original',
    reference: CODING_REF,
    viewport: { width: 1600, height: 1000 },
    threadId: 'thread-app-gallery',
  },
  {
    id: 'shell-compare',
    title: 'Shell with Compare open',
    lane: 'translation',
    reference: SIDEBAR_REF,
    viewport: { width: 1479, height: 1064 },
    threadId: 'thread-app-gallery',
  },
  {
    id: 'cpu-gpu-tradeoff',
    title: 'CPU or GPU: the tradeoff notebook',
    lane: 'original',
    viewport: { width: 960, height: 1500 },
  },
  {
    id: 'cpu-gpu-measured',
    title: 'CPU or GPU: measured timings, CPU-only run',
    lane: 'original',
    viewport: { width: 960, height: 1400 },
  },
  {
    id: 'cpu-gpu-awaiting-gpu',
    title: 'CPU or GPU: timings awaiting a GPU host',
    lane: 'original',
    viewport: { width: 960, height: 400 },
  },
  {
    id: 'cpu-gpu-model',
    title: 'CPU or GPU: the cost model in Python, runnable in the browser',
    lane: 'original',
    viewport: { width: 960, height: 900 },
  },
  {
    id: 'composer-paper',
    title: 'Composer on paper, new conversation',
    lane: 'original',
    viewport: { width: 760, height: 560 },
  },
  {
    id: 'composer-markdown',
    title: 'Composer holding formatted Markdown',
    lane: 'original',
    viewport: { width: 760, height: 760 },
  },
  {
    id: 'chat-program',
    title: 'A program the agent wrote',
    lane: 'original',
    viewport: { width: 760, height: 560 },
  },
  ...ACTIVITY_STATES.map(
    (state): StoryMeta => ({
      id: `activity-${state}`,
      title: `Activity line: ${state}`,
      lane: 'original',
      viewport: { width: 760, height: 560 },
    }),
  ),
  {
    id: 'face-bench',
    title: 'Theo: the bench, every way to move the face',
    lane: 'original',
    viewport: { width: 1000, height: 620 },
  },
  {
    id: 'face-book',
    title: 'Theo: every performance in the book, stopped at its fullest',
    lane: 'original',
    viewport: { width: 780, height: 860 },
  },
  {
    id: 'face-in-shell',
    title: 'Theo in the shell, beside Kit',
    lane: 'original',
    viewport: { width: 1280, height: 800 },
    threadId: 'thread-app-gallery',
  },
  {
    id: 'face-visit',
    title: 'Theo on a page with an artifact, to visit',
    lane: 'original',
    viewport: { width: 1280, height: 800 },
  },
  {
    id: 'face-point',
    title: 'Theo on a page with things to point at',
    lane: 'original',
    viewport: { width: 1280, height: 800 },
  },
  {
    id: 'face-sound',
    title: 'Theo on a page with a reply to read aloud',
    lane: 'original',
    viewport: { width: 1280, height: 800 },
  },
  {
    id: 'tool-pills',
    title: 'Tool pills: done, failed and running',
    lane: 'original',
    viewport: { width: 760, height: 560 },
  },
  ...ARTIFACT_STORIES.map(
    ({ id, title }): StoryMeta => ({
      id,
      title: `Artifact: ${title}`,
      lane: 'original',
      viewport: { width: 760, height: 900 },
    }),
  ),
]

export const findStory = (id: string) => STORIES.find((story) => story.id === id)
