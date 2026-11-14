// SOURCING: ui/dialog over Base UI Dialog, zustand for the opener (a row's menu has closed by the time the dialog opens, so the dialog lives once beside the sidebar), lib/theorem/sidebar-prefs for the types.
//
// A person's own session type: a name and one of the marks. It is chosen for
// the session that asked for it. Appearance only: a type grants no capability
// and starts no run.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { create } from 'zustand'
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
import { TYPE_MARKS, useSidebarPrefs } from '@/lib/theorem/sidebar-prefs'
import type { TypeMark } from '@/lib/theorem/sidebar-prefs'
import { cn } from '@/lib/utils'
import { TYPE_MARK_LABEL, TypeMarkIcon } from './glyphs'

export const useNewTypeDialog = create<{
  /** The session the new type is for; undefined while closed. */
  forThread: string | undefined
  isOpen: boolean
  open: (threadId?: string) => void
  close: () => void
}>()((set) => ({
  forThread: undefined,
  isOpen: false,
  open: (forThread) => set({ isOpen: true, forThread }),
  close: () => set({ isOpen: false, forThread: undefined }),
}))

export function SessionTypeDialog() {
  const { isOpen, forThread, close } = useNewTypeDialog()
  const addType = useSidebarPrefs((s) => s.addType)
  const setType = useSidebarPrefs((s) => s.setSessionType)
  const [label, setLabel] = useState('')
  const [mark, setMark] = useState<TypeMark>('document')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const name = label.trim()
    if (!name) return
    const id = addType({ label: name, mark })
    if (forThread) setType(forThread, id)
    setLabel('')
    setMark('document')
    close()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-semibold">
              New session type
            </DialogTitle>
            <DialogDescription>
              A name and a mark for sessions like this one. It changes how they
              look, not what they can do.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Type name"
            placeholder="Research, Review, Writing…"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm text-ink-muted">Mark</legend>
            <div className="grid grid-cols-4 gap-2">
              {TYPE_MARKS.map((option) => (
                <label
                  key={option}
                  title={TYPE_MARK_LABEL[option]}
                  className={cn(
                    'flex h-10 cursor-pointer items-center justify-center rounded-lg ring-1 ring-separator hover:bg-hover has-focus-visible:outline-2 has-focus-visible:outline-focus',
                    mark === option && 'bg-selected ring-focus',
                  )}
                >
                  <input
                    type="radio"
                    name="mark"
                    value={option}
                    checked={mark === option}
                    onChange={() => setMark(option)}
                    className="sr-only"
                    aria-label={TYPE_MARK_LABEL[option]}
                  />
                  <TypeMarkIcon mark={option} className="size-5" />
                </label>
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="submit" disabled={!label.trim()}>
              Add type
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
