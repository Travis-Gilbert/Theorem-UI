// SOURCING: zustand (the references the next turn carries, shared by the parts that add them and the composer that shows them), @theoremharness/sdk resourceKey for the keys of its own resource kinds
//
// "Ask about this" on a delegation or a change puts a context reference in
// the composer instead of pasting text: the front role reads the referenced
// receipt or diff hunk, and the message stays what the person wrote.
import type { TheoremContextReference } from '@theoremharness/sdk'
import { resourceKey } from '@theoremharness/sdk'
import { create } from 'zustand'
import { Icon } from '@/components/icons'
import type { DelegationReference } from '@/lib/theorem/delegations'

export type ComposerReference = TheoremContextReference | DelegationReference

export function referenceKey({ location }: ComposerReference): string {
  const { resource, range } = location
  const at = range
    ? `#${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`
    : ''
  switch (resource.kind) {
    case 'delegation':
      return `delegation:${resource.runId}:${resource.delegationId}`
    case 'delegation-change':
      return `delegation-change:${resource.runId}:${resource.delegationId}:${resource.side}:${resource.path}${at}`
    default:
      return `${resourceKey(resource)}${at}`
  }
}

type ComposerReferencesState = {
  references: readonly ComposerReference[]
  add: (reference: ComposerReference) => void
  remove: (key: string) => void
  /** The references for the turn being sent, leaving the composer empty. */
  take: () => readonly ComposerReference[]
}

export const useComposerReferences = create<ComposerReferencesState>()(
  (set, get) => ({
    references: [],
    add: (reference) =>
      set((s) => ({references:[
        ...s.references.filter(existing=>referenceKey(existing)!==referenceKey(reference)),
        reference,
      ]})),
    remove: (key) =>
      set((s) => ({
        references: s.references.filter((r) => referenceKey(r) !== key),
      })),
    take: () => {
      const { references } = get()
      set({ references: [] })
      return references
    },
  }),
)

/** Adds a reference and puts the cursor in the thread's composer. */
export function askAbout(reference: ComposerReference) {
  useComposerReferences.getState().add(reference)
  focusComposer()
}

/**
 * Puts the cursor in the composer the person can see. The conversation
 * stays mounted, hidden, behind other modes, and a page can show it as a
 * module too, so the first composer in the document may not be on screen.
 * Returns whether one was focused.
 */
export function focusComposer(): boolean {
  const composers = document.querySelectorAll<HTMLElement>(
    '.aui-composer-input .ProseMirror',
  )
  for (const composer of composers) {
    const shown =
      typeof composer.checkVisibility === 'function'
        ? composer.checkVisibility()
        : composer.offsetParent !== null
    if (!shown) continue
    composer.focus()
    return true
  }
  return false
}

function referenceLabel({ label, location }: ComposerReference): string {
  if (label) return label
  const { resource } = location
  switch (resource.kind) {
    case 'file':
    case 'delegation-change':
      return resource.path
    case 'delegation':
      return 'Delegated work'
    case 'artifact':
      return 'Artifact'
    case 'message':
      return 'Message'
    case 'run':
      return 'Run'
    case 'graph-object':
      return resource.objectType ?? 'Graph object'
  }
}

/** The references the next message carries, above the composer's input. */
export function ComposerReferences() {
  const references = useComposerReferences((s) => s.references)
  const remove = useComposerReferences((s) => s.remove)
  if (!references.length) return null
  return (
    <ul aria-label="Context" className="flex flex-wrap gap-1.5 px-1 pt-1">
      {references.map((reference) => {
        const key = referenceKey(reference)
        const label = referenceLabel(reference)
        return (
          <li
            key={key}
            className="inline-flex max-w-72 items-center gap-1.5 rounded-md border border-separator bg-raised py-1 ps-2 pe-1 text-xs text-ink-muted"
          >
            <Icon.Link className="size-3 shrink-0" />
            <span className="truncate" title={label}>
              {label}
            </span>
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => remove(key)}
              className="flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              <Icon.X className="size-3" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
