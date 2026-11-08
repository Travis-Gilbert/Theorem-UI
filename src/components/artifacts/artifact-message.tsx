// SOURCING: ui/button and the shared artifact actions; bodies render through
// the registry (artifact-registry resolve + artifact-renderers' mount table).
//
// A result in the conversation: its card, then the artifact at the Preview
// distance. Whether that preview is passive and whether the artifact offers
// a live session here comes from its representation, never from its kind.
import { useAuiState } from '@assistant-ui/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { followArtifact } from '@/components/ide/follow'
import { recordLaunch } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { kindLabel, useThreadArtifacts } from './artifact-model'
import type { TheoremArtifact } from './artifact-model'
import { isLive, representationOf } from './artifact-registry'
import { ArtifactView } from './artifact-renderers'
import { ArtifactActions } from './artifact-actions'
import { useArtifactView } from './artifact-view'

export function ArtifactMessage({ artifact }: { artifact: TheoremArtifact }) {
  const artifacts = useThreadArtifacts()
  const [interacting, setInteracting] = useState(false)
  const { open } = useArtifactView.getState()
  const selected = useArtifactView(
    (s) => s.openId !== undefined && s.openId === artifact.artifactId,
  )
  const { cardRef, launch } = useArtifactLaunch(artifact)

  const versions = artifacts.get(artifact.artifactId) ?? [artifact]
  const position = versions.findIndex((v) => v.revision === artifact.revision)
  const latest = position === versions.length - 1
  const show = () => {
    setInteracting(false)
    launch()
    open(artifact.artifactId, latest ? undefined : artifact.revision)
  }
  // A live session here is offered only when the preview is not one already.
  const interactive =
    isLive(artifact, 'interactive') && !isLive(artifact, 'preview')
  const previewed =
    representationOf(artifact, 'preview').rung !== 'theorem_card'

  return (
    <div className="my-3 w-full">
      <ArtifactMessageCard
        artifact={artifact}
        cardRef={cardRef}
        selected={selected}
        wide={interacting || previewed}
        version={versions.length > 1 ? ` · v${position + 1}` : ''}
        show={show}
        interact={
          interactive
            ? { on: interacting, toggle: () => setInteracting((v) => !v) }
            : undefined
        }
      >
        {interacting ? (
          <div className="p-3" data-slot="inline-app">
            <ArtifactView
              artifact={artifact}
              distance="interactive"
              latest={latest}
            />
          </div>
        ) : (
          previewed && (
            <ArtifactView
              artifact={artifact}
              distance="preview"
              latest={latest}
            />
          )
        )}
      </ArtifactMessageCard>
    </div>
  )
}

function ArtifactMessageCard({
  artifact,
  cardRef,
  selected,
  wide,
  version,
  show,
  interact,
  children,
}: {
  artifact: TheoremArtifact
  cardRef: React.RefObject<HTMLDivElement | null>
  selected: boolean
  wide: boolean
  version: string
  show: () => void
  interact?: { on: boolean; toggle: () => void }
  children?: React.ReactNode
}) {
  return (
    <div
      ref={cardRef}
      data-slot="theorem-artifact-card"
      data-artifact-id={artifact.artifactId}
      data-selected={selected || undefined}
      className={cn(
        'flex w-full flex-col overflow-hidden rounded-artifact border border-separator bg-artifact',
        !wide && 'max-w-md',
        'transition-colors duration-100',
        selected && 'bg-selected outline outline-1 outline-redwood-ink',
      )}
    >
      <div className="flex w-full items-center gap-3 p-4">
        <button
          type="button"
          onClick={show}
          className="flex min-w-0 flex-1 items-center gap-3 text-start"
          aria-label={`Open ${artifact.title}`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-muted">
            <Icon.Artifact className="size-5 animate-float motion-reduce:animate-none" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                'truncate text-sm',
                selected ? 'font-semibold' : 'font-medium',
              )}
            >
              {artifact.title}
            </span>
            <span className="truncate text-xs text-ink-faint">
              {kindLabel(artifact)}
              {version}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {interact && (
            <Button
              size="xs"
              variant={interact.on ? 'secondary' : 'ghost'}
              aria-pressed={interact.on}
              onClick={interact.toggle}
            >
              {interact.on ? 'Done' : 'Interact'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open in larger view"
            className="group/open size-8 p-1.5"
            onClick={show}
          >
            <Icon.Open className="size-4" />
          </Button>
          <ArtifactActions key={artifact.revision} artifact={artifact} />
        </div>
      </div>
      {children && <div className="border-t border-separator">{children}</div>}
    </div>
  )
}

function useArtifactLaunch(artifact: TheoremArtifact) {
  const live = useAuiState((s) => s.message.status?.type === 'running')
  const { artifactId, revision } = artifact
  // Following the Agent opens what it can show without a live session; a live
  // one waits for the person to ask for it.
  const passive = !isLive(artifact, 'thing')
  const cardRef = useRef<HTMLDivElement>(null)
  const launch = useCallback(() => {
    if (cardRef.current)
      recordLaunch(
        cardRef.current.getBoundingClientRect(),
        `artifact:${artifactId}`,
      )
  }, [artifactId])
  useEffect(() => {
    if (!live || !passive) return
    launch()
    followArtifact(artifactId)
  }, [live, artifactId, revision, passive, launch])
  return { cardRef, launch }
}
