// SOURCING: React Flow UI BaseNode and LabeledHandle, reskinned, over @xyflow/react
// NodeProps and useUpdateNodeInternals. There is one node view, driven by the
// definition and its contract (SPEC-PROGRAM-CANVAS law: no per-kind component). Kinds
// differ by silhouette and glyph, never by hue.
import { useMutation, useQuery } from '@tanstack/react-query'
import { Position, useUpdateNodeInternals } from '@xyflow/react'
import { memo, useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { ReactNode } from 'react'
import { BaseHandle } from '@/components/base-handle'
import { Badge } from '@/components/coss/badge'
import { Button } from '@/components/ui/button'
import {
  BaseNode,
  BaseNodeContent,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
} from '@/components/base-node'
import { Icon, ProgramKindMark, PortClassMark } from '@/components/icons'
import {
  DatabaseSchemaNodeBody,
  DatabaseSchemaTableCell,
  DatabaseSchemaTableRow,
} from '@/components/database-schema-node'
import { LabeledHandle } from '@/components/labeled-handle'
import { cn } from '@/lib/utils'
import {
  listTables,
  programInterior,
  programKeys,
  tableColumns,
} from '@/lib/program/api'
import {
  PORT_COLOR,
  inputHandle,
  outputHandle,
  portClass,
} from '@/lib/program/flow'
import type { ProgramFlowNode } from '@/lib/program/flow'
import type {
  FieldType,
  ProcessLiveness,
  ProgramNode,
  ProgramPort,
} from '@/lib/program/contracts'
import { declaredParameters } from '@/lib/program/parameters'
import { AFFORDANCE_BLOCK, useProgramDoc } from '@/lib/program/store'
import { describeError } from '@/lib/theorem/client'
import { ComboControl, ParameterWidgets } from './parameter-widgets'

/** Silhouette per kind: the shape reads at any zoom, and without color. */
const SILHOUETTE: Record<string, string> = {
  external_endpoint: 'rounded-sm border-2',
  source: 'rounded-l-[20px] rounded-r-lg',
  sentinel: 'rounded-lg border-dotted border-2',
  rule: 'rounded-sm',
  stochastic: 'rounded-lg border-dashed',
  verify: 'rounded-lg border-double border-4',
  fold: 'rounded-lg border-x-4',
  human_input: 'rounded-2xl',
  sink: 'rounded-r-[20px] rounded-l-lg',
  compound:
    'rounded-lg shadow-[4px_4px_0_-1px_var(--surface-raised),4px_4px_0_0_var(--line-separator)]',
  view: 'rounded-t-2xl rounded-b-lg',
}

const LIVENESS: Record<
  Exclude<ProcessLiveness, 'dormant'>,
  { label: string; className: string; ring: string }
> = {
  running: {
    label: 'Running',
    className: 'bg-primary animate-pulse',
    ring: 'ring-2 ring-primary animate-pulse',
  },
  verifying: {
    label: 'Verifying',
    className: 'bg-primary',
    ring: 'ring-2 ring-primary',
  },
  parked: {
    label: 'Waiting on you',
    className: 'bg-amber-500',
    ring: 'ring-2 ring-amber-500',
  },
  refused: {
    label: 'Refused',
    className: 'bg-destructive',
    ring: 'ring-2 ring-destructive',
  },
  failed: {
    label: 'Failed',
    className: 'bg-destructive',
    ring: 'ring-2 ring-destructive',
  },
}

const COLLAPSE_ABOVE = 6

/** Bypass passes values through, one stroke; mute stops them, crossed strokes. */
const BYPASSED_HATCH =
  'repeating-linear-gradient(45deg, transparent 0 7px, var(--line-separator) 7px 8px)'
const MUTED_HATCH = `${BYPASSED_HATCH}, repeating-linear-gradient(-45deg, transparent 0 7px, var(--line-separator) 7px 8px)`

/** What a drag in progress says about a port: Theorem's answer, or not a place to land. */
function useDragState(nodeId: string, portId: string) {
  return useProgramDoc(
    (doc) =>
      doc.dragVerdicts[`${nodeId}/${portId}`] ??
      (Object.keys(doc.dragVerdicts).length > 0 ? 'none' : undefined),
  )
}

const DRAG_ROW: Record<string, string> = {
  none: 'opacity-35',
  mismatch: 'opacity-35',
  compatible: '[&_.react-flow__handle]:scale-150',
  undetermined:
    '[&_.react-flow__handle]:scale-125 [&_.react-flow__handle]:!border-dashed',
}

function portHandle(port: ProgramPort, direction: 'in' | 'out') {
  const shape = portClass(port.shape_id, Boolean(port.column_contract))
  const Glyph = PortClassMark[shape]
  const isInput = direction === 'in'
  return {
    id: isInput ? inputHandle(port.id) : outputHandle(port.id),
    type: isInput ? ('target' as const) : ('source' as const),
    position: isInput ? Position.Left : Position.Right,
    title: port.id,
    icon: (
      <Glyph className="size-3 shrink-0" style={{ color: PORT_COLOR[shape] }} />
    ),
    className: 'h-full justify-start gap-2 px-3 text-xs',
    labelClassName: 'min-w-0 truncate px-0 text-ink-muted',
    handleClassName: '!size-2.5 !border-2 !border-raised transition-transform',
    style: { background: PORT_COLOR[shape] },
  }
}

/** A port a parameter arrived on can hand it back to the node's widget. */
function DemoteButton({
  nodeId,
  name,
  direction,
}: {
  nodeId: string
  name: string
  direction: 'in' | 'out'
}) {
  const demote = useProgramDoc((doc) => doc.demoteParameter)
  if (direction === 'out') return null
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label={`Set ${name} on the node`}
      title={`Set ${name} on the node`}
      className="nodrag absolute top-0.5 right-2"
      onClick={() => demote(nodeId, name)}
    >
      <Icon.X className="size-3" />
    </Button>
  )
}

