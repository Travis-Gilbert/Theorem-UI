// SOURCING: ui/dialog over Base UI Dialog for the details, assistant-ui's ActionBarMorePrimitive for the menu item, zustand for which reply's details are open (the dialog stands outside the action bar, which unmounts when it hides), lib/theorem/response-styles for the `response_style` part (spec section 8)
import { ActionBarMorePrimitive, useAuiState } from '@assistant-ui/react'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { create } from 'zustand'
import { Icon } from '@/components/icons'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { readResponseStyle } from '@/lib/theorem/response-styles'
import type {
  ResponseStylePart,
  SelectionSource,
  SuggestionCategory,
} from '@/lib/theorem/response-styles'

/** The reply whose details are open. One at a time, so the dialog can stand outside the action bar. */
export const useResponseDetails = create<{
  messageId: string | undefined
  show: (messageId: string | undefined) => void
}>()((set) => ({
  messageId: undefined,
  show: (messageId) => set({ messageId }),
}))

const ORIGIN: Readonly<Record<SelectionSource, string>> = {
  conversation: 'Chosen for this conversation',
  project: "This project's default",
  account: 'Your default',
  builtin: "Theorem's own default",
}

const CATEGORY: Readonly<Record<SuggestionCategory, string>> = {
  framework: 'Framework',
  tool: 'Tool',
  delegation: 'Delegation',
}

/** The one plain line a state of the decision model's answer gets (spec section 6). */
export function suggestionsLine(
  suggestions: NonNullable<ResponseStylePart['suggestions']>,
): string {
  switch (suggestions.state) {
    case 'skipped_no_model':
      return 'No suggestions this turn: no decision model is set.'
    case 'skipped_no_credential':
      return 'No suggestions this turn: the decision model has no key.'
    case 'skipped_disabled':
      return 'No suggestions this turn: you turned them off.'
    case 'suggested': {
      const count = suggestions.items?.length ?? 0
      return `A decision model offered ${count} optional ${count === 1 ? 'suggestion' : 'suggestions'} this turn.`
    }
    case 'empty':
      return 'A decision model looked and found nothing useful this turn.'
    case 'unavailable':
      return `Suggestions were unavailable this turn${suggestions.code ? ` (${suggestions.code})` : ''}.`
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  )
}

/** What a reply was written under: its style and where that came from, the frameworks it loaded, and what suggestions did. */
export function ResponseStyleDetails({ part }: { part: ResponseStylePart }) {
  const { style, frameworks, suggestions } = part
  return (
    <dl className="flex flex-col gap-3">
      <Row label="Style">
        <span className="font-medium">{style.name}</span>
        <span className="block text-xs text-ink-muted">
          {ORIGIN[style.source]}
        </span>
      </Row>
      <Row label="Frameworks">
        {frameworks.length === 0 ? (
          <span className="text-ink-muted">No framework was loaded</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {frameworks.map((framework) => (
              <li key={framework.id}>
                {framework.name}
                {framework.references.length > 0 && (
                  <span className="block text-xs text-ink-muted">
                    References: {framework.references.join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Row>
      {suggestions && (
        <Row label="Suggestions">
          <span>{suggestionsLine(suggestions)}</span>
          {suggestions.state === 'suggested' && suggestions.items && (
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink-muted">
              {suggestions.items.map((item) => (
                <li key={`${item.category}:${item.id}`}>
                  {CATEGORY[item.category]}: {item.name ?? item.id}
                </li>
              ))}
            </ul>
          )}
        </Row>
      )}
    </dl>
  )
}

/** The reply's `response_style` part, if it has one. Select the store's own array: deriving in the selector would loop. */
function useResponseStylePart() {
  const content = useAuiState((s) => s.message.content)
  return useMemo(() => {
    const found = content.findLast(
      (part) => part.type === 'data' && part.name === 'theorem-response_style',
    )
    return found?.type === 'data' ? readResponseStyle(found.data) : undefined
  }, [content])
}

/**
 * "Response details" in a reply's More menu. A reply that carries no
 * `response_style` part (an older one, or a Theorem that does not serve
 * styles) offers nothing, and an ordinary reply shows no routing text.
 */
export function ResponseDetailsItem() {
  const part = useResponseStylePart()
  const messageId = useAuiState((s) => s.message.id)
  const show = useResponseDetails((s) => s.show)
  if (!part) return null
  return (
    <ActionBarMorePrimitive.Item
      className="aui-action-bar-more-item hover:bg-hover focus:bg-hover flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none select-none"
      onSelect={() => show(messageId)}
    >
      <Icon.Eye className="size-4" />
      Response details
    </ActionBarMorePrimitive.Item>
  )
}

/** The details of the reply it is mounted in, open when the menu item asked for them. */
export function ResponseDetailsDialog() {
  const part = useResponseStylePart()
  const messageId = useAuiState((s) => s.message.id)
  const open = useResponseDetails((s) => s.messageId === messageId)
  const show = useResponseDetails((s) => s.show)
  if (!part) return null
  return (
    <Dialog open={open} onOpenChange={(next) => !next && show(undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Response details</DialogTitle>
          <DialogDescription>How Theorem set up this reply.</DialogDescription>
        </DialogHeader>
        <ResponseStyleDetails part={part} />
      </DialogContent>
    </Dialog>
  )
}
