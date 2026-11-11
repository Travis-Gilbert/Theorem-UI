// SOURCING: @xyflow/react custom node, useSpaceRecord for the inner canvas's title, space-preview for what it holds
import type { Node, NodeProps } from '@xyflow/react'
import { useSpaceRecord } from '@/lib/theorem/spaces'
import { NODE_BOX, NodeChrome } from './node-chrome'
import { SpacePreview } from './space-preview'

export type SpaceNodeData = { spaceId: string; label?: string }
export type SpaceNode = Node<SpaceNodeData, 'space'>

export const FALLBACK_CANVAS_TITLE = 'Untitled canvas'

/** A canvas inside this one. Double-clicking goes in. */
export function SpaceNodeView({ id, data, selected }: NodeProps<SpaceNode>) {
  const title = data.label ?? FALLBACK_CANVAS_TITLE
  const record = useSpaceRecord({ kind: 'custom', spaceId: data.spaceId, title })
  return (
    <NodeChrome
      id={id}
      selected={selected}
      title={record.data?.space.title ?? title}
    >
      <div className={NODE_BOX}>
        <SpacePreview
          spaceId={data.spaceId}
          title={title}
          className="size-full p-2"
        />
      </div>
    </NodeChrome>
  )
}
