// SOURCING: ui/button for the actions; the frame is app-revision-frame's
// PinnedAppFrame (the existing HTML App sandbox). No library models an App's
// saved revision view.
//
// An older revision of an App, as its message pinned it. It runs, so the
// person can see how it behaved, but it is never a write path: edits stay in
// the frame, and asking about it references that revision.
import { useState } from 'react'
import { askAbout } from '@/components/chat/composer-references'
import { Button } from '@/components/ui/button'
import type { AppSelection } from '@/lib/blocks/sandbox/protocol'
import { pinnedAppReference } from '@/lib/theorem/app-references'
import type { TheoremArtifact } from './artifact-model'
import { PinnedAppFrame } from './app-revision-frame'
import { useArtifactView } from './artifact-view'

export function AppRevision({ artifact }: { artifact: TheoremArtifact }) {
  const [selection, setSelection] = useState<AppSelection>()
  const select = useArtifactView((s) => s.select)
  const position = String(artifact.documentPosition ?? artifact.revision)
  const openLatest = () => select(artifact.artifactId, undefined)
  return (
    <section
      aria-label={`${artifact.title}, revision ${position}`}
      data-revision={position}
      data-slot="app-revision"
      className="flex flex-col gap-3"
    >
      <div
        role="status"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-separator bg-raised px-3 py-2 text-sm"
      >
        <span className="min-w-0 flex-1 text-ink-muted">
          Saved revision {position}. Changes you make here are not saved.
        </span>
        {artifact.documentId && artifact.content && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              askAbout(
                pinnedAppReference(
                  {
                    documentId: artifact.documentId!,
                    title: artifact.title,
                    position,
                  },
                  selection,
                ),
              )
            }
          >
            {selection?.entityLabel || selection?.text
              ? 'Ask about selection'
              : 'Ask about this revision'}
          </Button>
        )}
        <Button size="xs" variant="secondary" onClick={openLatest}>
          Open latest
        </Button>
      </div>
      {artifact.content ? (
        <PinnedAppFrame
          artifact={artifact}
          interactive
          onSelection={setSelection}
        />
      ) : (
        <p className="text-sm text-ink-muted">
          This revision's source isn't part of the conversation. Open the latest
          revision to see the App.
        </p>
      )}
    </section>
  )
}
