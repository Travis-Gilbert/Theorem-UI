// SOURCING: Base UI Combobox (inline list with keyboard navigation) inside ui/dialog, useNoteSearch for the note search
import { Combobox } from '@base-ui/react/combobox'
import { useDeferredValue, useState } from 'react'
import type { ComponentType } from 'react'
import { Icon } from '@/components/icons'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Theorem } from '@/lib/theorem/client'
import { useNoteSearch } from '@/lib/theorem/notes'

type Doc = Theorem.DocumentSummary

/** Search a list and pick one. With `onQueryChange`, the caller does the searching. */
export function ItemPicker<T>({
  open,
  onOpenChange,
  title,
  placeholder,
  items,
  itemKey,
  itemLabel,
  ItemIcon,
  empty,
  query,
  onQueryChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  placeholder: string
  items: readonly T[]
  itemKey: (item: T) => string
  itemLabel: (item: T) => string
  ItemIcon: ComponentType<{ className?: string }>
  empty: string
  query?: string
  onQueryChange?: (query: string) => void
  onPick: (item: T) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-3 sm:max-w-md">
        <DialogTitle className="px-1 text-sm font-medium">{title}</DialogTitle>
        <Combobox.Root<T>
          inline
          open
          items={items as T[]}
          {...(onQueryChange
            ? { filter: null, inputValue: query, onInputValueChange: onQueryChange }
            : {})}
          itemToStringLabel={itemLabel}
          isItemEqualToValue={(a, b) => itemKey(a) === itemKey(b)}
          onValueChange={(item) => {
            if (item === null || item === undefined) return
            onPick(item)
            onOpenChange(false)
          }}
        >
          <div className="flex items-center gap-2 rounded-lg border border-control bg-background px-2">
            <Icon.Search className="size-4 text-ink-faint" />
            <Combobox.Input
              autoFocus
              placeholder={placeholder}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
            />
          </div>
          <Combobox.Empty className="px-2 py-6 text-center text-sm text-ink-muted empty:hidden">
            {empty}
          </Combobox.Empty>
          <Combobox.List className="max-h-72 overflow-y-auto">
            {(item: T) => (
              <Combobox.Item
                key={itemKey(item)}
                value={item}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-highlighted:bg-hover"
              >
                <ItemIcon className="size-4 shrink-0 text-ink-faint" />
                <span className="min-w-0 truncate">{itemLabel(item)}</span>
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Root>
      </DialogContent>
    </Dialog>
  )
}

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
  return (
    <ItemPicker<Doc>
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      placeholder="Search notes"
      items={(search.data ?? []).filter((d) => d.documentId !== exclude)}
      itemKey={(d) => d.documentId}
      itemLabel={(d) => d.title}
      ItemIcon={Icon.Article}
      empty={search.isPending ? 'Searching…' : 'No notes match.'}
      query={query}
      onQueryChange={setQuery}
      onPick={onPick}
    />
  )
}
