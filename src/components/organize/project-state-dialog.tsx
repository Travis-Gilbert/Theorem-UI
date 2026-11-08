// SOURCING: ui/dialog over Base UI Dialog, ui/textarea, lib/theorem/organization's project state mutation. Where a project stands is the Librarian's to write and a person's to correct, as the state note in docs/plans/thread-organization-and-review.md sets out.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Textarea } from '@/components/coss/textarea'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { describeError } from '@/lib/theorem/client'
import { useProjectState } from '@/lib/theorem/organization'
import type { ProjectEntry } from '@/lib/theorem/organization'

/** A person's word on where a project stands, which the Librarian leaves alone until it is handed back. */
export function ProjectStateDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectEntry
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const save = useProjectState()
  const [text, setText] = useState(project.state?.text ?? '')
  // Each opening starts from where the project stands now, however it was opened.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setText(project.state?.text ?? '')
  }
  const close = () => onOpenChange(false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = text.trim()
    if (next)
      save.mutate(
        { projectId: project.projectId, text: next },
        { onSuccess: close },
      )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Where {project.title} stands</DialogTitle>
            <DialogDescription>
              {project.state?.by === 'agent'
                ? 'The Librarian wrote this. Your version stays until you hand it back.'
                : 'Shown on the project, and given to its threads as context.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            aria-label="Where the project stands"
            className="min-h-32"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {save.error && (
            <p role="alert" className="text-sm text-error-ink">
              {describeError(save.error)}
            </p>
          )}
          <DialogFooter>
            {project.state?.by === 'user' && (
              <Button
                type="button"
                variant="ghost"
                className="me-auto"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(
                    { projectId: project.projectId, text: null },
                    { onSuccess: close },
                  )
                }
              >
                Hand back to the Librarian
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={save.isPending || !text.trim()}
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