function PortRow({
  nodeId,
  port,
  direction,
  parameter,
}: {
  nodeId: string
  port: ProgramPort
  direction: 'in' | 'out'
  parameter?: boolean
}) {
  const drag = useDragState(nodeId, port.id)
  return (
    <li className={cn('relative h-7', drag && DRAG_ROW[drag])}>
      <LabeledHandle {...portHandle(port, direction)} />
      {parameter && (
        <DemoteButton nodeId={nodeId} name={port.id} direction={direction} />
      )}
    </li>
  )
}

/** A collapsed node keeps only the handles its wires land on, on its own edge. */
function ConnectedHandles({
  node,
  connected,
}: {
  node: ProgramNode
  connected?: Array<string>
}) {
  const ports = [
    ...node.inputs.map((port) => ({ port, direction: 'in' as const })),
    ...node.outputs.map((port) => ({ port, direction: 'out' as const })),
  ].filter(({ port, direction }) =>
    connected?.includes(`${direction}:${port.id}`),
  )
  return ports.map(({ port, direction }) => {
    const { id, type, position, style } = portHandle(port, direction)
    return (
      <BaseHandle
        key={id}
        id={id}
        type={type}
        position={position}
        style={style}
        className="!size-2.5 !border-2 !border-raised"
      />
    )
  })
}

