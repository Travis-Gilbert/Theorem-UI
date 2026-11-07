// SOURCING: ui/dialog over Base UI Dialog, the shell's project mutation. Moved from shell/sidebar so the project tree and the Spaces switcher share it.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useCreateProject } from '@/components/shell/projects'
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
import { describeError } from '@/lib/theorem/client'

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (projectId: string) => void
}) {
  const create = useCreateProject()
  const [title, setTitle] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = title.trim()
    if (!next) return
    create.mutate(next, {
      onSuccess: ({ record }) => {
        setTitle('')
        onOpenChange(false)
        onCreated(record.projectId)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium">
              New project
            </DialogTitle>
            <DialogDescription>
              Projects keep related chats together.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Project name"
            placeholder="Project name"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          {create.error && (
            <p role="alert" className="text-sm text-error-ink">
              {describeError(create.error)}
            </p>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={!title.trim() || create.isPending}
              className="bg-redwood text-on-redwood hover:bg-redwood-hover"
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
