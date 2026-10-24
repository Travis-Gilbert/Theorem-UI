// SOURCING: ui/dialog over Base UI Dialog, ui/input and ui/textarea, ./view-renderer (live preview of the program being edited), ./validate (OpenUI's parser), @tanstack/react-query hooks in ./queries for saving and restoring revisions
import { useDeferredValue, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import type { Actor, Binding, IndexView, ViewRevision } from './contract'
import { useCreateView, useRestoreView, useReviseView } from './queries'
import { checkProgram } from './validate'
import { ViewRenderer } from './view-renderer'

const label = 'text-xs font-medium tracking-wide text-ink-faint uppercase'

function parseBindings(text: string): Record<string, Binding> | string {
  try {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return 'Bindings are an object of names to bindings.'
    return value as Record<string, Binding>
  } catch (error) {
    return `Bindings are not JSON: ${(error as Error).message}`
  }
}

/**
 * Edits a view's definition with its preview beside it. A stored view gets a
 * new revision; a built-in view is copied into a view of the person's own, so
 * the built-in stays as it was.
 */
export function ViewEditor({
  view,
  revision,
  onClose,
  onSaved,
}: {
  view: IndexView
  revision: ViewRevision
  onClose: () => void
  onSaved: (view: IndexView) => void
}) {
  const copying = view.origin === 'default'
  const [title, setTitle] = useState(
    copying ? `${revision.title} (mine)` : revision.title,
  )
  const [purpose, setPurpose] = useState(revision.purpose)
  const [program, setProgram] = useState(revision.program)
  const [bindingsText, setBindingsText] = useState(
    JSON.stringify(revision.bindings, null, 2),
  )
  const create = useCreateView()
  const revise = useReviseView()
  const save = copying ? create : revise

  const previewProgram = useDeferredValue(program)
  const parsed = parseBindings(bindingsText)
  const bindings = typeof parsed === 'string' ? undefined : parsed
  const problems = [
    ...(typeof parsed === 'string' ? [parsed] : []),
    ...(bindings ? checkProgram(program, bindings).problems : []),
  ]

  const submit = () => {
    if (!bindings || problems.length || !title.trim()) return
    const draft = {
      title: title.trim(),
      purpose: purpose.trim(),
      program,
      bindings,
      operations: revision.operations,
      note: copying ? `Copied from ${revision.title}.` : 'Edited by hand.',
    }
    const done = { onSuccess: (saved: IndexView) => onSaved(saved) }
    if (copying) create.mutate({ scope: view.scope, draft }, done)
    else
      revise.mutate(
        { viewId: view.viewId, expectedRevision: view.current.revision, draft },
        done,
      )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {copying ? 'Customize this view' : 'Edit this view'}
          </DialogTitle>
          <DialogDescription>
            {copying
              ? 'Saving makes a view of your own. The built-in one stays as it is.'
              : 'Saving adds a revision. Every earlier revision stays in History.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className={label}>Title</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Purpose</span>
              <Input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Program</span>
              <Textarea
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                spellCheck={false}
                aria-invalid={problems.length > 0}
                className="min-h-56 font-mono text-xs leading-5"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={label}>Bindings</span>
              <Textarea
                value={bindingsText}
                onChange={(e) => setBindingsText(e.target.value)}
                spellCheck={false}
                aria-invalid={typeof parsed === 'string'}
                className="min-h-28 font-mono text-xs leading-5"
              />
            </label>
            {problems.length > 0 && (
              <ul
                role="alert"
                className="flex flex-col gap-1 text-xs text-error-ink"
              >
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className={label}>Preview</span>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-separator p-4">
              {bindings && (
                <ViewRenderer
                  definition={{
                    program: previewProgram,
                    bindings,
                    operations: revision.operations,
                  }}
                />
              )}
            </div>
          </div>
        </div>
        {save.error && (
          <p role="alert" className="text-xs text-error-ink">
            {describeError(save.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={save.isPending || problems.length > 0 || !title.trim()}
            onClick={submit}
          >
            {copying ? 'Save as my view' : 'Save revision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const authorText = (author: Actor) =>
  author.kind === 'human'
    ? 'You'
    : author.kind === 'agent'
      ? 'An agent'
      : author.kind === 'engine'
        ? 'Theorem'
        : 'Outside Theorem'

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

/**
 * Every revision of a view, newest first. Restoring adds a new revision equal
 * to the old one: nothing is erased, and the material is never touched.
 */
export function ViewHistory({
  view,
  revisions,
  onClose,
  onRestored,
}: {
  view: IndexView
  revisions: ViewRevision[]
  onClose: () => void
  onRestored: (view: IndexView) => void
}) {
  const ordered = [...revisions].sort((a, b) => b.revision - a.revision)
  const [selected, setSelected] = useState(ordered[0]?.revision)
  const shown = ordered.find((r) => r.revision === selected)
  const restore = useRestoreView()

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>History of {view.current.title}</DialogTitle>
          <DialogDescription>
            Restoring brings an earlier arrangement back as a new revision. Your
            documents and filing stay as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[16rem_1fr]">
          <ol className="flex flex-col gap-0.5">
            {ordered.map((revision) => (
              <li key={revision.revision}>
                <button
                  type="button"
                  onClick={() => setSelected(revision.revision)}
                  aria-current={revision.revision === selected}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-start outline-none hover:bg-hover/60 focus-visible:bg-hover',
                    revision.revision === selected && 'bg-selected',
                  )}
                >
                  <span className="flex w-full items-baseline gap-2 text-sm">
                    <span className="font-medium">
                      Revision {revision.revision}
                    </span>
                    {revision.revision === view.current.revision && (
                      <span className="text-[11px] text-teal-ink">current</span>
                    )}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {authorText(revision.author)} · {when(revision.createdAtMs)}
                  </span>
                  {revision.note && (
                    <span className="line-clamp-2 text-xs text-ink-faint">
                      {revision.restoredFrom !== undefined
                        ? `Restored from revision ${revision.restoredFrom}. `
                        : ''}
                      {revision.note}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
          <div className="min-w-0 rounded-lg border border-separator p-4">
            {shown && <ViewRenderer definition={shown} />}
          </div>
        </div>
        {restore.error && (
          <p role="alert" className="text-xs text-error-ink">
            {describeError(restore.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={
              restore.isPending ||
              !shown ||
              shown.revision === view.current.revision
            }
            onClick={() =>
              shown &&
              restore.mutate(
                {
                  viewId: view.viewId,
                  expectedRevision: view.current.revision,
                  revision: shown.revision,
                },
                { onSuccess: onRestored },
              )
            }
          >
            Restore revision {shown?.revision}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
