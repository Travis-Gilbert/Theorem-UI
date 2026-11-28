// SOURCING: the note pane's chevron menu (notes/note-actions.tsx NoteMenu) through coss ui Menu, coss AlertDialog for the irreversible step as class-manager's delete does, and the records' useDeleteRecords mutation (the register's delete_one verb, which retires the record and its links in one write)
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/coss/alert-dialog'
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from '@/components/coss/menu'
import { Icon } from '@/components/icons'
import type { ObjectType } from '@/components/records/contract'
import { useDeleteRecords } from '@/components/records/queries'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'

/**
 * A record pane's menu, beside its title as a note's is: delete the object,
 * or close the pane. A record has no Trash, so deleting asks first.
 */
export function RecordMenu({
  type,
  recordId,
  title,
  onClose,
}: {
  type: ObjectType
  recordId: string
  title: string
  onClose: () => void
}) {
  const [asking, setAsking] = useState(false)
  const remove = useDeleteRecords(type)
  const kind = type.label_singular.toLowerCase()
  return (
    <>
      <Menu>
        <MenuTrigger
          aria-label={`${title} options`}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-hover data-popup-open:text-ink"
        >
          <Icon.ChevronDown className="size-3.5" />
        </MenuTrigger>
        <MenuPopup side="bottom" align="start" className="min-w-48">
          <MenuItem onClick={() => setAsking(true)}>
            <Icon.Delete />
            Delete {kind}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={onClose}>
            <Icon.Close />
            Close pane
          </MenuItem>
        </MenuPopup>
      </Menu>
      {asking && (
        <AlertDialog
          open
          onOpenChange={(open) => !open && !remove.isPending && setAsking(false)}
        >
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {title}?</AlertDialogTitle>
              <AlertDialogDescription>
                The {kind} and its links are deleted. This cannot be undone.
              </AlertDialogDescription>
              {remove.error && (
                <p role="alert" className="text-sm wrap-anywhere text-error-ink">
                  {describeError(remove.error)}
                </p>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="ghost" />}>
                Cancel
              </AlertDialogClose>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate([recordId], {
                    onSuccess: () => {
                      setAsking(false)
                      onClose()
                    },
                  })
                }
              >
                {remove.isPending ? 'Deleting…' : `Delete ${kind}`}
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      )}
    </>
  )
}
