// SOURCING: Base UI Combobox (inline list with keyboard navigation) inside ui/dialog, useNoteSearch over Theorem Documents list
import { Combobox } from '@base-ui/react/combobox'
import { useDeferredValue, useState } from 'react'
import { Icon } from '@/components/icons'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Theorem } from '@/lib/theorem/client'
import { useNoteSearch } from '@/lib/theorem/notes'

type Doc = Theorem.DocumentSummary

/** Search Theorem documents and pick one. */
export function NotePicker({
  open,
  onOpenChange,
  title,
  onPick,
  exclude,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onPick: (document: Doc) => void
  /** A document to leave out, such as the note being edited. */
  exclude?: string
}) {
  const [query, setQuery] = useState('')
  const search = useNoteSearch(useDeferredValue(query))
  const items = (search.data ?? []).filter((d) => d.documentId !== exclude)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-3 sm:max-w-md">
        <DialogTitle className="px-1 text-sm font-medium">{title}</DialogTitle>
        <Combobox.Root<Doc>
          inline
          open
          items={items}
          filter={null}
          itemToStringLabel={(d) => d.title}
          isItemEqualToValue={(a, b) => a.documentId === b.documentId}
          inputValue={query}
          onInputValueChange={setQuery}
          onValueChange={(doc) => {
            if (!doc) return
            onPick(doc)
            onOpenChange(false)
          }}
        >
          <div className="flex items-center gap-2 rounded-lg border border-control bg-background px-2.5">
            <Icon.Search className="size-4 text-ink-faint" />
            <Combobox.Input
              autoFocus
              placeholder="Search notes"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
          </div>
          <Combobox.Empty className="px-2 py-6 text-center text-sm text-ink-muted empty:hidden">
            {search.isPending ? 'Searching…' : 'No notes match.'}
          </Combobox.Empty>
          <Combobox.List className="max-h-72 overflow-y-auto">
            {(doc: Doc) => (
              <Combobox.Item
                key={doc.documentId}
                value={doc}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-hover"
              >
                <Icon.Article className="size-4 shrink-0 text-ink-faint" />
                <span className="min-w-0 truncate">{doc.title}</span>
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Root>
      </DialogContent>
    </Dialog>
  )
}