/** Every node's frame: silhouette, header, state and the collapse that hides its body. */
function NodeFrame({
  id,
  data,
  selected,
  extent,
  children,
}: {
  id: string
  data: ProgramFlowNode['data']
  selected?: boolean
  /** Anything that changes which handles exist, so xyflow measures them again. */
  extent: string
  children: ReactNode
}) {
  const {
    node,
    liveness,
    lint,
    pinned,
    stale,
    connected,
    undetermined,
    refused,
    unknown,
    ghost,
    proposed,
    collapsed,
  } = data
  const updateInternals = useUpdateNodeInternals()
  const setCollapsed = useProgramDoc((doc) => doc.setCollapsed)
  const select = useProgramDoc((doc) => doc.select)
  const outcome = useProgramDoc((doc) => doc.outcomes[id])
  const Mark = ProgramKindMark[node.kind]
  const state = liveness === 'dormant' ? undefined : LIVENESS[liveness]
  // Only when the handles move: React Flow measures a new node itself.
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) updateInternals(id)
    mounted.current = true
  }, [id, collapsed, extent, updateInternals])
  return (
    <BaseNode
      className={cn(
        'w-62 border-separator bg-raised text-ink transition-colors hover:ring-0',
        SILHOUETTE[node.kind],
        (node.bypassed || node.muted) && 'opacity-55',
        (undetermined || unknown || ghost) && 'border-dashed',
        ghost && 'opacity-50',
        (refused || unknown || proposed === 'removed') && 'border-destructive',
        proposed === 'changed' && 'border-primary',
        selected && 'outline-2 outline-offset-2 outline-primary',
      )}
      data-kind={node.kind}
      data-liveness={liveness}
      data-undetermined={undetermined || undefined}
      data-ghost={ghost || undefined}
      data-collapsed={collapsed || undefined}
    >
      {(node.bypassed || node.muted) && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ backgroundImage: node.muted ? MUTED_HATCH : BYPASSED_HATCH }}
        />
      )}
      <BaseNodeHeader className="-mb-0 h-10 justify-start gap-1.5 py-0">
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-md border border-separator bg-artifact',
            state?.ring,
            !state && outcome === 'cached' && 'border-dashed border-ink-muted',
            !state && outcome === 'done' && 'text-ink-muted',
          )}
        >
          <Mark className="size-4" />
        </span>
        <BaseNodeHeaderTitle className="min-w-0 truncate text-sm font-medium">
          {id}
        </BaseNodeHeaderTitle>
        {pinned && (
          <Icon.Pin
            className={cn('size-3.5 shrink-0', stale && 'text-amber-500')}
            aria-label={stale ? 'Pinned output is stale' : 'Output pinned'}
          />
        )}
        {lint && (
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              lint === 'error' ? 'bg-destructive' : 'bg-amber-500',
            )}
            title={`Lint ${lint}`}
          />
        )}
        {outcome && (
          <Badge
            variant="outline"
            size="sm"
            className="nodrag"
            title="Open what this node produced"
            render={<button type="button" onClick={() => select(id)} />}
          >
            {outcome}
          </Badge>
        )}
        <Badge variant="outline" size="sm" className="text-ink-muted">
          {node.kind.replaceAll('_', ' ')}
        </Badge>
        {!ghost && (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={collapsed ? `Expand ${id}` : `Collapse ${id}`}
            aria-expanded={!collapsed}
            className="nodrag"
            onClick={() => setCollapsed(id, !collapsed)}
          >
            {collapsed ? (
              <Icon.ChevronDown className="size-3" />
            ) : (
              <Icon.ChevronUp className="size-3" />
            )}
          </Button>
        )}
      </BaseNodeHeader>
      {state && (
        <p className="flex items-center gap-1.5 px-3 pb-1 text-[11px] text-ink-muted">
          <span className={cn('size-1.5 rounded-full', state.className)} />
          {state.label}
        </p>
      )}
      {ghost && (
        <p className="px-3 pb-1 text-[11px] text-ink-muted">Advisory</p>
      )}
      {unknown && (
        <p
          role="alert"
          className="px-3 pb-1 text-[11px] break-all text-destructive"
        >
          No catalog entry for {node.block_id}
        </p>
      )}
      {collapsed ? (
        <ConnectedHandles node={node} connected={connected} />
      ) : (
        children
      )}
    </BaseNode>
  )
}

/** Edge to edge, taking the silhouette's own bottom corners: an inset panel's square
 * corners poke through a large curve, and its handles sit inside the card. */
const PANEL =
  'gap-y-0 border-t border-separator bg-artifact px-0 py-1 [border-bottom-left-radius:inherit] [border-bottom-right-radius:inherit]'

const allPorts = (node: ProgramNode) => [
  ...node.inputs.map((port) => ({ port, direction: 'in' as const })),
  ...node.outputs.map((port) => ({ port, direction: 'out' as const })),
]

export const ProgramNodeView = memo(function ProgramNodeView({
  id,
  data,
  selected,
}: NodeProps<ProgramFlowNode>) {
  const { node, connected, unknown } = data
  const [expanded, setExpanded] = useState(false)
  const ports = allPorts(node)
  const declared = new Set(declaredParameters(node).map((entry) => entry.name))
  // The rows an edge lands on always show: a handle has to exist to carry it.
  const shown =
    expanded || unknown || ports.length <= COLLAPSE_ABOVE
      ? ports
      : ports.filter(({ port, direction }) =>
          connected?.includes(`${direction}:${port.id}`),
        )
  const hiddenCount = ports.length - shown.length
  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      extent={shown
        .map(({ port, direction }) => `${direction}:${port.id}`)
        .join()}
    >
      <BaseNodeContent className={PANEL}>
        <ul>
          {shown.map(({ port, direction }) => (
            <PortRow
              key={`${direction}:${port.id}`}
              nodeId={id}
              port={port}
              direction={direction}
              parameter={declared.has(port.id)}
            />
          ))}
          {hiddenCount > 0 && (
            <li>
              <Button
                variant="ghost"
                size="xs"
                className="nodrag h-7 w-full justify-start gap-2 rounded-none px-3 font-normal text-ink-muted"
                onClick={() => setExpanded(true)}
              >
                <Icon.Expand className="size-3" />
                {hiddenCount} more ports
              </Button>
            </li>
          )}
          {ports.length === 0 && (
            <li
              className="truncate px-3 text-xs leading-7 text-ink-muted"
              title={node.block_id}
            >
              {node.block_id}
            </li>
          )}
        </ul>
        <ChosenAffordance node={node} />
        <ParameterWidgets node={node} />
      </BaseNodeContent>
    </NodeFrame>
  )
})

