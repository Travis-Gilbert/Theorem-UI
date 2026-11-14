// The same appearance form in a Base UI dialog keeps the active conversation,
// editor and runtime mounted while preferences change.
import { lazy, Suspense } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Icon } from '@/components/icons'

const Settings = lazy(() =>
  import('@/routes/settings/appearance').then((module) => ({
    default: module.AppearanceSettings,
  })),
)

export function AppearanceDialog() {
  return (
    <Dialog>
      <DialogTrigger
        aria-label="Appearance"
        className="appearance-quick-trigger flex min-h-8 min-w-8 items-center justify-center rounded-md text-ink-muted hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Icon.Sun className="size-4" />
      </DialogTrigger>
      <DialogContent
        data-appearance-part="popover"
        className="appearance-settings-dialog max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
      >
        <DialogTitle className="sr-only">Appearance settings</DialogTitle>
        <div className="flex min-w-0 flex-col gap-6 pt-6">
          <Suspense
            fallback={<p role="status">Loading appearance settings…</p>}
          >
            <Settings />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  )
}
