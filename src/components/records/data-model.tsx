// SOURCING: @xyflow/react 12 (custom nodes with per-field Handles, smoothstep edges with circle markers, Controls with the interactive lock, dotted Background, fitView) for the diagram, laid out by ./layout; the objects page, object detail and diagram anatomy after Twenty's data model settings and its React Flow overview (relation rows with handles on both sides, a collapsible "{n} fields" row, one edge per relation field with its own id); the register's observed shapes and divergences for what is not declared yet
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/coss/badge'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { describeError, isSignedOut } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import type {
  DataModel,
  Enforcement,
  FieldSpec,
  ObjectType,
  ObservedShape,
} from './contract'
import { FieldDialog, NewObjectDialog, Segmented } from './field-form'
import type { FieldDraft } from './field-form'
import { FieldTypeIcon, KIND } from './fields'
import { NODE_WIDTH, layoutModel } from './layout'
import { observeProperty, resolveObjectType, undeclaredKeys } from './model'
import {
  activeObjectTypes,
  flattenRows,
  useDataModel,
  useDeclareObjectType,
  usePinObserved,
  useRecords,
  useRetireObjectType,
} from './queries'
import { proposeFieldType, toInput } from './schema-edit'

// Diagram

const HEADER = 36
const ROW = 24

type ObjectNodeData = {
  title: string
  count?: number
  badge: string
  observed: boolean
  relations: { key: string; label: string; target: string; many: boolean }[]
  others: {
    key: string
    label: string
    kind: FieldSpec['field_type']['kind']
  }[]
  onOpen?: () => void
}
type ObjectNode = Node<ObjectNodeData, 'object'>

const hidden = '!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent'

