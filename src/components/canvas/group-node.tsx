// SOURCING: @xyflow/react custom node, NodeResizer and parentId subflows, coss ui input. Translated from the program canvas's GroupNodeView (program-annotations.tsx).
import { useQueryClient } from '@tanstack/react-query'
import { NodeResizer } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { useState } from 'react'
import { Input } from '@/components/coss/input'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import type { Theorem } from '@/lib/theorem/client'
import { editSpace, removeGroups, upsertGroup } from '@/lib/theorem/spaces'

export type GroupNodeData = { spaceId: string; group: Theorem.SpaceGroup }
export type GroupNode = Node<GroupNodeData, 'frame'>

export function GroupNodeView({ data, selected }: NodeProps<GroupNode>) {
  const queryClient = useQueryClient()
  const { group, spaceId } = data
  const [label, setLabel] = useState(group.label ?? '')
  const [shown, setShown] = useState(group.label)
  if (shown !== group.label) {
    setShown(group.label)
    setLabel(group.label ?? '')
  }
  const commit = () => {
    if (label !== (group.label ?? ''))
      editSpace(
        queryClient,
        spaceId,
        upsertGroup({ ...group, label: label || undefined }),
      )
  }
  return (
    <div
      className="size-full rounded-2xl border border-separator bg-ink/4 data-[selected=true]:border-focus"
      data-selected={selected}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={120}
        lineClassName="!border-focus"
        handleClassName="!size-2 !rounded-sm !border-focus !bg-raised"
      />
      <header className="flex h-9 items-center gap-1 ps-3 pe-1">
        <Input
          unstyled
          aria-label="Group label"
          placeholder="Group"
          className="nodrag nokey min-w-0 flex-1 [&_input]:text-xs [&_input]:font-medium [&_input]:text-ink-muted"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Ungroup"
          title="Ungroup"
          className="nodrag opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 [.react-flow__node:hover_&]:opacity-100"
          onClick={() =>
            editSpace(queryClient, spaceId, removeGroups(new Set([group.id])))
          }
        >
          <Icon.Close className="size-3.5" />
        </Button>
      </header>
    </div>
  )
}
