// SOURCING: @tanstack/react-router (a document is /notes/$documentId), the notes workspace's store (notes-workspace-state.ts) for every other pane, useNewNote (note-library.ts) for a Page, useCreateRecord (records/queries) for any declared class's record, useAskTheorem (index/navigation) for what only the agent makes: an App or Notebook, and a class described in words
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useCreateRecord } from '@/components/records/queries'
import { recordItemId } from '@/components/records/model'
import type { ObjectType } from '@/components/records/contract'
import { useAskTheorem } from '@/components/index/navigation'
import { useNewNote } from '@/lib/theorem/note-library'
import type { ObjectClass } from '@/lib/objects/classes'
import type { ObjectEntry, ObjectRef } from '@/lib/objects/library'
import { useNotesWorkspace } from '@/components/notes/notes-workspace-state'
import type { PaneSpec } from '@/components/notes/notes-workspace-state'

/** Opens an object: a document as its note pane, anything else as its record pane. */
export function useOpenObject() {
  const navigate = useNavigate()
  return useCallback(
    (
      target: Pick<ObjectEntry, 'ref' | 'documentId'> | ObjectRef,
      beside = false,
    ) => {
      const ref = typeof target === 'string' ? target : target.ref
      const documentId =
        typeof target === 'string'
          ? ref.startsWith('record:')
            ? undefined
            : ref
          : target.documentId
      if (documentId) {
        if (beside && useNotesWorkspace.getState().openBeside(documentId))
          return
        void navigate({ to: '/notes/$documentId', params: { documentId } })
        return
      }
      useNotesWorkspace
        .getState()
        .open({ kind: 'record', key: ref }, { beside })
    },
    [navigate],
  )
}

export const openPane = (spec: PaneSpec, beside = false) =>
  useNotesWorkspace.getState().open(spec, { beside })

const PLACEHOLDER = { object_type_id: '', node_label: '' } as ObjectType

/**
 * Makes a new object of `cls` and opens it. A Page is a new note; an App or
 * Notebook is made by the agent, so the request goes to the composer; any
 * other class gets a record named for it.
 */
export function useNewObject(cls: ObjectClass | undefined) {
  const newNote = useNewNote()
  const create = useCreateRecord(cls?.type ?? PLACEHOLDER)
  const open = useOpenObject()
  const ask = useAskTheorem()
  const client = useQueryClient()
  const make = useCallback(
    (name?: string) => {
      if (!cls) return
      if (cls.native === 'page')
        return newNote.mutate(undefined, {
          onSuccess: (note) => open(note.documentId),
        })
      if (cls.native)
        return ask(
          `Make a new ${cls.label.toLowerCase()}${name ? ` called "${name}"` : ''} and save it to Notes.`,
          [],
        )
      create.mutate(
        {
          [cls.type.label_identifier_field || 'name']:
            name || `Untitled ${cls.label.toLowerCase()}`,
        },
        {
          onSuccess: (row) => {
            void client.invalidateQueries({
              queryKey: ['theorem', 'records', 'all'],
            })
            open(recordItemId(cls.type, row.id))
          },
        },
      )
    },
    [cls, newNote, create, open, ask, client],
  )
  return {
    make,
    isPending: newNote.isPending || create.isPending,
    error: newNote.error ?? create.error,
  }
}
