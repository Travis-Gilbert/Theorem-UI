// SOURCING: useCopyToClipboard and ui/button; what Copy and Download hand over comes from the registry's sourceOf
import { useState } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { BlockMessage } from '@/components/blocks/block-status'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { describeError } from '@/lib/theorem/client'
import { fileNameFor } from './artifact-model'
import type { TheoremArtifact } from './artifact-model'
import { sourceOf } from './artifact-registry'

/**
 * Download a revision's source: the App as saved now for its newest
 * revision, the pinned source for an older one, the inline text otherwise.
 */
export async function download(
  artifact: TheoremArtifact,
  latest = true,
): Promise<void> {
  const source = sourceOf(artifact, latest)
  // Re-authorize every action; never fall back to a cached snapshot or an
  // empty inline placeholder after a failure.
  const content = await source.load()
  if (!content) throw new Error('There is no saved content to download.')
  const url = URL.createObjectURL(
    new Blob([content], { type: source.mediaType }),
  )
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
  latest = true,
  copy = false,
}: {
  artifact: TheoremArtifact
  /** Whether this is the artifact's newest revision in the thread. */
  latest?: boolean
  copy?: boolean
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const fail = (failure: unknown) =>
    setError(describeError(failure, 'document'))
  const { isCopied, copyToClipboard, resetCopied } = useCopyToClipboard({
    onError: fail,
  })
  const source = sourceOf(artifact, latest)
  const noun = source.noun
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
          noun={noun}
          isCopied={isCopied}
          pending={pending}
          onClick={() =>
            void attempt(async () => copyToClipboard(await source.load()))
          }
        />
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={noun ? `Download ${noun}` : 'Download'}
        title={
          noun
            ? `Download ${latest ? 'current saved' : "this revision's"} source; saved state is not included`
            : 'Download'
        }
        className="size-8 p-1.5"
        disabled={pending}
        onClick={() => void attempt(() => download(artifact, latest))}
      >
        <Icon.Download className="size-4" />
      </Button>
      {error && <BlockMessage tone="error">{error}</BlockMessage>}
    </div>
  )
}

function CopySourceButton({
  noun,
  isCopied,
  pending,
  onClick,
}: {
  noun: string
  isCopied: boolean
  pending: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isCopied ? 'Copied' : noun ? `Copy ${noun}` : 'Copy'}
      title={noun ? `Copy ${noun}` : 'Copy'}
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
