// SOURCING: coss ui anchored toast, so a refusal appears at the port that was refused.
// The words come from Theorem's verdict.
import {
  AnchoredToastProvider,
  anchoredToastManager,
} from '@/components/coss/toast'
import type { EdgeVerdict } from '@/lib/program/api'

/** Names the column and both shapes when Theorem did. */
export function describeMismatch(verdict: EdgeVerdict) {
  const { mismatch } = verdict
  if (!mismatch) return 'Theorem refused this connection.'
  const shapes = `${mismatch.producer_shape} cannot feed ${mismatch.consumer_shape}`
  const detail = [mismatch.producer_detail, mismatch.consumer_detail]
    .filter((part, index, all) => part && all.indexOf(part) === index)
    .join('; ')
  const reason = detail ? `${shapes}: ${detail}` : shapes
  return mismatch.column ? `Column ${mismatch.column}. ${reason}` : reason
}

export function refuseAt(anchor: Element | null, description: string) {
  anchoredToastManager.add({
    description,
    type: 'error',
    timeout: 8000,
    positionerProps: {
      anchor: anchor ?? document.querySelector('.react-flow'),
      sideOffset: 10,
    },
  })
}

/** The handle xyflow rendered for a port, for a toast to anchor to. */
export const handleElement = (
  nodeId: string,
  handleId: string | null | undefined,
) =>
  document.querySelector(
    `.react-flow__handle[data-nodeid="${CSS.escape(nodeId)}"][data-handleid="${CSS.escape(handleId ?? '')}"]`,
  )

export const ConnectionToasts = () => <AnchoredToastProvider />