/** What an Affordance node runs, on its face, so the graph reads without opening each node. */
function ChosenAffordance({ node }: { node: ProgramNode }) {
  if (
    node.block_id !== AFFORDANCE_BLOCK ||
    node.kind !== 'stochastic' ||
    node.affordance_id === AFFORDANCE_BLOCK
  )
    return null
  return (
    <p
      className="truncate border-t border-separator px-3 text-xs leading-7 text-ink-muted"
      title={node.affordance_id}
    >
      {node.affordance_id}
    </p>
  )
}

const COLUMNS_SHOWN = 6

const typeLabel = (type: FieldType, nullable: boolean) =>
  `${type.kind}${nullable ? '?' : ''}`

/** One line of the table under a tabular port: what it carries, or that nobody knows yet. */
function ColumnRows({ port }: { port: ProgramPort }) {
  const [expanded, setExpanded] = useState(false)
  const set = port.column_contract?.columns
  if (!set || set.kind === 'undetermined') {
    return (
      <DatabaseSchemaTableRow>
        <DatabaseSchemaTableCell
          colSpan={2}
          className="h-6 p-0 pl-8 text-ink-faint"
        >
          Columns undetermined
        </DatabaseSchemaTableCell>
      </DatabaseSchemaTableRow>
    )
  }
  if (set.columns.length === 0) {
    return (
      <DatabaseSchemaTableRow>
        <DatabaseSchemaTableCell
          colSpan={2}
          className="h-6 p-0 pl-8 text-ink-faint"
        >
          No columns
        </DatabaseSchemaTableCell>
      </DatabaseSchemaTableRow>
    )
  }
  const shown = expanded ? set.columns : set.columns.slice(0, COLUMNS_SHOWN)
  const hidden = set.columns.length - shown.length
  return (
    <>
      {shown.map((column) => (
        <DatabaseSchemaTableRow key={column.name}>
          <DatabaseSchemaTableCell
            title={column.name}
            className="h-6 truncate p-0 pl-8 text-ink"
          >
            {column.name}
          </DatabaseSchemaTableCell>
          <DatabaseSchemaTableCell className="h-6 truncate p-0 pr-3 text-right text-ink-faint">
            {typeLabel(column.data_type, column.nullable)}
          </DatabaseSchemaTableCell>
        </DatabaseSchemaTableRow>
      ))}
      {hidden > 0 && (
        <DatabaseSchemaTableRow>
          <DatabaseSchemaTableCell colSpan={2} className="h-6 p-0">
            <Button
              variant="ghost"
              size="xs"
              className="nodrag w-full justify-start gap-2 rounded-none pl-8 font-normal text-ink-muted"
              onClick={() => setExpanded(true)}
            >
              <Icon.Expand className="size-3" />
              {hidden} more columns
            </Button>
          </DatabaseSchemaTableCell>
        </DatabaseSchemaTableRow>
      )}
    </>
  )
}

function SchemaPortRow({
  nodeId,
  port,
  direction,
  parameter,
}: {
  nodeId: string
  port: ProgramPort
  direction: 'in' | 'out'
  parameter?: boolean
}) {
  const drag = useDragState(nodeId, port.id)
  const tabular =
    portClass(port.shape_id, Boolean(port.column_contract)) === 'table'
  return (
    <>
      <DatabaseSchemaTableRow className={cn(drag && DRAG_ROW[drag])}>
        <DatabaseSchemaTableCell colSpan={2} className="relative h-7 p-0">
          <LabeledHandle {...portHandle(port, direction)} />
          {parameter && (
            <DemoteButton
              nodeId={nodeId}
              name={port.id}
              direction={direction}
            />
          )}
        </DatabaseSchemaTableCell>
      </DatabaseSchemaTableRow>
      {tabular && <ColumnRows port={port} />}
    </>
  )
}

