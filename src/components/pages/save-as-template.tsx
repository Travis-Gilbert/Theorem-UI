// SOURCING: ui/dialog over Base UI Dialog, the module store's
// useSaveTemplate (a template is a page file in the vault's Templates
// folder, written under a free name, never over another file).
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { PageDocument } from '@/lib/modules/contract'
import { useSaveTemplate } from '@/lib/modules/store'
import type { WorkspaceClient } from '@/lib/workspace/types'

/** Saves the page as it is on screen as a template New page offers. */
export function SaveAsTemplate({
  client,
  page,
}: {
  client: WorkspaceClient
  page: PageDocument
}) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<string>()
  return (
    <>
      {saved && (
        <span role="status" className="text-xs text-ink-muted">
          Saved to {saved}
        </span>
      )}
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          setSaved(undefined)
          setOpen(true)
        }}
      >
        Save as template
      </Button>
      {open && (
        <SaveDialog
          client={client}
          page={page}
          onClose={() => setOpen(false)}
          onSaved={setSaved}
        />
      )}
    </>
  )
}

function SaveDialog({
  client,
  page,
  onClose,
  onSaved,
}: {
  client: WorkspaceClient
  page: PageDocument
  onClose: () => void
  onSaved: (path: string) => void
}) {
  const save = useSaveTemplate(client)
  const [title, setTitle] = useState(page.title)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const name = title.trim()
    if (!name) return
    save.mutate(
      { ...page, title: name },
      {
        onSuccess: (path) => {
          onSaved(path)
          onClose()
        },
      },
    )
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-semibold">
              Save as template
            </DialogTitle>
            <DialogDescription>
              The page's arrangement and connections, as they are on screen, go
              to the vault's Templates folder. New page offers it from then on.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Template name"
            placeholder="Template name"
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          {save.error && (
            <p role="alert" className="text-sm text-error-ink">
              {save.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={!title.trim() || save.isPending}
              className="bg-redwood text-on-redwood hover:bg-redwood-hover"
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
