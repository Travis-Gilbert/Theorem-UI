// SOURCING: coss ui Dialog (Base UI's focus trap, dismissal and portal), vendored in components/ui/dialog.tsx.
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog'
import { transcript as copy } from '@/content'
import { useExperience } from './experience'

/** The film in words, with its credits. Outside the scene, so a camera never moves it. */
export function Transcript() {
  const exp = useExperience()
  return (
    <Dialog open={exp.transcriptOpen} onOpenChange={exp.setTranscriptOpen}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="space-y-2">
            {copy.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <div className="mt-5 space-y-2 border-t border-rule pt-4 text-sm text-muted-ink">
            {copy.credits.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <a
              href={copy.more.href}
              target="_blank"
              rel="noreferrer"
              className="inline-block font-medium text-brass-deep underline underline-offset-3"
            >
              {copy.more.label}
            </a>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}