/** The table a tenant-graph source reads; choosing it sets the columns its port carries. */
function TablePicker({ node }: { node: ProgramNode & { kind: 'source' } }) {
  const patchNode = useProgramDoc((doc) => doc.patchNode)
  const tables = useQuery({
    queryKey: programKeys.tables(),
    queryFn: listTables,
  })
  const choose = useMutation({
    mutationFn: async (label: string) => ({
      label,
      contract: await tableColumns(label),
    }),
    onSuccess: ({ label, contract }) =>
      patchNode(node.id, {
        selector: { ...node.selector, label },
        outputs: node.outputs.map((port) => ({
          ...port,
          column_contract: contract,
        })),
      }),
  })
  return (
    <DatabaseSchemaTableRow>
      <DatabaseSchemaTableCell className="nodrag h-8 w-16 p-0 pl-3 text-ink-muted">
        table
      </DatabaseSchemaTableCell>
      <DatabaseSchemaTableCell className="nodrag h-8 p-0 pr-3">
        <ComboControl
          label="Table"
          value={node.selector.label || undefined}
          options={(tables.data ?? []).map((table) => table.label)}
          onChange={(label) => choose.mutate(label)}
        />
        {(tables.error ?? choose.error) && (
          <p role="alert" className="pt-1 text-[11px] text-destructive">
            {describeError(tables.error ?? choose.error)}
          </p>
        )}
      </DatabaseSchemaTableCell>
    </DatabaseSchemaTableRow>
  )
}

/** A compound's rows are the nodes it stacks, in the program it pinned. */
function StackRows({ nodeId }: { nodeId: string }) {
  const programId = useProgramDoc((doc) => doc.contentId)
  // A node placed a moment ago is not on the saved program until the autosave lands.
  const saved = useProgramDoc(
    (doc) => doc.savedDefinition === doc.definitionRevision,
  )
  const interior = useQuery({
    enabled: Boolean(programId) && saved,
    queryKey: programKeys.interior(programId ?? '', nodeId),
    queryFn: () => programInterior(programId!, nodeId),
    retry: false,
  })
  if (interior.error) {
    return (
      <DatabaseSchemaTableRow>
        <DatabaseSchemaTableCell
          colSpan={2}
          role="alert"
          className="p-0 px-3 py-1 whitespace-normal break-all text-destructive"
        >
          {describeError(interior.error)}
        </DatabaseSchemaTableCell>
      </DatabaseSchemaTableRow>
    )
  }
  return interior.data?.program.nodes.map((inner) => {
    const Mark = ProgramKindMark[inner.kind]
    return (
      <DatabaseSchemaTableRow key={inner.id}>
        <DatabaseSchemaTableCell
          title={inner.id}
          className="h-6 truncate border-t border-separator p-0 pl-3 text-ink"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Mark className="size-3 shrink-0 text-ink-muted" />
            <span className="min-w-0 truncate">{inner.id}</span>
          </span>
        </DatabaseSchemaTableCell>
        <DatabaseSchemaTableCell className="h-6 truncate border-t border-separator p-0 pr-3 text-right text-ink-faint">
          {inner.kind.replaceAll('_', ' ')}
        </DatabaseSchemaTableCell>
      </DatabaseSchemaTableRow>
    )
  })
}

/**
 * The same node frame with a table for a body, for anything whose rows are data: the
 * columns a port carries, the table a source reads, the nodes a compound stacks. It
 * reads only the definition, so the one-renderer law still holds.
 */
export const SchemaNodeView = memo(function SchemaNodeView({
  id,
  data,
  selected,
}: NodeProps<ProgramFlowNode>) {
  const { node } = data
  const ports = allPorts(node)
  const declared = new Set(declaredParameters(node).map((entry) => entry.name))
  return (
    <NodeFrame
      id={id}
      data={data}
      selected={selected}
      extent={ports
        .map(({ port, direction }) => `${direction}:${port.id}`)
        .join()}
    >
      <DatabaseSchemaNodeBody className={PANEL}>
        {node.kind === 'source' && node.selector.plane === 'tenant_graph' && (
          <TablePicker node={node} />
        )}
        {ports.map(({ port, direction }) => (
          <SchemaPortRow
            key={`${direction}:${port.id}`}
            nodeId={id}
            port={port}
            direction={direction}
            parameter={declared.has(port.id)}
          />
        ))}
        {node.kind === 'compound' && <StackRows nodeId={id} />}
      </DatabaseSchemaNodeBody>
      <ChosenAffordance node={node} />
      <ParameterWidgets node={node} />
    </NodeFrame>
  )
})
