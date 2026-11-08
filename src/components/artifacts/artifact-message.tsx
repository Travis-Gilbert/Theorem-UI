// The message card reuses the canonical App renderer and artifact panel actions.
//
// Beside the chat's dock an artifact opens in its panel; on a page whose
// conversation has no dock beside it (the IDE's), it opens in the message,
// in line with the response, and Open takes it to chat's larger panel.
import { useAuiState } from '@assistant-ui/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { followArtifact } from '@/components/ide/follow'
import { useOpenMode } from '@/components/shell/modes'
import { recordLaunch } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { kindLabel, useThreadArtifacts } from './artifact-model'
import type { TheoremArtifact } from './artifact-model'
import { ArtifactBody } from './artifact-renderers'
import { ArtifactActions } from './artifact-actions'
import { useArtifactView } from './artifact-view'

/**
 * Where a conversation's artifacts open: in the dock's panels beside it, or
 * in the message itself when the conversation has no dock beside it.
 */
export const ArtifactPlacement = createContext<'panel' | 'inline'>('panel')

export function ArtifactMessage({ artifact }: { artifact: TheoremArtifact }) {
  const artifacts = useThreadArtifacts()
  const inline = useContext(ArtifactPlacement) === 'inline'
  const [inlineOpen, setInlineOpen] = useState(inline)
  /** An App runs inline once the person asks; its Run control stays the way in. */
  const [asked, setAsked] = useState(false)
  const isApp = artifact.rendererId === 'theorem-app'
  const { open } = useArtifactView.getState()
  const openMode = useOpenMode()
  const selected = useArtifactView(
    (s) => s.openId !== undefined && s.openId === artifact.artifactId,
  )
  const { cardRef, launch } = useArtifactLaunch(artifact, !inline)

  const versions = artifacts.get(artifact.artifactId) ?? [artifact]
  const position = versions.findIndex((v) => v.revision === artifact.revision)
  const latest = position === versions.length - 1
  const show = () => {
    if (!inline) setInlineOpen(false)
    launch()
    open(artifact.artifactId, latest ? undefined : artifact.revision)
    // The dock is chat's; from a page the larger view is there.
    if (inline) void openMode('chat')
  }
  const toggle = () => {
    setAsked(true)
    setInlineOpen((value) => !value)
  }

  return (
    <div className="my-3 w-full">
      <ArtifactMessageCard
        artifact={artifact}
        cardRef={cardRef}
        selected={selected}
        inlineOpen={inlineOpen}
        isApp={isApp}
        version={versions.length > 1 ? ` · v${position + 1}` : ''}
        expandable={isApp || inline}
        onClick={() => (isApp || inline ? toggle() : show())}
        show={show}
      />
      {inlineOpen && (
        <div
          className="mt-3 rounded-artifact border border-separator p-3"
          data-slot="inline-app"
        >
          <ArtifactBody
            key={artifact.documentId}
            artifact={artifact}
            initiallyRunning={!inline || asked}
          />
        </div>
      )}
    </div>
  )
}

function ArtifactMessageCard({
  artifact,
  cardRef,
  selected,
  inlineOpen,
  isApp,
  expandable,
  version,
  onClick,
  show,
}: {
  artifact: TheoremArtifact
  cardRef: React.RefObject<HTMLDivElement | null>
  selected: boolean
  inlineOpen: boolean
  isApp: boolean
  /** Whether the card opens the artifact in the message rather than in a panel. */
  expandable: boolean
  version: string
  onClick: () => void
  show: () => void
}) {
  return (
    <div
      ref={cardRef}
      data-slot="theorem-artifact-card"
      data-artifact-id={artifact.artifactId}
      data-selected={selected || undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-artifact border border-separator bg-artifact p-4',
        !inlineOpen && 'max-w-md',
        'transition-colors duration-100',
        selected && 'bg-selected outline outline-1 outline-redwood-ink',
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expandable ? inlineOpen : undefined}
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
        <Button
          variant="ghost"
          size="icon"
          aria-label={isApp ? 'Open in larger view' : 'Open'}
          className="group/open size-8 p-1.5"
          onClick={show}
        >
          <Icon.Open className="size-4" />
        </Button>
        <ArtifactActions key={artifact.revision} artifact={artifact} />
      </div>
    </div>
  )
}

/** `follows`: an artifact the working turn writes opens in its panel as it does. */
function useArtifactLaunch(artifact: TheoremArtifact, follows: boolean) {
  const live = useAuiState((s) => s.message.status?.type === 'running')
  const { artifactId, revision, rendererId } = artifact
  const cardRef = useRef<HTMLDivElement>(null)
  const launch = useCallback(() => {
    if (cardRef.current)
      recordLaunch(
        cardRef.current.getBoundingClientRect(),
        `artifact:${artifactId}`,
      )
  }, [artifactId])
  // Apps stay in the chat until clicked; other artifacts keep Follow behavior.
  // Inline, the artifact already shows in the message as it is written.
  useEffect(() => {
    if (!follows || !live || rendererId === 'theorem-app') return
    launch()
    followArtifact(artifactId)
  }, [follows, live, artifactId, revision, rendererId, launch])
  return { cardRef, launch }
}
