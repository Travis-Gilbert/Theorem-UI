// SOURCING: @tanstack/react-query (useQuery, useMutation with a scope so edits save one at a time, useMutationState for the edits still saving) and zod (parsing Theorem's answer once, where it comes in); the layout itself is note-sections.ts
//
// The Notes panel's sections, their order and folding, and which row sits in
// which section, kept in Theorem as one document per account so every device
// shows the same arrangement (see Theorem's
// docs/plans/2026-11-08-notes-folders-and-layout.md, part 2). An edit is a
// change to the layout, not a whole layout: when another device saved first,
// the same change is made again over what that device saved.
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { TheoremError } from '@theoremharness/sdk'
import { z } from 'zod'
import { START_LAYOUT, isSectionItem } from '@/components/notes/note-sections'
import type {
  SectionItem,
  SectionLayout,
} from '@/components/notes/note-sections'
import { mutate } from './client'
import type { MutationHeaders } from './client'
import { theoremJson } from './passthrough'

const SCHEMA = 'theorem-document/2'
const LAYOUT_PATH = '/api/documents/v2/layouts/notes'
const STALE_TRIES = 3

/** The layout Theorem holds, and the revision a write must name to replace it. */
export type StoredLayout = {
  readonly layout: SectionLayout | null
  readonly revision: number
}

/** One edit to the layout, made over whatever layout is current when it saves. */
export type LayoutChange = (layout: SectionLayout) => SectionLayout

const sectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  collapsed: z.boolean(),
})

const layoutSchema = z.object({
  sections: z.tuple([sectionSchema], sectionSchema),
  // A key this client does not know as a row is dropped, not refused.
  placed: z
    .record(z.string(), z.string())
    .transform(
      (placed) =>
        Object.fromEntries(
          Object.entries(placed).filter(([item]) => isSectionItem(item)),
        ) as Partial<Record<SectionItem, string>>,
    ),
})

const storedSchema = z.object({
  layout: layoutSchema.nullable(),
  revision: z.number().int().nonnegative(),
})

export const parseStoredLayout = (body: unknown): StoredLayout =>
  storedSchema.parse(body)

/** What the panel shows: an account that never saved one starts with the three sections. */
export const layoutOf = (stored: StoredLayout): SectionLayout =>
  stored.layout ?? START_LAYOUT

export function layoutWrite(
  layout: SectionLayout,
  revision: number,
  headers: MutationHeaders,
) {
  return {
    path: LAYOUT_PATH,
    init: {
      method: 'PUT',
      headers: { ...headers, 'If-Match': String(revision) },
      body: {
        schema: SCHEMA,
        idempotencyKey: headers['Idempotency-Key'],
        layout,
      },
    },
  }
}

/** The layout another device saved first, when that is why the write was refused. */
function savedFirst(error: unknown): StoredLayout | undefined {
  if (!(error instanceof TheoremError)) return
  const body = error.body as { code?: unknown } | undefined
  return body?.code === 'stale_layout' ? parseStoredLayout(body) : undefined
}

/**
 * Makes the change over `base` and writes it. When another device saved first,
 * makes the same change over theirs and tries again, up to three tries.
 */
export async function saveLayout(
  change: LayoutChange,
  base: StoredLayout,
  put: (layout: SectionLayout, revision: number) => Promise<StoredLayout>,
): Promise<StoredLayout> {
  let current = base
  for (let tries = 1; ; tries += 1) {
    try {
      return await put(change(layoutOf(current)), current.revision)
    } catch (error) {
      const theirs = savedFirst(error)
      if (!theirs || tries >= STALE_TRIES) throw error
      current = theirs
    }
  }
}

/** A layout edit made on this page, as React Query keeps it. */
export type LayoutAttempt = {
  readonly status: 'idle' | 'pending' | 'success' | 'error'
  readonly submittedAt: number
  readonly change: LayoutChange
  readonly error: unknown
}

/** The edit that failed, while it is the latest one: a later edit or its retry puts it behind. */
export function failedLast(
  attempts: readonly LayoutAttempt[],
): LayoutAttempt | undefined {
  const last = attempts.reduce<LayoutAttempt | undefined>(
    (latest, attempt) =>
      !latest || attempt.submittedAt >= latest.submittedAt ? attempt : latest,
    undefined,
  )
  return last?.status === 'error' ? last : undefined
}

/** Why the layout shown may not be the one in Theorem, and how to try again. */
export type LayoutTrouble = {
  readonly kind: 'read' | 'save'
  readonly error: unknown
  readonly retry: () => void
}

export const notesLayoutKey = ['theorem', 'notes', 'layout'] as const
const NEVER_SAVED: StoredLayout = { layout: null, revision: 0 }

const readLayout = async () =>
  parseStoredLayout(await theoremJson(`${LAYOUT_PATH}?schema=${SCHEMA}`))

const putLayout = (layout: SectionLayout, revision: number) =>
  mutate(async (headers) => {
    const { path, init } = layoutWrite(layout, revision, headers)
    return parseStoredLayout(await theoremJson(path, init))
  })

/**
 * The layout as the person arranged it, with edits still saving already in
 * place, and `edit` to change it. Edits save one at a time, in order. When
 * the layout could not be read, or the latest edit was not saved, `trouble`
 * says so.
 */
/**
 * Of the layout cached and one just read or saved, the newer. Theorem's
 * revision only goes up, so a read that started before a save and lands
 * after it cannot put the older layout back.
 */
const newerLayout = (cached: unknown, incoming: unknown) => {
  const before = cached as StoredLayout | undefined
  const after = incoming as StoredLayout
  return before && before.revision > after.revision ? before : after
}

/** How the layout is read and kept in the cache. */
export const notesLayoutQuery = {
  queryKey: notesLayoutKey,
  queryFn: readLayout,
  staleTime: 10_000,
  structuralSharing: newerLayout,
}

export function useNotesLayout() {
  const queryClient = useQueryClient()
  const read = useQuery(notesLayoutQuery)
  const data = read.data ?? NEVER_SAVED
  const attempts = useMutationState({
    filters: { mutationKey: notesLayoutKey },
    select: (mutation): LayoutAttempt => ({
      status: mutation.state.status,
      submittedAt: mutation.state.submittedAt,
      change: mutation.state.variables as LayoutChange,
      error: mutation.state.error,
    }),
  })
  const saving = attempts
    .filter((attempt) => attempt.status === 'pending')
    .map((attempt) => attempt.change)
  const { mutate: edit } = useMutation({
    mutationKey: notesLayoutKey,
    scope: { id: 'notes-layout' },
    mutationFn: (change: LayoutChange) =>
      saveLayout(
        change,
        queryClient.getQueryData<StoredLayout>(notesLayoutKey) ?? NEVER_SAVED,
        putLayout,
      ),
    onSuccess: (saved) => queryClient.setQueryData(notesLayoutKey, saved),
  })
  const failed = failedLast(attempts)
  const trouble: LayoutTrouble | undefined =
    read.isError && !read.data
      ? { kind: 'read', error: read.error, retry: () => void read.refetch() }
      : failed && {
          kind: 'save',
          error: failed.error,
          retry: () => edit(failed.change),
        }
  return {
    layout: saving.reduce((layout, change) => change(layout), layoutOf(data)),
    edit,
    trouble,
  }
}