function ObjectNodeView({ data }: NodeProps<ObjectNode>) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={cn(
        'rounded-lg border bg-raised text-xs shadow-sm',
        data.observed
          ? 'border-dashed border-ink-faint/60'
          : 'border-separator',
      )}
      style={{ width: NODE_WIDTH }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="__header-left"
        className={hidden}
        style={{ top: HEADER / 2 }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="__header-right"
        className={hidden}
        style={{ top: HEADER / 2 }}
      />
      <button
        type="button"
        onClick={data.onOpen}
        disabled={!data.onOpen}
        className="nodrag flex w-full items-center gap-1.5 border-b border-separator px-2.5 text-start hover:bg-hover disabled:hover:bg-transparent"
        style={{ height: HEADER }}
      >
        <span className="truncate text-sm font-medium text-ink">
          {data.title}
        </span>
        {data.count !== undefined && (
          <span className="text-ink-faint tabular-nums">· {data.count}</span>
        )}
        <Badge variant="outline" size="sm" className="ms-auto">
          {data.badge}
        </Badge>
      </button>
      <ul className="py-1">
        {data.relations.map((relation) => (
          <li
            key={relation.key}
            className="relative flex items-center gap-1.5 px-2.5 text-ink"
            style={{ height: ROW }}
          >
            <Handle
              type="source"
              position={Position.Left}
              id={`${relation.key}-left`}
              className={hidden}
            />
            <Handle
              type="source"
              position={Position.Right}
              id={`${relation.key}-right`}
              className={hidden}
            />
            <Icon.Link className="size-3 shrink-0 text-ink-faint" />
            <span className="truncate">{relation.label}</span>
            <span className="ms-auto truncate text-ink-faint">
              {relation.many ? 'many ' : ''}
              {relation.target}
            </span>
          </li>
        ))}
        {data.others.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="nodrag flex w-full items-center gap-1 px-2.5 text-ink-faint hover:text-ink"
              style={{ height: ROW }}
            >
              <Icon.ChevronDown
                className={cn(
                  'size-3 transition-transform',
                  !open && '-rotate-90',
                )}
              />
              {data.others.length} fields
            </button>
            {open && (
              <ul>
                {data.others.map((field) => (
                  <li
                    key={field.key}
                    className="flex items-center gap-1.5 px-2.5 text-ink-muted"
                    style={{ height: ROW }}
                  >
                    <FieldTypeIcon kind={field.kind} className="size-3" />
                    <span className="truncate">{field.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>
    </div>
  )
}

const nodeTypes = { object: ObjectNodeView }

const nodeHeight = (relations: number, others: number) =>
  HEADER + 8 + ROW * (relations + (others ? 1 : 0))

/** Nodes and edges for the declared types and, when asked, the observed-only labels. */
export function diagramOf(
  model: DataModel,
  {
    includeObserved,
    onOpen,
  }: { includeObserved: boolean; onOpen?: (type: ObjectType) => void },
) {
  const types = activeObjectTypes(model)
  const shapes: ObservedShape[] = includeObserved ? model.observedShapes : []
  const idOfLabel = new Map<string, string>()
  for (const type of types) {
    idOfLabel.set(type.node_label, type.object_type_id)
    idOfLabel.set(type.object_type_id, type.object_type_id)
  }
  for (const shape of shapes)
    idOfLabel.set(shape.node_label, `observed:${shape.node_label}`)

  const nodes: ObjectNode[] = [
    ...types.map((type): ObjectNode => {
      const relations = type.fields.flatMap((field) =>
        field.field_type.kind === 'relation'
          ? [
              {
                key: field.key,
                label: field.label,
                target:
                  resolveObjectType(
                    model,
                    field.field_type.target_object_type_id,
                  )?.label_plural ?? 'missing',
                many: field.field_type.cardinality === 'many',
              },
            ]
          : [],
      )
      const others = type.fields
        .filter((f) => f.field_type.kind !== 'relation')
        .map((f) => ({ key: f.key, label: f.label, kind: f.field_type.kind }))
      return {
        id: type.object_type_id,
        type: 'object',
        position: { x: 0, y: 0 },
        data: {
          title: type.label_plural,
          count: type.record_count,
          badge: type.system ? 'System' : 'Custom',
          observed: false,
          relations,
          others,
          onOpen: onOpen ? () => onOpen(type) : undefined,
        },
      }
    }),
    ...shapes.map((shape): ObjectNode => ({
      id: `observed:${shape.node_label}`,
      type: 'object',
      position: { x: 0, y: 0 },
      data: {
        title: shape.node_label,
        count: shape.node_count,
        badge: 'Observed',
        observed: true,
        relations: shape.outbound.map((relation) => ({
          key: relation.edge_label,
          label: relation.edge_label,
          target: relation.target_labels.join(', '),
          many: relation.observed_count > 1,
        })),
        others: shape.properties.map((p) => ({
          key: p.key,
          label: p.key,
          kind: 'json' as const,
        })),
      },
    })),
  ]

  const ids = new Set(nodes.map((n) => n.id))
  const links: {
    id: string
    source: string
    target: string
    handle: string
    declared: boolean
  }[] = []
  for (const relation of model.relations) {
    if (!relation.declared && !includeObserved) continue
    const source = idOfLabel.get(relation.fromLabel)
    const target = idOfLabel.get(relation.toLabel)
    if (!source || !target || !ids.has(source) || !ids.has(target)) continue
    // One edge per relation field, so two relations between the same pair never share an id.
    links.push({
      id: `${source}:${relation.edgeLabel}`,
      source,
      target,
      handle: relation.edgeLabel,
      declared: relation.declared,
    })
  }

  const positions = layoutModel(
    nodes.map((n) => ({
      id: n.id,
      height: nodeHeight(n.data.relations.length, n.data.others.length),
    })),
    links,
  )
  for (const node of nodes) node.position = positions[node.id] ?? node.position

  const edges: Edge[] = links.map((link) => {
    const rightward =
      (positions[link.target]?.x ?? 0) >= (positions[link.source]?.x ?? 0)
    return {
      id: link.id,
      source: link.source,
      target: link.target,
      sourceHandle: `${link.handle}-${rightward ? 'right' : 'left'}`,
      targetHandle: rightward ? '__header-left' : '__header-right',
      type: 'smoothstep',
      markerStart: 'erd-circle',
      markerEnd: 'erd-circle',
      style: {
        stroke: 'var(--color-ink-faint)',
        strokeWidth: 1,
        strokeDasharray: link.declared ? undefined : '4 3',
      },
    }
  })
  return { nodes, edges }
}

function Markers() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <marker
          id="erd-circle"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="6"
          markerHeight="6"
        >
          <circle
            cx="5"
            cy="5"
            r="3"
            fill="var(--color-raised)"
            stroke="var(--color-ink-faint)"
            strokeWidth="1.5"
          />
        </marker>
      </defs>
    </svg>
  )
}

export function ModelDiagram({
  model,
  includeObserved = false,
  interactive = true,
  onOpen,
  className,
}: {
  model: DataModel
  includeObserved?: boolean
  interactive?: boolean
  onOpen?: (type: ObjectType) => void
  className?: string
}) {
  const { nodes, edges } = useMemo(
    () => diagramOf(model, { includeObserved, onOpen }),
    [model, includeObserved, onOpen],
  )
  return (
    <div className={cn('relative', className)}>
      <Markers />
      <ReactFlowProvider>
        <ReactFlow<ObjectNode, Edge>
          defaultNodes={nodes}
          defaultEdges={edges}
          key={`${nodes.map((n) => n.id).join()}|${edges.length}`}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          nodesDraggable={interactive}
          nodesConnectable={false}
          elementsSelectable={interactive}
          panOnDrag={interactive}
          zoomOnScroll={interactive}
          zoomOnPinch={interactive}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          {interactive && <Controls position="bottom-left" showInteractive />}
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}

// Pages

function Status({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-16 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {detail && <p className="max-w-md text-sm text-ink-muted">{detail}</p>}
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-separator bg-raised">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-separator text-xs text-ink-faint">
            {head.map((h, i) => (
              <th
                key={h}
                className={cn(
                  'px-3 py-2 font-medium',
                  i === 0 ? 'text-start' : 'text-end',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function ObjectsPage({
  model,
  onFocus,
}: {
  model: DataModel
  onFocus: (nameSingular: string) => void
}) {
  const [q, setQ] = useState('')
  const [visualize, setVisualize] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showSystem, setShowSystem] = useState(false)
  const pin = usePinObserved()
  const types = activeObjectTypes(model).filter(
    (type) =>
      (showSystem || !type.system) &&
      type.label_plural.toLowerCase().includes(q.trim().toLowerCase()),
  )
  const drift = model.divergences.reduce((n, d) => n + d.count, 0)

  if (visualize)
    return (
      <div className="relative h-[calc(100dvh-12rem)] min-h-96 overflow-hidden rounded-lg border border-separator bg-raised">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Close the diagram"
          className="absolute top-3 left-3 z-10"
          onClick={() => setVisualize(false)}
        >
          <Icon.Close />
        </Button>
        <ModelDiagram
          model={model}
          includeObserved
          className="h-full"
          onOpen={(type) => onFocus(type.name_singular)}
        />
      </div>
    )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Button className="ms-auto" size="sm" onClick={() => setCreating(true)}>
          <Icon.Add /> Add object
        </Button>
      </div>

      <div className="relative h-56 overflow-hidden rounded-lg border border-separator bg-raised">
        <ModelDiagram model={model} interactive={false} className="h-full" />
        <Button
          variant="outline"
          size="sm"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-raised"
          onClick={() => setVisualize(true)}
        >
          <Icon.Eye /> Visualize
        </Button>
      </div>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
            Existing objects
          </h3>
          {drift > 0 && (
            <span className="text-xs text-ochre-ink">
              {drift} values drift from their declarations
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Icon.Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search for an object..."
              className="h-8 pl-8"
              aria-label="Search for an object"
            />
          </div>
          <Button
            variant={showSystem ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={showSystem}
            onClick={() => setShowSystem((v) => !v)}
          >
            System objects
          </Button>
        </div>
        <Table head={['Name', 'App', 'Fields', 'Records']}>
          {types.map((type) => (
            <tr
              key={type.object_type_id}
              tabIndex={0}
              onClick={() => onFocus(type.name_singular)}
              onKeyDown={(event) =>
                event.key === 'Enter' && onFocus(type.name_singular)
              }
              className="cursor-pointer border-b border-separator/60 last:border-0 hover:bg-hover"
            >
              <td className="px-3 py-2 text-ink">{type.label_plural}</td>
              <td className="px-3 py-2 text-end">
                <Badge variant="outline" size="sm">
                  {type.system ? 'System' : 'Custom'}
                </Badge>
              </td>
              <td className="px-3 py-2 text-end text-ink-muted tabular-nums">
                {type.fields.length}
              </td>
              <td className="px-3 py-2 text-end text-ink-muted tabular-nums">
                {type.record_count ?? '—'}
              </td>
            </tr>
          ))}
          {!types.length && (
            <tr>
              <td
                colSpan={4}
                className="px-3 py-6 text-center text-sm text-ink-muted"
              >
                No object matches.
              </td>
            </tr>
          )}
        </Table>
      </section>

      {model.observedShapes.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <header>
            <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
              Seen in the graph, not declared
            </h3>
            <p className="text-sm text-ink-muted">
              Theorem keeps these as they are. Declare one to give it fields, a
              table and checks.
            </p>
          </header>
          <Table head={['Label', 'Properties', 'Records', '']}>
            {model.observedShapes.map((shape) => (
              <tr
                key={shape.node_label}
                className="border-b border-separator/60 last:border-0"
              >
                <td className="px-3 py-2 text-ink">{shape.node_label}</td>
                <td className="px-3 py-2 text-end text-ink-muted tabular-nums">
                  {shape.properties.length}
                </td>
                <td className="px-3 py-2 text-end text-ink-muted tabular-nums">
                  {shape.node_count}
                </td>
                <td className="px-3 py-1.5 text-end">
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={pin.isPending}
                    onClick={() =>
                      pin.mutate({
                        observed_key: shape.node_label,
                        kind: 'type',
                      })
                    }
                  >
                    Declare
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
          {pin.error != null && (
            <p role="alert" className="text-sm text-error-ink">
              {describeError(pin.error)}
            </p>
          )}
        </section>
      )}

      <NewObjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(type) => onFocus(type.name_singular)}
      />
    </div>
  )
}

const TYPE_TEXT = (field: FieldSpec, model: DataModel) => {
  const type = field.field_type
  if (type.kind === 'relation')
    return `${type.cardinality === 'many' ? 'Has many' : 'Belongs to one'} ${resolveObjectType(model, type.target_object_type_id)?.label_plural ?? '(missing)'}`
  return KIND[type.kind].label
}

function ObjectDetail({
  model,
  type,
  onBack,
  onOpenRecords,
}: {
  model: DataModel
  type: ObjectType
  onBack: () => void
  onOpenRecords?: (nameSingular: string) => void
}) {
  const declare = useDeclareObjectType()
  const retire = useRetireObjectType()
  const pin = usePinObserved()
  const records = useRecords(type)
  const rows = useMemo(() => flattenRows(records.data), [records.data])
  const [dialog, setDialog] = useState<{
    key: string
    field?: FieldSpec
    initial?: FieldDraft
  } | null>(null)
  const [retiring, setRetiring] = useState(false)

  const relations = type.fields.filter((f) => f.field_type.kind === 'relation')
  const plain = type.fields.filter((f) => f.field_type.kind !== 'relation')
  const drift = model.divergences.filter(
    (d) => d.objectTypeId === type.object_type_id,
  )
  const unknown = undeclaredKeys(type, rows)

  const setEnforcement = (enforcement: Enforcement) =>
    declare.mutate({
      input: { ...toInput(type), enforcement },
      anchor: type.content_anchor,
    })

  const fieldRow = (field: FieldSpec) => (
    <tr
      key={field.key}
      tabIndex={0}
      onClick={() => setDialog({ key: `edit:${field.key}`, field })}
      onKeyDown={(event) =>
        event.key === 'Enter' && setDialog({ key: `edit:${field.key}`, field })
      }
      className="cursor-pointer border-b border-separator/60 last:border-0 hover:bg-hover"
    >
      <td className="px-3 py-2">
        <span className="flex items-center gap-2 text-ink">
          <FieldTypeIcon kind={field.field_type.kind} />
          {field.label}
          {field.key === type.label_identifier_field && (
            <Badge variant="outline" size="sm">
              Identifier
            </Badge>
          )}
          {field.required && (
            <span className="text-xs text-ink-faint">required</span>
          )}
        </span>
      </td>
      <td className="px-3 py-2 text-end">
        <Badge variant="outline" size="sm">
          {field.system ? 'System' : 'Custom'}
        </Badge>
      </td>
      <td className="px-3 py-2 text-end text-ink-muted">
        {TYPE_TEXT(field, model)}
      </td>
    </tr>
  )

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex items-center gap-1 text-sm text-ink-muted">
        <button type="button" onClick={onBack} className="hover:text-ink">
          Data model
        </button>
        <span>/</span>
        <span className="text-ink">{type.label_plural}</span>
      </nav>
      <div className="flex flex-wrap items-start gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink-muted">
          {type.description}
        </p>
        {onOpenRecords && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenRecords(type.name_singular)}
          >
            <Icon.Open /> See records
          </Button>
        )}
      </div>

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-separator bg-raised px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">When a record does not match</p>
          <p className="text-xs text-ink-muted">
            {type.enforcement === 'observe'
              ? 'Accept it and note the difference.'
              : type.enforcement === 'warn'
                ? 'Accept it and flag the difference.'
                : 'Refuse the write.'}
          </p>
        </div>
        <Segmented<Enforcement>
          label="When a record does not match"
          value={type.enforcement}
          onChange={setEnforcement}
          options={[
            { value: 'observe', label: 'Observe' },
            { value: 'warn', label: 'Warn' },
            { value: 'reject', label: 'Reject' },
          ]}
        />
      </section>

      <section className="flex flex-col gap-2">
        <header className="flex items-center gap-2">
          <div className="flex-1">
            <h3 className="text-sm font-medium text-ink">Relations</h3>
            <p className="text-xs text-ink-muted">
              Relations between this object and other objects
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDialog({
                key: 'new-relation',
                initial: {
                  type: {
                    kind: 'relation',
                    target_object_type_id: '',
                    cardinality: 'one',
                  },
                },
              })
            }
          >
            <Icon.Add /> Add relation
          </Button>
        </header>
        {relations.length ? (
          <Table head={['Name', 'App', 'Type']}>
            {relations.map(fieldRow)}
          </Table>
        ) : (
          <p className="text-sm text-ink-faint">No relations yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <header className="flex items-center gap-2">
          <div className="flex-1">
            <h3 className="text-sm font-medium text-ink">Fields</h3>
            <p className="text-xs text-ink-muted">
              The fields every {type.label_singular.toLowerCase()} can carry, in
              the order tables show them
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog({ key: 'new-field' })}
          >
            <Icon.Add /> Add field
          </Button>
        </header>
        <Table head={['Name', 'App', 'Data type']}>{plain.map(fieldRow)}</Table>
      </section>

      {(unknown.length > 0 || drift.length > 0) && (
        <section className="flex flex-col gap-2">
          <header>
            <h3 className="text-sm font-medium text-ink">
              Not in the schema yet
            </h3>
            <p className="text-xs text-ink-muted">
              What records carry beyond their declaration. Nothing here was
              refused; add it as a field to sort, filter and check it.
            </p>
          </header>
          <Table head={['Property', 'Seen on', 'Drift', '']}>
            {unknown.map((key) => {
              const observed = observeProperty(rows, key)
              const count = drift
                .filter((d) => d.field === key)
                .reduce((n, d) => n + d.count, 0)
              return (
                <tr
                  key={key}
                  className="border-b border-separator/60 last:border-0"
                >
                  <td className="px-3 py-2 font-mono text-xs text-ink">
                    {key}
                  </td>
                  <td className="px-3 py-2 text-end text-ink-muted tabular-nums">
                    {Math.round(observed.presence_ratio * 100)}%
                  </td>
                  <td className="px-3 py-2 text-end text-ink-muted tabular-nums">
                    {count || '—'}
                  </td>
                  <td className="flex justify-end gap-1.5 px-3 py-1.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={pin.isPending}
                      onClick={() =>
                        pin.mutate({
                          observed_key: key,
                          kind: 'field',
                          parent_observed_key: type.node_label,
                        })
                      }
                    >
                      Promote
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        setDialog({
                          key: `observed:${key}`,
                          initial: {
                            label: key,
                            type: proposeFieldType(observed),
                          },
                        })
                      }
                    >
                      Add as field
                    </Button>
                  </td>
                </tr>
              )
            })}
            {drift
              .filter((d) => !unknown.includes(d.field))
              .map((d) => (
                <tr
                  key={`${d.field}:${d.kind}`}
                  className="border-b border-separator/60 last:border-0"
                >
                  <td className="px-3 py-2 font-mono text-xs text-ink">
                    {d.field}
                  </td>
                  <td className="px-3 py-2 text-end text-ink-muted">
                    {d.kind === 'type_mismatch'
                      ? 'wrong type'
                      : d.kind === 'missing_required_field'
                        ? 'missing'
                        : 'unknown'}
                  </td>
                  <td className="px-3 py-2 text-end text-ink-muted tabular-nums">
                    {d.count}
                  </td>
                  <td />
                </tr>
              ))}
          </Table>
          {pin.error != null && (
            <p role="alert" className="text-sm text-error-ink">
              {describeError(pin.error)}
            </p>
          )}
        </section>
      )}

      {!type.system && (
        <section className="flex items-center justify-between gap-3 rounded-lg border border-error-ink/30 px-3 py-2.5">
          <div>
            <p className="text-sm text-ink">Retire this object</p>
            <p className="text-xs text-ink-muted">
              Its records stay in the graph and show as observed again.
            </p>
          </div>
          {retiring ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={retire.isPending}
              onClick={() =>
                retire.mutate(type.object_type_id, { onSuccess: onBack })
              }
            >
              Retire {type.label_plural}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRetiring(true)}
            >
              Retire
            </Button>
          )}
        </section>
      )}

      {(declare.error ?? retire.error) != null && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(declare.error ?? retire.error)}
        </p>
      )}

      {dialog && (
        <FieldDialog
          key={dialog.key}
          objectType={type}
          model={model}
          field={dialog.field}
          initial={dialog.initial}
          open
          onOpenChange={(open) => !open && setDialog(null)}
        />
      )}
    </div>
  )
}

/**
 * Twenty's data model settings over the schema register: the objects with a
 * diagram of how they relate, one object's fields and relations, and what
 * records carry that is not declared yet.
 */
export function DataModelView({
  focus,
  onFocus,
  onOpenRecords,
}: {
  /** The object open in detail, by name; the objects page when absent. */
  focus?: string
  onFocus: (nameSingular: string | undefined) => void
  onOpenRecords?: (nameSingular: string) => void
}) {
  const model = useDataModel()
  if (model.isPending)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (model.isError)
    return isSignedOut(model.error) ? (
      <Status title="Sign in to see the data model" />
    ) : (
      <Status
        title="The data model could not be read"
        detail={describeError(model.error)}
      />
    )
  const type = focus
    ? activeObjectTypes(model.data).find((t) => t.name_singular === focus)
    : undefined
  if (focus && !type)
    return (
      <Status
        title="This object is not in the schema"
        detail="It may have been retired."
      />
    )
  return type ? (
    <ObjectDetail
      model={model.data}
      type={type}
      onBack={() => onFocus(undefined)}
      onOpenRecords={onOpenRecords}
    />
  ) : (
    <ObjectsPage model={model.data} onFocus={onFocus} />
  )
}
