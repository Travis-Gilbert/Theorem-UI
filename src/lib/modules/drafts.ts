// SOURCING: zustand (a store outside any view, as file-sync.ts keeps text
// files' drafts), and the browser's beforeunload prompt for an edited form.
// The desktop quit check reads it through reportUnsaved (desktop/unsaved.ts).
import { create } from 'zustand'
import type { PageDocument } from './contract'

/** An unsaved arrangement, and the revision it was made over. */
export interface PageDraft {
  held: { hash: string | null; page: PageDocument }
  draft: PageDocument
}

/**
 * Pages' unsaved arrangements, by the page they belong to. A page's view
 * can go (another page opened, another mode) while its draft stays here,
 * to be shown again when the page is.
 */
export const usePageDrafts = create<{
  drafts: Record<string, PageDraft>
  keep: (key: string, draft: PageDraft | undefined) => void
}>()((set) => ({
  drafts: {},
  keep: (key, draft) => {
    if (draft) watchUnload()
    set((state) => {
      if (state.drafts[key] === draft) return state
      const drafts = { ...state.drafts }
      if (draft) drafts[key] = draft
      else delete drafts[key]
      return { drafts }
    })
  },
}))

/** Whether any page has an arrangement the vault does not. */
export const pagesUnsaved = () =>
  Object.keys(usePageDrafts.getState().drafts).length > 0

let watching = false

/** Leaving the app with an unsaved page asks first. */
function watchUnload() {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.addEventListener('beforeunload', (event) => {
    if (pagesUnsaved()) event.preventDefault()
  })
}
