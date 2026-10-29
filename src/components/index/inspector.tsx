// SOURCING: Base UI Menu (move to a collection), the artifact panel's MarkdownDocument (react-markdown + remark-gfm), TooltipIconButton, @tanstack/react-query hooks in ./queries for the document, its filing receipts and what it is used with
import { Menu } from '@base-ui/react/menu'
import { useState } from 'react'
import { MarkdownDocument } from '@/components/artifacts/artifact-renderers'
import { TooltipIconButton } from '@/components/assistant-ui/elements/tooltip-icon-button'
import { Icon } from '@/components/icons'
import { menuItem, menuPopup } from '@/components/shell/sidebar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import type { FilingAttribution, FilingReceipt, Scope } from './contract'
import { useAskTheorem } from './navigation'
import { observer } from './observe'
import {
  useBinding,
  useCollections,
  useCorrectFiling,
  useDocument,
  useFileDocument,
  useFilings,
  useSetPreference,
  useUndoCorrection,
} from './queries'

const TIER_TEXT: Record<FilingReceipt['tier'], string> = {
  precedent: 'Filed the way a similar document was filed before.',
  learned: 'Filed by what Theorem has learned from earlier filing.',
  escalated: "Filed by Theorem's model, because nothing simpler was sure.",
}

function attributionText(attribution: FilingAttribution) {
  switch (attribution.kind) {
    case 'precedent':
      return `Follows document ${attribution.referenceId}.`
    case 'rule':
      return `By the filing rule ${attribution.ruleId}.`
    case 'features': {
      const top = Object.entries(attribution.features)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([feature]) => feature.replaceAll('_', ' '))
      return top.length ? `Mostly from ${top.join(', ')}.` : undefined
    }
    case 'model':
      return attribution.reason
    case 'correction':
      return attribution.actor.kind === 'human'
        ? 'Moved here by a person; Theorem learns from that.'
        : `Moved here by ${attribution.actor.kind === 'agent' ? 'an agent' : 'Theorem'}.`
  }
}

