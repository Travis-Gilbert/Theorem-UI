// SOURCING: ui/button (ghost icon buttons) for header actions, useCopyToClipboard hook; bodies render through the registry (artifact-renderers' ArtifactView)
import { appearancePair } from '@/lib/appearance-policy'
import { useLayoutEffect, useRef } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { flyGhost, takeLaunch } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { kindLabel, useThreadArtifacts } from './artifact-model'
import type { TheoremArtifact } from './artifact-model'
import { ArtifactActions } from './artifact-actions'
import { ArtifactView } from './artifact-renderers'
import { useArtifactView } from './artifact-view'
import { thingProps } from '@/lib/face/things'

export { download } from './artifact-actions'

export function ArtifactKindIcon({
  kind,
  className,
}: {
  kind: string
  className?: string
}) {
  const Glyph =
    kind === 'code'
      ? Icon.Code
      : kind === 'diagram'
        ? Icon.Diagram
        : Icon.Article
  return <Glyph className={className} />
}
/** Canvas for one artifact: header actions, revision switcher, rendered body. */
export function ArtifactPanel({
  artifactId,
  onClose,
  expanded,
  onExpandedChange,
  className,
}: {
  artifactId: string
  onClose: () => void
  /** Omitted where the canvas cannot expand, as on phones where it is already full screen. */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  className?: string
}) {
  const artifacts = useThreadArtifacts()
  const revision = useArtifactView((s) => s.revisions[artifactId])
  const select = useArtifactView((s) => s.select)
  const sectionRef = useRef<HTMLElement>(null)

  // Opened from a chat card, the canvas grows out of that card. The frame
  // after mount is when the dock or the phone overlay has its final size.
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const origin = takeLaunch(`artifact:${artifactId}`)
      if (origin && sectionRef.current)
        flyGhost(origin, sectionRef.current, {
          className: 'rounded-artifact border border-separator bg-artifact',
        })
    })
    return () => cancelAnimationFrame(frame)
  }, [artifactId])

  const versions = artifacts.get(artifactId)
  if (!versions?.length) return null
  const index = selectedArtifactIndex(versions, revision)
  const newest = versions[versions.length - 1]
  const artifact = versions[index] ?? newest
  if (!artifact || !newest) return null
  const latest = artifact === newest
  const goTo = (next: number) =>
    select(
      artifactId,
      next >= versions.length - 1 ? undefined : versions[next]?.revision,
    )

  return (
    <section
      ref={sectionRef}
      data-appearance-part="artifact"
      data-appearance-radius-role="artifact"
      data-surface-role="artifact"
      {...appearancePair('primary', 'artifact')}
      aria-label={`Artifact: ${artifact.title}`}
      // The whole of what the conversation's card shows an excerpt of: Theo
      // points here while it is open.
      {...thingProps('artifact', artifactId, {
        label: artifact.title,
        whole: true,
      })}
      className={cn('flex h-full min-w-0 flex-col bg-artifact', className)}
    >
      <ArtifactPanelHeader
        artifact={artifact}
        index={index}
        versionCount={versions.length}
        goTo={goTo}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-(--appearance-expanded-measure) px-6 py-6">
          {/* The newest revision stays mounted while an older one is shown,
              so a live session and an unsaved edit outlast a look back. */}
          <div hidden={!latest}>
            <ArtifactView artifact={newest} distance="interactive" latest />
          </div>
          {!latest && (
            <ArtifactView
              key={artifact.revision}
              artifact={artifact}
              distance="interactive"
              latest={false}
            />
          )}
        </div>
      </div>
    </section>
  )
}
function ArtifactPanelHeader({
  artifact,
  index,
  versionCount,
  goTo,
  expanded,
  onExpandedChange,
  onClose,
}: {
  artifact: TheoremArtifact
  index: number
  versionCount: number
  goTo: (index: number) => void
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  onClose: () => void
}) {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-separator px-3">
      <ArtifactKindIcon
        kind={artifact.kind}
        className="size-4 shrink-0 text-ink-muted"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="truncate font-heading text-[16px] font-semibold leading-tight">
          {artifact.title}
        </h2>
        <p className="truncate text-xs text-ink-faint">{kindLabel(artifact)}</p>
      </div>

      {versionCount > 1 && (
        <div className="flex items-center text-xs text-ink-muted">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous version"
            className="size-7 p-1.5"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
          >
            <Icon.Previous className="size-3.5" />
          </Button>
          <span className="min-w-12 text-center tabular-nums">
            v{index + 1} of {versionCount}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next version"
            className="size-7 p-1.5"
            disabled={index === versionCount - 1}
            onClick={() => goTo(index + 1)}
          >
            <Icon.Next className="size-3.5" />
          </Button>
        </div>
      )}

      <ArtifactActions
        key={artifact.revision}
        artifact={artifact}
        latest={index === versionCount - 1}
        copy
      />
      {onExpandedChange && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={expanded ? 'Restore layout' : 'Expand'}
          className={cn('size-8 p-1.5', expanded && 'bg-selected')}
          aria-pressed={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          <Icon.Expand className="size-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Close"
        className="size-8 p-1.5"
        onClick={onClose}
      >
        <Icon.X className="size-4" />
      </Button>
    </header>
  )
}

function selectedArtifactIndex(
  versions: readonly TheoremArtifact[],
  revision?: string,
) {
  return Math.max(
    0,
    revision === undefined
      ? versions.length - 1
      : versions.findIndex((v) => v.revision === revision),
  )
}
