// SOURCING: coss ui AlertDialog, the confirm pattern of program/delete-confirm.tsx, ui/button
import { useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/coss/alert-dialog'
import { Button } from '@/components/ui/button'

type ConfirmActionProps = {
  /** The button that asks. */
  label: ReactNode
  ariaLabel?: string
  title: string
  description: ReactNode
  confirmLabel: string
  destructive?: boolean
  disabled?: boolean
  triggerVariant?: ComponentProps<typeof Button>['variant']
  onConfirm: () => void
}

/** A button that does nothing until the person says yes in a dialog that spells out what happens. */
export function ConfirmAction({
  label,
  ariaLabel,
  title,
  description,
  confirmLabel,
  destructive,
  disabled,
  triggerVariant = 'outline',
  onConfirm,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            size="xs"
            variant={triggerVariant}
            aria-label={ariaLabel}
            disabled={disabled}
          />
        }
      >
        {label}
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            Cancel
          </AlertDialogClose>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
