// SOURCING: coss ui AlertDialog over xyflow's onBeforeDelete; zustand holds the one
// pending answer, since the promise xyflow waits on is settled from this dialog.
import { create } from 'zustand'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/coss/alert-dialog'
import { Button } from '@/components/ui/button'

export const useDeleteConfirm = create<{
  ports: Array<string> | undefined
  answer: ((go: boolean) => void) | undefined
  ask: (ports: Array<string>) => Promise<boolean>
}>((set) => ({
  ports: undefined,
  answer: undefined,
  ask: (ports) =>
    new Promise((resolve) => {
      set({
        ports,
        answer: (go) => {
          set({ ports: undefined, answer: undefined })
          resolve(go)
        },
      })
    }),
}))

export function DeleteConfirm() {
  const { ports, answer } = useDeleteConfirm()
  return (
    <AlertDialog
      open={Boolean(ports)}
      onOpenChange={(open) => {
        if (!open) answer?.(false)
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave these inputs unfed?</AlertDialogTitle>
          <AlertDialogDescription>
            Nothing else feeds {ports?.join(', ')}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            Keep
          </AlertDialogClose>
          <Button variant="destructive" onClick={() => answer?.(true)}>
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