/** Where the document is filed, why, how sure Theorem was, and the way to change it. */
function Filing({
  documentId,
  revision,
  scope,
}: {
  documentId: string
  revision: { position: number; contentDigest: string }
  scope: Scope
}) {
  const filings = useFilings(documentId)
  const collections = useCollections()
  const file = useFileDocument()
  const correct = useCorrectFiling()
  const undo = useUndoCorrection()

  const name = (collectionId: string) =>
    collections.data?.find((c) => c.collectionId === collectionId)?.name ??
    collectionId
  const latest = filings.data?.reduce<FilingReceipt | undefined>(
    (best, receipt) =>
      !best || receipt.generation > best.generation ? receipt : best,
    undefined,
  )
  // Read from the receipt, so a move can still be undone after a reload.
  const undoable =
    latest?.attribution.kind === 'correction' && !latest.attribution.undo
      ? latest.attribution.correctionId
      : undefined
  const error = file.error ?? correct.error ?? undo.error ?? filings.error

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
        Filing
      </h3>
      {filings.isPending ? (
        <Skeleton className="h-14 w-full" />
      ) : latest ? (
        <div className="flex flex-col gap-2 rounded-lg border border-separator p-3">
          <p className="text-sm">
            In{' '}
            <span className="font-medium">
              {name(latest.destinationCollectionId)}
            </span>
          </p>
          <p className="text-xs leading-5 text-ink-muted">
            {TIER_TEXT[latest.tier]} {attributionText(latest.attribution)}
          </p>
          <div className="flex items-center gap-2">
            <div
              role="meter"
              aria-label="Confidence"
              aria-valuenow={Math.round(latest.confidence * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover"
            >
              <div
                className={cn(
                  'h-full rounded-full',
                  latest.lowConfidence ? 'bg-ochre' : 'bg-teal',
                )}
                style={{ width: `${Math.round(latest.confidence * 100)}%` }}
              />
            </div>
            <span className="text-xs text-ink-faint tabular-nums">
              {Math.round(latest.confidence * 100)}%
            </span>
          </div>
          {latest.lowConfidence && (
            <p className="text-xs text-ink-muted">
              Theorem was not sure about this one. Move it if it belongs
              elsewhere.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Menu.Root>
              <Menu.Trigger
                render={<Button variant="outline" size="sm" />}
                disabled={correct.isPending}
              >
                Move to…
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner
                  side="bottom"
                  align="start"
                  sideOffset={4}
                  className="z-50"
                >
                  <Menu.Popup
                    className={`max-h-72 min-w-48 overflow-y-auto ${menuPopup}`}
                  >
                    {collections.data
                      ?.filter(
                        (c) =>
                          c.collectionId !== latest.destinationCollectionId,
                      )
                      .map((collection) => (
                        <Menu.Item
                          key={collection.collectionId}
                          className={menuItem}
                          onClick={() =>
                            correct.mutate(
                              {
                                receiptId: latest.receiptId,
                                destinationCollectionId:
                                  collection.collectionId,
                              },
                              {
                                onSuccess: (receipt) => {
                                  observer().record({
                                    kind: 'filing_corrected',
                                    scope,
                                    subjects: [documentId],
                                    detail: {
                                      from: receipt.fromCollectionId,
                                      to: receipt.toCollectionId,
                                    },
                                  })
                                },
                              },
                            )
                          }
                        >
                          <span className="truncate">{collection.name}</span>
                        </Menu.Item>
                      ))}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            {undoable && (
              <Button
                variant="ghost"
                size="sm"
                disabled={undo.isPending}
                onClick={() => undo.mutate(undoable)}
              >
                Undo move to {name(latest.destinationCollectionId)}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-separator p-3">
          <p className="min-w-0 flex-1 text-sm text-ink-muted">
            Not filed yet.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={file.isPending}
            onClick={() =>
              file.mutate(
                { documentId, revision },
                {
                  onSuccess: (receipt) =>
                    observer().record({
                      kind: 'item_filed',
                      scope,
                      subjects: [documentId],
                      detail: { to: receipt.destinationCollectionId },
                    }),
                },
              )
            }
          >
            File it
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-error-ink">
          {describeError(error)}
        </p>
      ) : null}
    </section>
  )
}

/** Documents opened alongside this one. Usage, not likeness: the Atlas shows likeness. */
function UsedWith({
  documentId,
  scope,
  onOpen,
}: {
  documentId: string
  scope: Scope
  onOpen: (documentId: string) => void
}) {
  const used = useBinding({
    kind: 'used_together',
    anchorIds: [documentId],
    limit: 8,
  })
  const prefer = useSetPreference()
  const [answered, setAnswered] = useState<Record<string, string>>({})
  const items = used.data?.kind === 'used_together' ? used.data.items : []
  if (!used.isPending && !items.length) return null

  const say = (other: string, statement: 'belong_together' | 'not_together') =>
    prefer.mutate(
      { scope, statement, subjects: [documentId, other] },
      {
        onSuccess: () =>
          setAnswered((prev) => ({
            ...prev,
            [other]:
              statement === 'belong_together' ? 'Kept together' : 'Kept apart',
          })),
      },
    )

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
        Used with
      </h3>
      {used.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.documentId} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpen(item.documentId)}
                className="flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-2 py-1.5 text-start text-sm outline-none hover:bg-hover/60 focus-visible:bg-hover"
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="shrink-0 text-[11px] text-ink-faint tabular-nums">
                  {item.sessions === 1 ? 'once' : `${item.sessions} times`}
                </span>
              </button>
              {answered[item.documentId] ? (
                <span className="px-1 text-[11px] text-ink-faint">
                  {answered[item.documentId]}
                </span>
              ) : (
                <span className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => say(item.documentId, 'belong_together')}
                  >
                    Together
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => say(item.documentId, 'not_together')}
                  >
                    Apart
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The working pane: the selected document, where it is filed and why, what it
 * is used with, and Ask Theorem. It does more than preview: filing, moving and
 * undoing happen here.
 */
export function Inspector({
  documentId,
  scope,
  onOpen,
  onClose,
  className,
}: {
  documentId: string
  scope: Scope
  onOpen: (documentId: string) => void
  onClose: () => void
  className?: string
}) {
  const document = useDocument(documentId)
  const ask = useAskTheorem()
  const summary = document.data?.summary

  return (
    <aside
      aria-label="Selected document"
      className={cn('flex h-full flex-col bg-sheet', className)}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-separator ps-4 pe-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
          {summary?.title ?? 'Document'}
        </h2>
        <TooltipIconButton
          tooltip="Close"
          className="size-8 p-2"
          onClick={onClose}
        >
          <Icon.Close className="size-4" />
        </TooltipIconButton>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        {document.error ? (
          <p role="alert" className="text-sm text-error-ink">
            {describeError(document.error)}
          </p>
        ) : !summary ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
              <span>{summary.documentKind}</span>
              {summary.readOnly && <span>· read only</span>}
              <Button
                variant="outline"
                size="sm"
                className="ms-auto"
                onClick={() =>
                  ask(`About "${summary.title}":`, [
                    { documentId, title: summary.title },
                  ])
                }
              >
                <Icon.Chat className="size-3.5" />
                Ask Theorem
              </Button>
            </div>
            {/* Keyed so one document's failed or unfinished write never shows on another. */}
            <Filing
              key={documentId}
              documentId={documentId}
              revision={summary.revision}
              scope={scope}
            />
            {/* Keyed so answers given for one document never show on another. */}
            <UsedWith
              key={documentId}
              documentId={documentId}
              scope={scope}
              onOpen={onOpen}
            />
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                Content
              </h3>
              <MarkdownDocument
                content={document.data!.markdownProjection}
                className="text-sm leading-6"
              />
            </section>
          </>
        )}
      </div>
    </aside>
  )
}
