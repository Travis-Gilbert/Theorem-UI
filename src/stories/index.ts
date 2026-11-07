// SOURCING: none: the list /stories.json serves and the story route looks up, kept free of components so the server route can read it. Each story's lane and reference are the license ledger's, docs/plans/evidence/ledger.md.

export type StoryMeta = {
  id: string
  title: string
  lane: 'translation' | 'original'
  /** Under docs/plans/evidence/refs/. */
  reference: string
  /** Width and height the reference's region is read at. */
  viewport: { width: number; height: number }
  /** The region of the reference this story answers: left, top, width, height. */
  region?: readonly [number, number, number, number]
  /** Selected in the sidebar, the way a route would. */
  threadId?: string
}

const SIDEBAR_REF = 'sidebar-compare@2026-11-05.webp'
const CANVAS_REF = 'canvas-note-types@2026-11-05.png'

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
    id: 'shell-compare',
    title: 'Shell with Compare open',
    lane: 'translation',
    reference: SIDEBAR_REF,
    viewport: { width: 1479, height: 1064 },
    threadId: 'thread-app-gallery',
  },
]

export const findStory = (id: string) => STORIES.find((story) => story.id === id)
