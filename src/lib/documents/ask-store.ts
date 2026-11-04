// SOURCING: zustand + zustand/middleware persist (each note's asks and its
// conversation, per browser, as shell-state.ts keeps the shell's).
//
// Kept apart from the runner (asks.ts), so the chats can leave the document
// screen's conversations out of their list without importing the runner.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Mark, Quote } from './marks'

/** What became of an edit the agent made in the note. */
export type EditState = 'applied' | 'undone' | 'missing'

export type Ask = {
  id: string
  question: string
  /** The passage asked about, quoted so it is found again as the note changes. */
  passage: Quote
  /** How the passage is named, such as "selected paragraph". */
  part: string
  reply: string
  marks: Mark[]
  /** Each edit's state, by mark id; an edit not listed is still to apply. */
  edits: Readonly<Record<string, EditState>>
  /**
   * The passage, by the ask's id, and the agent's comments and highlights, by
   * mark id, quoted again once the text under them changed, so each is found
   * after a reload. What was asked and what the agent marked stay as they were.
   */
  quotes?: Readonly<Record<string, Quote>>
  status: 'queued' | 'running' | 'done' | 'failed' | 'stopped'
  /** Its send's idempotency key, so a send whose reply was lost finds its ask. */
  sendKey?: string
  runId?: string
  error?: string
}

type DocumentAsks = {
  /** Each note's conversation, by note key. */
  threads: Readonly<Record<string, string>>
  /** Each note's asks, oldest first, by note key. */
  asks: Readonly<Record<string, readonly Ask[]>>
  setThread: (key: string, threadId: string) => void
  add: (key: string, ask: Ask) => void
  patch: (key: string, id: string, change: Partial<Ask>) => void
  setEdit: (key: string, id: string, markId: string, state: EditState) => void
  dismiss: (key: string, id: string) => void
}

const patchAsk = (
  asks: DocumentAsks['asks'],
  key: string,
  id: string,
  change: (ask: Ask) => Partial<Ask>,
) => ({
  asks: {
    ...asks,
    [key]: (asks[key] ?? []).map((ask) =>
      ask.id === id ? { ...ask, ...change(ask) } : ask,
    ),
  },
})

export const useDocumentAsks = create<DocumentAsks>()(
  persist(
    (set) => ({
      threads: {},
      asks: {},
      setThread: (key, threadId) =>
        set((s) => ({ threads: { ...s.threads, [key]: threadId } })),
      add: (key, ask) =>
        set((s) => ({
          asks: { ...s.asks, [key]: [...(s.asks[key] ?? []), ask] },
        })),
      patch: (key, id, change) =>
        set((s) => patchAsk(s.asks, key, id, () => change)),
      setEdit: (key, id, markId, state) =>
        set((s) =>
          patchAsk(s.asks, key, id, (ask) => ({
            edits: { ...ask.edits, [markId]: state },
          })),
        ),
      dismiss: (key, id) =>
        set((s) => ({
          asks: {
            ...s.asks,
            [key]: (s.asks[key] ?? []).filter((ask) => ask.id !== id),
          },
        })),
    }),
    {
      name: 'theorem-ui:document-asks',
      version: 1,
      partialize: ({ threads, asks }) => ({ threads, asks }),
    },
  ),
)

/** The key a note's asks and conversation are kept under: its entry, not its path. */
export const noteKey = (workspaceId: string, entryId: string) =>
  `${workspaceId}:${entryId}`

/** The conversations the document screen keeps, which the chats leave out. */
export const documentThreadIds = () =>
  Object.values(useDocumentAsks.getState().threads)
