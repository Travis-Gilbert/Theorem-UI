// SOURCING: coss ui Input, Textarea and AlertDialog (labelled with a plain label and an explicit id), @tanstack/react-router useBlocker, ui/button; the shared pieces of the style and framework editors
import { useBlocker } from '@tanstack/react-router'
import { useId } from 'react'
import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/coss/alert-dialog'
import { Input } from '@/components/coss/input'
import { Textarea } from '@/components/coss/textarea'
import { Button } from '@/components/ui/button'
import { ConfirmAction } from './confirm-action'

/** One labelled text control: a line, or a block of text that grows with what is in it. */
export function TextField({
  label,
  hint,
  value,
  onChange,
  multiline,
  tall,
  readOnly,
}: {
  label: string
  hint?: ReactNode
  value: string
  onChange: (next: string) => void
  multiline?: boolean
  tall?: boolean
  /** The text cannot be changed for now; it keeps its focus and can still be read and copied. */
  readOnly?: boolean
}) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          readOnly={readOnly}
          aria-describedby={hint ? hintId : undefined}
          className={tall ? '[&_textarea]:min-h-64' : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          value={value}
          readOnly={readOnly}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

/** A titled block inside an editor. */
export function EditorSection({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-separator pt-5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** Back to the list; a dialog stands in the way while there is unsaved text. */
export function BackButton({
  label,
  dirty,
  onBack,
}: {
  label: string
  dirty: boolean
  onBack: () => void
}) {
  return dirty ? (
    <ConfirmAction
      label={label}
      triggerVariant="ghost"
      title="Leave without saving?"
      description="You have changes that are not saved. Leaving drops them."
      confirmLabel="Leave without saving"
      destructive
      onConfirm={onBack}
    />
  ) : (
    <Button size="xs" variant="ghost" onClick={onBack}>
      {label}
    </Button>
  )
}

/**
 * Stands in the way of leaving the page (a settings link, the browser's back
 * button) while there is unsaved text, and asks. Closing the tab asks in the
 * browser's own words.
 */
export function LeaveGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  })
  return (
    <AlertDialog
      open={blocker.status === 'blocked'}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.()
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave this page without saving?</AlertDialogTitle>
          <AlertDialogDescription>
            You have changes that are not saved. Leaving drops them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            Stay on this page
          </AlertDialogClose>
          <Button variant="destructive" onClick={() => blocker.proceed?.()}>
            Leave without saving
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}

/** Save and discard, and one line saying where the text stands. Nothing saves on its own. */
export function SaveBar({
  dirty,
  saving,
  canSave,
  problem,
  savedAs,
  saveLabel = 'Save',
  onSave,
  onDiscard,
}: {
  dirty: boolean
  saving: boolean
  canSave: boolean
  /** Why Save is unavailable, in words. */
  problem?: string
  savedAs?: number
  saveLabel?: string
  onSave: () => void
  onDiscard: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={!dirty || !canSave || saving} onClick={onSave}>
        {saving ? 'Saving' : saveLabel}
      </Button>
      <Button variant="outline" disabled={!dirty || saving} onClick={onDiscard}>
        Discard changes
      </Button>
      <span role="status" className="text-sm text-ink-muted">
        {dirty
          ? `Unsaved changes${problem ? `. ${problem}` : ''}`
          : savedAs !== undefined
            ? `Saved as revision ${savedAs}.`
            : 'No unsaved changes.'}
      </span>
    </div>
  )
}
