// SOURCING: the existing HTML App sandbox (hostedAppDocument + BlockFrame,
// `sandbox="allow-scripts"` under a CSP that loads nothing, with followTheme
// keeping the page's look current in it), snapshots.ts for
// the off-screen poster, and the platform IntersectionObserver for whether a
// preview is on screen. No library models a pinned App revision's frame.
//
// A message pins an App revision; its part carries that revision's HTML. These
// frames run exactly that source. Its state starts from the saved document when
// the revision is still the current one, and edits stay in the frame: a pinned
// revision is never a write path to the App.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { BlockFrame, SnapshotFrame } from '@/components/blocks/block-frame'
import { BlockMessage } from '@/components/blocks/block-status'
import { appDeclarations } from '@/components/blocks/html-app-handler'
import type { AppSelection } from '@/lib/blocks/sandbox/protocol'
import { documentAppDatabases } from '@/lib/blocks/app-db'
import { pinnedAppHost, pinnedAppState } from '@/lib/blocks/document-app'
import { followTheme, hostedAppDocument } from '@/lib/blocks/hosted-app'
import { useSnapshot } from '@/lib/blocks/snapshots'
import { appDocumentFor } from '@/lib/theorem/apps'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import type { TheoremArtifact } from './artifact-model'

/** Bumped when the preview renderer changes what it draws; part of the poster key. */
export const APP_PREVIEW_BUILD = 'theorem-app.preview/1'

/** A poster belongs to one revision drawn by one renderer build. */
export const previewKey = (artifact: TheoremArtifact) =>
  `${artifact.documentId ?? artifact.artifactId}@${String(
    artifact.documentPosition ?? artifact.revision,
  )}#${APP_PREVIEW_BUILD}`

/** The saved document's state, when the pinned revision is still the App's current one. */
function useSeed(artifact: TheoremArtifact) {
  const [seed, setSeed] = useState<{ bytes: Uint8Array | null }>()
  const { documentId, documentPosition } = artifact
  useEffect(() => {
    if (!documentId) return
    let active = true
    void appDocumentFor(documentId)
      .load()
      .then(
        (saved) =>
          String(saved.revision.position) === String(documentPosition)
            ? saved.canonical
            : null,
        // The pinned source still renders when the document cannot be read;
        // only its saved state is missing.
        () => null,
      )
      .then((bytes) => {
        if (active) setSeed({ bytes })
      })
    return () => {
      active = false
    }
  }, [documentId, documentPosition])
  // Without a document there is no saved state to start from.
  return documentId ? seed : NO_SEED
}

const NO_SEED = { bytes: null }

/** A preview nobody is operating reaches no network, whatever the App declares. */
const PASSIVE = { net: [] }

function usePage(html: string, interactive: boolean) {
  const [page, setPage] = useState<{ src?: string; error?: string }>({})
  useEffect(() => {
    let active = true
    let url: string | undefined
    void hostedAppDocument(html, undefined, interactive ? {} : PASSIVE).then(
      (document) => {
        if (!active) return
        url = URL.createObjectURL(new Blob([document], { type: 'text/html' }))
        setPage({ src: url })
      },
      (failure) => {
        if (active) setPage({ error: describeError(failure, 'document') })
      },
    )
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [html, interactive])
  return page
}

/** The pinned revision's frame. `interactive` false makes it a picture the person cannot operate. */
export function PinnedAppFrame({
  artifact,
  interactive,
  onSelection,
  className,
}: {
  artifact: TheoremArtifact
  interactive: boolean
  onSelection?: (selection: AppSelection) => void
  className?: string
}) {
  const seed = useSeed(artifact)
  const page = usePage(artifact.content, interactive)
  const [state, setState] = useState<ReturnType<typeof pinnedAppState>>()
  useEffect(() => {
    if (!seed) return
    const pinned = pinnedAppState(seed.bytes)
    let active = true
    void pinned.ready.then(() => {
      if (active) setState(pinned)
    })
    return () => {
      active = false
      pinned.dispose()
    }
  }, [seed])
  // The App's records as they are now, for reading: a saved revision keeps
  // its source, and an App keeps one set of data across revisions.
  const documentId = artifact.documentId ?? artifact.artifactId
  const databases = useMemo(
    () => documentAppDatabases(documentId, { writable: false }),
    [documentId],
  )
  useEffect(() => () => databases.dispose(), [databases])
  const host = useMemo(
    () =>
      state && {
        ...pinnedAppHost(
          artifact.content,
          artifact.documentId ?? artifact.artifactId,
          appDeclarations(artifact.content).capabilities,
          state.state,
          databases,
        ),
        onSelection,
      },
    [
      artifact.content,
      artifact.documentId,
      artifact.artifactId,
      state,
      databases,
      onSelection,
    ],
  )
  if (page.error) return <BlockMessage tone="error">{page.error}</BlockMessage>
  if (!page.src || !host)
    return (
      <p role="status" className="p-4 text-sm text-ink-muted">
        Loading App…
      </p>
    )
  return (
    <div inert={!interactive} className={className}>
      <BlockFrame
        src={page.src}
        host={host}
        title={artifact.title}
        snapshotKey={previewKey(artifact)}
        // The page is built with the look it had then; this keeps it current.
        onConnection={followTheme}
      />
    </div>
  )
}

function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null)
  const [onScreen, setOnScreen] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(Boolean(entry?.isIntersecting)),
      { rootMargin: '200px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, onScreen] as const
}

/** The App's own one-line description, for the preview's accessible name. */
function describedBy(html: string): string | undefined {
  const match =
    /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i.exec(html)
  return match?.[1]?.trim() || undefined
}

/**
 * The inline preview: the pinned revision drawn live while it is on screen,
 * its last poster when it is not. It cannot be operated here; Interact or
 * Open hand it a live session.
 */
export function AppPreview({
  artifact,
  children,
}: {
  artifact: TheoremArtifact
  children?: ReactNode
}) {
  const [ref, onScreen] = useOnScreen<HTMLDivElement>()
  const poster = useSnapshot(previewKey(artifact))
  if (!artifact.content)
    return (
      <p className="p-4 text-sm text-ink-muted">
        {artifact.fallbackText}. Open it to see the App.
      </p>
    )
  const description = describedBy(artifact.content) ?? artifact.fallbackText
  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${artifact.title}: ${description}`}
      data-slot="app-preview"
      className={cn(
        'relative max-h-112 min-h-32 overflow-hidden',
        '[mask-image:linear-gradient(to_bottom,black_85%,transparent)]',
      )}
    >
      {onScreen ? (
        <PinnedAppFrame artifact={artifact} interactive={false} />
      ) : poster ? (
        <div className="h-112">
          <SnapshotFrame html={poster} title={artifact.title} />
        </div>
      ) : null}
      {children}
    </div>
  )
}
