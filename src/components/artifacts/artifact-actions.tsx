// Reuse the canonical AppDocument owner, clipboard hook, and shared action buttons.
import { useState } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { BlockMessage } from '@/components/blocks/block-status'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { appDocumentFor } from '@/lib/theorem/apps'
import { describeError } from '@/lib/theorem/client'
import { fileNameFor } from './artifact-model'
import type { TheoremArtifact } from './artifact-model'

async function sourceFor(artifact: TheoremArtifact): Promise<string> {
  if (artifact.rendererId !== 'theorem-app') return artifact.content
  if (!artifact.documentId)
    throw new Error('The App has no saved document reference.')
  // Re-authorize every action and join the view's save queue. Never fall back to
  // a cached snapshot or an artifact's empty inline placeholder after failure.
  return (await appDocumentFor(artifact.documentId).load()).html
}

/** Download saved App source, or the selected inline artifact revision. */
export async function download(artifact: TheoremArtifact): Promise<void> {
  const content = await sourceFor(artifact)
  if (!content) throw new Error('There is no saved content to download.')
  const type =
    artifact.kind === 'app'
      ? 'text/html'
      : artifact.kind === 'document'
        ? 'text/markdown'
        : 'text/plain'
  const url = URL.createObjectURL(new Blob([content], { type }))
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = fileNameFor(artifact)
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Both the panel and conversation card report action failures in place. */
export function ArtifactActions({
  artifact,
  copy = false,
}: {
  artifact: TheoremArtifact
  copy?: boolean
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const fail = (failure: unknown) =>
    setError(describeError(failure, 'document'))
  const { isCopied, copyToClipboard, resetCopied } = useCopyToClipboard({
    onError: fail,
  })
  const app = artifact.rendererId === 'theorem-app'
  const attempt = async (action: () => Promise<void>) => {
    setError(undefined)
    resetCopied()
    setPending(true)
    try {
      await action()
    } catch (failure) {
      fail(failure)
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {copy && (
        <CopySourceButton
          app={app}
          isCopied={isCopied}
          pending={pending}
          onClick={() =>
            void attempt(async () => copyToClipboard(await sourceFor(artifact)))
          }
        />
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={app ? 'Download App source' : 'Download'}
        title={
          app
            ? 'Download current saved HTML source; saved state is not included'
            : 'Download'
        }
        className="size-8 p-1.5"
        disabled={pending}
        onClick={() => void attempt(() => download(artifact))}
      >
        <Icon.Download className="size-4" />
      </Button>
      {error && <BlockMessage tone="error">{error}</BlockMessage>}
    </div>
  )
}

function CopySourceButton({
  app,
  isCopied,
  pending,
  onClick,
}: {
  app: boolean
  isCopied: boolean
  pending: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isCopied ? 'Copied' : app ? 'Copy App source' : 'Copy'}
      title={app ? 'Copy current saved App source' : 'Copy'}
      className="size-8 p-1.5"
      disabled={pending}
      onClick={onClick}
    >
      {isCopied ? (
        <Icon.Copied className="size-4 animate-in fade-in zoom-in-30 -spin-in-20 ease-lift duration-(--duration-lift)" />
      ) : (
        <Icon.Copy className="size-4 animate-in fade-in zoom-in-75" />
      )}
    </Button>
  )
}
