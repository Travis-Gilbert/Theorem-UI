// SOURCING: ui/button (ghost icon buttons) for header actions, useCopyToClipboard hook; content renders through artifact-renderers
import { useLayoutEffect, useRef } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { flyGhost, takeLaunch } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { fileNameFor, kindLabel, useThreadArtifacts } from './artifact-model'
import type { TheoremArtifact } from './artifact-model'
import { ArtifactBody } from './artifact-renderers'
import { useArtifactView } from './artifact-view'

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

/** Saves the artifact revision as a file. */
export function download(artifact: TheoremArtifact) {
  const type = artifact.kind === 'document' ? 'text/markdown' : 'text/plain'
  const url = URL.createObjectURL(new Blob([artifact.content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileNameFor(artifact)
  link.click()
  URL.revokeObjectURL(url)
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
  const { isCopied, copyToClipboard } = useCopyToClipboard()
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
  const index = Math.max(
    0,
    revision === undefined
      ? versions.length - 1
      : versions.findIndex((v) => v.revision === revision),
  )
  const artifact = versions[index] ?? versions[versions.length - 1]
  if (!artifact) return null
  const goTo = (next: number) =>
    select(
      artifactId,
      next >= versions.length - 1 ? undefined : versions[next]?.revision,
    )

  return (
    <section
      ref={sectionRef}
      aria-label={`Artifact: ${artifact.title}`}
      className={cn('flex h-full min-w-0 flex-col bg-artifact', className)}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-separator px-3">
        <ArtifactKindIcon
          kind={artifact.kind}
          className="size-4 shrink-0 text-ink-muted"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate font-heading text-[16px] font-normal leading-tight tracking-tight">
            {artifact.title}
          </h2>
          <p className="truncate text-xs text-ink-faint">
            {kindLabel(artifact)}
          </p>
        </div>

        {versions.length > 1 && (
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
              v{index + 1} of {versions.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next version"
              className="size-7 p-1.5"
              disabled={index === versions.length - 1}
              onClick={() => goTo(index + 1)}
            >
              <Icon.Next className="size-3.5" />
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          aria-label={isCopied ? 'Copied' : 'Copy'}
          className="size-8 p-1.5"
          onClick={() => copyToClipboard(artifact.content)}
        >
          {isCopied ? (
            <Icon.Copied className="size-4 animate-in fade-in zoom-in-30 -spin-in-20 ease-lift duration-(--duration-lift)" />
          ) : (
            <Icon.Copy className="size-4 animate-in fade-in zoom-in-75" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Download"
          className="size-8 p-1.5"
          onClick={() => download(artifact)}
        >
          <Icon.Download className="size-4" />
        </Button>
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-(--spacing-reading) px-6 py-6">
          <ArtifactBody key={artifact.revision} artifact={artifact} />
        </div>
      </div>
    </section>
  )
}
