// SOURCING: Base UI Dialog (ui/dialog) for Inspect, TooltipIconButton element for header actions, useCopyToClipboard hook; content renders through artifact-renderers
import type { FC } from 'react'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
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

function download(artifact: TheoremArtifact) {
  const type = artifact.kind === 'document' ? 'text/markdown' : 'text/plain'
  const url = URL.createObjectURL(new Blob([artifact.content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileNameFor(artifact)
  link.click()
  URL.revokeObjectURL(url)
}

export const ArtifactInspect: FC<{ artifact: TheoremArtifact }> = ({
  artifact,
}) => {
  const rows: Array<[string, string | number | undefined]> = [
    ['Artifact', artifact.artifactId],
    ['Revision', artifact.revision],
    ['Patch', artifact.patchSequence],
    ['Kind', artifact.kind],
    ['Renderer', artifact.rendererId],
    ['Contract', artifact.contractVersion],
    ['Lifecycle', artifact.lifecycle],
    ['Payload', artifact.payloadRef],
    ['Run', artifact.runId],
    ['Tool', artifact.sourceTool],
  ]
  return (
    <Dialog>
      <DialogTrigger
        render={
          <TooltipIconButton tooltip="Inspect" className="size-8 p-1.5" />
        }
      >
        <Icon.Eye className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-lg font-normal tracking-tight">
            {artifact.title}
          </DialogTitle>
          <DialogDescription>
            Receipt for this artifact revision.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          {rows
            .filter(([, value]) => value !== undefined)
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ink-faint">{label}</dt>
                <dd
                  className="truncate font-mono text-xs"
                  title={String(value)}
                >
                  {value}
                </dd>
              </div>
            ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
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
            <TooltipIconButton
              tooltip="Previous version"
              className="size-7 p-1.5"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
            >
              <Icon.Previous className="size-3.5" />
            </TooltipIconButton>
            <span className="min-w-12 text-center tabular-nums">
              v{index + 1} of {versions.length}
            </span>
            <TooltipIconButton
              tooltip="Next version"
              className="size-7 p-1.5"
              disabled={index === versions.length - 1}
              onClick={() => goTo(index + 1)}
            >
              <Icon.Next className="size-3.5" />
            </TooltipIconButton>
          </div>
        )}

        <TooltipIconButton
          tooltip={isCopied ? 'Copied' : 'Copy'}
          className="size-8 p-1.5"
          onClick={() => copyToClipboard(artifact.content)}
        >
          {isCopied ? (
            <Icon.Copied className="size-4" />
          ) : (
            <Icon.Copy className="size-4" />
          )}
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Download"
          className="size-8 p-1.5"
          onClick={() => download(artifact)}
        >
          <Icon.Share className="size-4" />
        </TooltipIconButton>
        <ArtifactInspect artifact={artifact} />
        {onExpandedChange && (
          <TooltipIconButton
            tooltip={expanded ? 'Restore layout' : 'Expand'}
            className={cn('size-8 p-1.5', expanded && 'bg-selected')}
            aria-pressed={expanded}
            onClick={() => onExpandedChange(!expanded)}
          >
            <Icon.Expand className="size-4" />
          </TooltipIconButton>
        )}
        <TooltipIconButton
          tooltip="Close"
          className="size-8 p-1.5"
          onClick={onClose}
        >
          <Icon.Close className="size-4" />
        </TooltipIconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-(--spacing-reading) px-6 py-6">
          <ArtifactBody key={artifact.revision} artifact={artifact} />
        </div>
      </div>
    </section>
  )
}
