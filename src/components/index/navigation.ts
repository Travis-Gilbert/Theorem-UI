// SOURCING: @tanstack/react-router search params (the open view, item and collection are the /index URL), assistant-ui's composer (Ask Theorem drafts into the conversation, as the IDE frame does), the shell's mode navigation
import { useAui } from '@assistant-ui/react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useOpenMode } from '@/components/shell/modes'
import type { Scope } from './contract'

export type IndexSearch = { view?: string; item?: string; collection?: string }

export function useIndexSearch(): IndexSearch & { scope: Scope } {
  const search = useSearch({ from: '/_chat/index' })
  return {
    ...search,
    scope: search.collection
      ? { kind: 'collection', collectionId: search.collection }
      : { kind: 'home' },
  }
}

export function useIndexNavigate() {
  const navigate = useNavigate()
  const go = (search: (prev: IndexSearch) => IndexSearch) =>
    void navigate({ to: '/index', search })
  return {
    openHome: () => go(() => ({})),
    openCollection: (collection: string) => go(() => ({ collection })),
    /** A view belongs to a scope; opening it keeps the item that is open. */
    openView: (view: string, scope: Scope) =>
      go((prev) => ({
        view,
        item: prev.item,
        collection:
          scope.kind === 'collection' ? scope.collectionId : undefined,
      })),
    openItem: (item: string) => go((prev) => ({ ...prev, item })),
    closeItem: () => go((prev) => ({ ...prev, item: undefined })),
  }
}

/** Ask Theorem: put a question about the material in the composer and go to the conversation. */
export function useAskTheorem() {
  const aui = useAui()
  const openMode = useOpenMode()
  return (
    prompt: string,
    documents: { documentId: string; title?: string }[],
  ) => {
    const listed = documents.map(
      ({ documentId, title }) =>
        `- ${title ? `${title} ` : ''}(document ${documentId})`,
    )
    const text = [prompt, ...(listed.length ? ['', ...listed] : [])].join('\n')
    const draft = aui.composer.getState().text.trimEnd()
    aui.composer.setText(draft ? `${draft}\n\n${text}` : text)
    void openMode('chat')
  }
}
