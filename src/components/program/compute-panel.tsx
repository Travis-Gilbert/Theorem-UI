// SOURCING: @tanstack/react-query over Theorem's graph_compute, graph_lisp, graph_lint and
// reactive_derive tools; the rail's Section, Labeled, Choice, ToolError and Json; coss ui
// Input, Textarea, NumberField, Badge and Alert; and @uiw/react-codemirror for Graph Lisp.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDebouncedValue } from '@tanstack/react-pacer'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import type { JsonValue } from '@/lib/program/contracts'
import {
  affectedNeighborhood,
  commitSpec,
  deriveCommand,
  graphLisp,
  lintGraph,
  listEngines,
} from '@/lib/program/compute'
import type { LispSurface, NeighborhoodRequest } from '@/lib/program/compute'
import type { LispRevision, Procedure } from '@/lib/program/api'
import {
  listChanges,
  listProcedures,
  programNodeRecords,
} from '@/lib/program/api'
import { useProgramDoc } from '@/lib/program/store'
import { Alert, AlertDescription } from '@/components/coss/alert'
import { Badge } from '@/components/coss/badge'
import { Input } from '@/components/coss/input'
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/coss/number-field'
import { Switch } from '@/components/coss/switch'
import { Textarea } from '@/components/coss/textarea'
import { Button } from '@/components/ui/button'
import { Choice, Json, Labeled, Section, ToolError } from './section'

const HERE = 'here'

const asJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as JsonValue

const listOf = (text: string) =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const PLAIN_NUMBER = { useGrouping: false }

/** Clearing the field keeps the last number, and the field shows it again on blur. */
function NumberEntry({
  label,
  value,
  min,
  max,
  className,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  className?: string
  onChange: (next: number) => void
}) {
  return (
    <NumberField
      size="sm"
      className={className}
      format={PLAIN_NUMBER}
      min={min}
      max={max}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next)
      }}
    >
      <NumberFieldGroup>
        <NumberFieldDecrement aria-label={`Lower ${label}`} />
        <NumberFieldInput aria-label={label} />
        <NumberFieldIncrement aria-label={`Raise ${label}`} />
      </NumberFieldGroup>
    </NumberField>
  )
}

/**
 * Theorem computes this with GraphBLAS over the graph, keeps the result, and links it from
 * the node it was attached to. The canvas node it was asked about keeps a copy in its layout.
 */
function Neighborhood() {
  const selected = useProgramDoc((doc) => doc.selected)
  const program = useProgramDoc((doc) => doc.program)
  const contentId = useProgramDoc((doc) => doc.contentId)
  const draftRecord = useProgramDoc((doc) => doc.nodeId)
  const attach = useProgramDoc((doc) => doc.attach)
  const engines = useQuery({
    queryKey: ['programs', 'engines'],
    queryFn: listEngines,
    retry: false,
  })
  const records = useQuery({
    queryKey: ['programs', 'node-records', contentId],
    queryFn: () => programNodeRecords(program!),
    enabled: program !== undefined,
  })
  const changes = useQuery({
    queryKey: ['programs', 'changes'],
    queryFn: listChanges,
  })
  const [origin, setOrigin] = useState(HERE)
  const [edgeTypes, setEdgeTypes] = useState('')
  const [hops, setHops] = useState(2)
  const [direction, setDirection] =
    useState<NeighborhoodRequest['direction']>('both')
  const nodeRecord = selected ? records.data?.nodes[selected] : undefined
  const here = nodeRecord ?? records.data?.program_record ?? draftRecord
  const canvasNames = new Map(
    Object.entries(records.data?.nodes ?? {}).map(([id, record]) => [
      record,
      id,
    ]),
  )
  const compute = useMutation({
    mutationFn: async () => {
      const edge_types = listOf(edgeTypes)
      const answer = await affectedNeighborhood({
        ...(origin === HERE ? { seeds: [here!] } : { change_ref: origin }),
        hops,
        attach_to: here!,
        direction,
        ...(edge_types.length ? { edge_types } : {}),
      })
      if (selected) {
        attach(selected, {
          id: answer.result_ref,
          title: `Affected neighborhood, ${answer.affected_count} nodes`,
          value: asJson(answer),
          attached_at_ms: Date.now(),
        })
      }
      return answer
    },
  })
  return (
    <Section title="Affected neighborhood">
      <ToolError error={engines.error} />
      {engines.data && (
        <Badge
          size="sm"
          variant={engines.data.available ? 'success' : 'warning'}
          className="self-start"
        >
          {engines.data.selected ?? engines.data.engine}
          {engines.data.available ? ', available' : ', unavailable'}
        </Badge>
      )}
      <div className="flex flex-col gap-1.5">
        <Choice
          label="Start from"
          value={origin}
          options={[
            { value: HERE, label: nodeRecord ? selected! : 'This program' },
            ...(changes.data ?? []).map((change) => ({
              value: change.id,
              label: `Change: ${change.title ?? change.id}`,
            })),
          ]}
          onChange={setOrigin}
        />
        <ToolError error={changes.error ?? records.error} />
        <Input
          size="sm"
          aria-label="Edge types"
          placeholder="All edge types, or name some"
          value={edgeTypes}
          onChange={(event) => setEdgeTypes(event.target.value)}
        />
        <div className="flex items-center gap-1.5">
          <NumberEntry
            label="Hops"
            className="w-24 shrink-0"
            min={1}
            max={16}
            value={hops}
            onChange={setHops}
          />
          <Choice
            label="Direction"
            value={direction}
            options={[
              { value: 'both', label: 'Both directions' },
              { value: 'forward', label: 'Forward' },
              { value: 'reverse', label: 'Reverse' },
            ]}
            onChange={setDirection}
          />
        </div>
        <Button
          size="xs"
          variant="outline"
          className="self-start"
          disabled={!here || compute.isPending}
          onClick={() => compute.mutate()}
        >
          Compute and attach
        </Button>
      </div>
      <ToolError error={compute.error} />
      {compute.data && (
        <div className="flex flex-col gap-1">
          <p className="text-ink">
            {compute.data.affected_count} affected from{' '}
            {compute.data.seeds.length} seeds, {compute.data.engine}
            {compute.data.truncated && ', truncated'}
          </p>
          <p className="truncate font-mono text-ink-faint">
            {compute.data.result_ref}
          </p>
          <ol className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {compute.data.affected.map((node) => (
              <li key={node.node_id} className="flex gap-2">
                <span className="shrink-0 font-mono text-ink-faint">
                  {node.hop}
                </span>
                <span className="min-w-0 truncate">
                  {canvasNames.get(node.node_id) ?? node.node_id}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Section>
  )
}

const receiptOf = (surface: LispSurface | undefined) =>
  surface?.execution?.receipt ?? surface?.failure?.receipt

const LISP_EXTENSIONS = [
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ 'aria-label': 'Graph Lisp expression' }),
  EditorView.theme({
    '&': { fontSize: '11px', maxHeight: '16rem' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-content': { minHeight: '5.5rem' },
  }),
]

function LispEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const { resolvedTheme } = useTheme()
  return (
    <CodeMirror
      className="overflow-hidden rounded-md border border-separator focus-within:border-focus"
      value={value}
      onChange={(next) => onChange(next)}
      extensions={LISP_EXTENSIONS}
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      indentWithTab={false}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
      }}
    />
  )
}

/** Typed as JSON when it parses, so a number stays a number; otherwise it is text. */
function argumentValue(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * An expression that needs values runs in a session of its own, with each value defined
 * first. Its receipt then proves the expression itself, so it can be saved and called.
 */
async function evaluateWith(
  source: string,
  fuel: number,
  inputs: Array<string>,
  values: Record<string, string>,
) {
  if (inputs.length === 0) return graphLisp('eval', { source, fuel })
  const created = await graphLisp('session_create', {})
  const session = created.session?.session_id
  for (const symbol of inputs) {
    const value = JSON.stringify(argumentValue(values[symbol] ?? ''))
    await graphLisp('session_eval', {
      session_id: session,
      source: `(def! ${symbol} ${value})`,
      fuel,
    })
  }
  return graphLisp('session_eval', { session_id: session, source, fuel })
}

/** One saved expression: called by name with its free symbols bound, or reopened. */
function ProcedureRow({
  procedure,
  fuel,
  onOpen,
}: {
  procedure: Procedure
  fuel: number
  onOpen: (source: string) => void
}) {
  const [bindings, setBindings] = useState<Record<string, string>>({})
  const call = useMutation({
    mutationFn: () =>
      graphLisp('call', {
        name: procedure.name,
        fuel,
        arguments: Object.fromEntries(
          procedure.free_symbols.map((symbol) => [
            symbol,
            argumentValue(bindings[symbol] ?? ''),
          ]),
        ),
      }),
  })
  const unbound = procedure.free_symbols.some((symbol) => !bindings[symbol])
  return (
    <li className="flex flex-col gap-1.5">
      <p className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-ink">{procedure.name}</span>
        <span className="flex shrink-0 gap-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onOpen(procedure.source)}
          >
            Open
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={unbound || call.isPending}
            onClick={() => call.mutate()}
          >
            Call
          </Button>
        </span>
      </p>
      <p className="truncate font-mono text-ink-muted">{procedure.source}</p>
      {procedure.free_symbols.map((symbol) => (
        <Labeled key={symbol} label={symbol}>
          <Input
            size="sm"
            value={bindings[symbol] ?? ''}
            onChange={(event) =>
              setBindings({ ...bindings, [symbol]: event.target.value })
            }
          />
        </Labeled>
      ))}
      <ToolError error={call.error} />
      {call.data && <Json value={call.data.graph_lisp?.execution?.result} />}
    </li>
  )
}

/** Expressions keep their identity and receipt per revision, so any two can be compared. */
function LispNotebook() {
  const client = useQueryClient()
  const procedures = useQuery({
    queryKey: ['programs', 'procedures'],
    queryFn: listProcedures,
    retry: false,
  })
  const revisions = useProgramDoc((doc) => doc.layout.lisp) ?? []
  const setLisp = useProgramDoc((doc) => doc.setLisp)
  const [source, setSource] = useState(revisions.at(-1)?.source ?? '')
  const [fuel, setFuel] = useState(10_000)
  const [name, setName] = useState('')
  const [compareTo, setCompareTo] = useState<string>()
  const [settledSource] = useDebouncedValue(source, { wait: 400 })
  const explained = useQuery({
    enabled: Boolean(settledSource),
    queryKey: ['programs', 'lisp-inputs', settledSource],
    queryFn: () => graphLisp('explain', { source: settledSource }),
    retry: false,
  })
  const inputs =
    explained.data?.graph_lisp?.execution?.result.explanation?.inputs ?? []
  const [values, setValues] = useState<Record<string, string>>({})
  const missingInput = inputs.some((symbol) => !values[symbol])
  const evaluate = useMutation({
    mutationFn: async () => {
      const answer = await evaluateWith(source, fuel, inputs, values)
      const surface = answer.graph_lisp
      const receipt = receiptOf(surface)
      if (!receipt)
        throw new Error('Theorem returned no receipt for this expression.')
      const revision: LispRevision = {
        id: crypto.randomUUID(),
        source,
        fuel,
        root: surface?.execution?.result.root,
        receipt_id: receipt.receipt_id,
        status: receipt.status,
        output: asJson(surface?.execution?.result ?? surface?.failure?.error),
      }
      setLisp([...revisions.slice(-19), revision])
      return revision
    },
  })
  const explain = useMutation({
    mutationFn: () => graphLisp('explain', { source }),
  })
  const compare = useMutation({
    mutationFn: (before: string) =>
      graphLisp('diff', { before, after: source }),
  })
  const save = useMutation({
    mutationFn: (receiptId: string) =>
      graphLisp('promote', { name, source, receipt_ids: [receiptId] }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['programs', 'procedures'] }),
  })
  const latest = revisions.at(-1)
  const before = revisions.find((revision) => revision.id === compareTo)?.source
  const savable = latest?.source === source && latest.status === 'succeeded'
  return (
    <Section title="Graph Lisp">
      <LispEditor value={source} onChange={setSource} />
      {inputs.map((symbol) => (
        <Labeled key={symbol} label={symbol}>
          <Input
            size="sm"
            value={values[symbol] ?? ''}
            onChange={(event) =>
              setValues({ ...values, [symbol]: event.target.value })
            }
          />
        </Labeled>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <NumberEntry
          label="Fuel"
          className="w-32"
          min={0}
          max={1_000_000}
          value={fuel}
          onChange={setFuel}
        />
        <Button
          size="xs"
          disabled={!source || missingInput || evaluate.isPending}
          onClick={() => evaluate.mutate()}
        >
          Evaluate
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={!source || explain.isPending}
          onClick={() => explain.mutate()}
        >
          Explain
        </Button>
      </div>
      <ToolError error={evaluate.error ?? explain.error} />
      {latest && (
        <dl className="flex flex-col gap-1">
          <dt className="text-ink-muted">Expression</dt>
          <dd className="truncate font-mono text-ink">
            {latest.root ?? latest.source}
          </dd>
          <dt className="text-ink-muted">Evidence</dt>
          <dd className="truncate font-mono text-ink">{latest.receipt_id}</dd>
          <dt className="text-ink-muted">Result, {latest.status}</dt>
          <dd>
            <Json value={latest.output} />
          </dd>
        </dl>
      )}
      {explain.data && (
        <Json value={explain.data.graph_lisp?.execution?.result} />
      )}
      {revisions.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Choice
            label="Earlier revision"
            placeholder="Compare with"
            value={compareTo}
            options={revisions.map((revision, index) => ({
              value: revision.id,
              label: `Revision ${index + 1}: ${revision.source.slice(0, 40)}`,
            }))}
            onChange={setCompareTo}
          />
          <Button
            size="xs"
            variant="outline"
            className="self-start"
            disabled={!before || compare.isPending}
            onClick={() => before && compare.mutate(before)}
          >
            Compare
          </Button>
          <ToolError error={compare.error} />
          {compare.data && (
            <Json value={compare.data.graph_lisp?.execution?.result} />
          )}
        </div>
      )}
      {savable && (
        <div className="flex items-center gap-1.5">
          <Input
            size="sm"
            aria-label="Name to save this expression under"
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            size="xs"
            variant="outline"
            disabled={!name || save.isPending}
            onClick={() => save.mutate(latest.receipt_id)}
          >
            Save
          </Button>
        </div>
      )}
      <ToolError error={save.error} />
      {save.isSuccess && (
        <Alert variant="success" className="px-2.5 py-2">
          <AlertDescription className="text-xs">
            Saved as {name}.
          </AlertDescription>
        </Alert>
      )}
      <ToolError error={procedures.error} />
      {procedures.data && procedures.data.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-ink-muted">Saved procedures</p>
          <ul className="flex flex-col gap-3">
            {procedures.data.map((procedure) => (
              <ProcedureRow
                key={procedure.name}
                procedure={procedure}
                fuel={fuel}
                onOpen={setSource}
              />
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

function GraphLint() {
  const select = useProgramDoc((doc) => doc.select)
  const nodes = useProgramDoc((doc) => doc.program?.nodes)
  const lint = useQuery({
    queryKey: ['programs', 'lint', 'whole'],
    queryFn: () => lintGraph(),
    retry: false,
  })
  return (
    <Section title="Graph lint">
      <ToolError error={lint.error} />
      {lint.data && (
        <>
          <p className="text-ink-muted">
            {lint.data.report.verdict}, {lint.data.report.diagnostics.length}{' '}
            findings
          </p>
          <ul className="flex flex-col gap-1.5">
            {lint.data.report.diagnostics.slice(0, 50).map((diagnostic) => {
              const onCanvas = nodes?.some(
                (node) => node.id === diagnostic.subject,
              )
              return (
                <li key={diagnostic.id}>
                  <p className="text-ink">{diagnostic.message}</p>
                  {onCanvas ? (
                    <Button
                      size="xs"
                      variant="link"
                      className="block h-auto max-w-full truncate p-0 text-left font-normal text-ink-muted underline"
                      onClick={() => select(diagnostic.subject)}
                    >
                      {diagnostic.subject}
                    </Button>
                  ) : (
                    <p className="truncate text-ink-muted">
                      {diagnostic.subject}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Section>
  )
}

type SourceKind = 'stream' | 'mutation'
type WindowKind = 'none' | 'tumbling' | 'absence'
type ConditionKind = 'always' | 'payload_equals' | 'count_at_least'

function buildRule(form: {
  id: string
  source: SourceKind
  topic: string
  labels: string
  kinds: string
  window: WindowKind
  seconds: number
  condition: ConditionKind
  path: string
  value: string
  threshold: number
  emitTopic: string
  emitKind: string
  urgency: string
}) {
  const kinds = listOf(form.kinds)
  const durationMs = form.seconds * 1000
  return {
    id: form.id,
    sources: [
      form.source === 'stream'
        ? { type: 'stream', topic: form.topic, kinds }
        : { type: 'mutation', labels: listOf(form.labels), kinds },
    ],
    window:
      form.window === 'none'
        ? { kind: 'none' }
        : { kind: form.window, duration_ms: durationMs },
    predicate:
      form.condition === 'always'
        ? { type: 'always' }
        : form.condition === 'payload_equals'
          ? { type: 'payload_equals', path: form.path, value: form.value }
          : { type: 'count_at_least', threshold: form.threshold },
    emit: { topic: form.emitTopic, kind: form.emitKind, urgency: form.urgency },
  }
}

function RuleForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({
    id: '',
    source: 'mutation' as SourceKind,
    topic: '',
    labels: '',
    kinds: '',
    window: 'none' as WindowKind,
    seconds: 60,
    condition: 'always' as ConditionKind,
    path: '',
    value: '',
    threshold: 2,
    emitTopic: 'program.notifications',
    emitKind: '',
    urgency: 'info',
  })
  const field =
    (key: keyof typeof form) => (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))
  const set =
    <TKey extends keyof typeof form>(key: TKey) =>
    (next: (typeof form)[TKey]) =>
      setForm((current) => ({ ...current, [key]: next }))
  const save = useMutation({
    mutationFn: () => deriveCommand('upsert', { rule: buildRule(form) }),
    onSuccess: onSaved,
  })
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <Labeled label="Rule name">
        <Input size="sm" value={form.id} onChange={field('id')} />
      </Labeled>
      <Labeled label="Watch">
        <Choice
          label="Watch"
          value={form.source}
          options={[
            { value: 'mutation', label: 'Changes to graph records' },
            { value: 'stream', label: 'Events on a stream' },
          ]}
          onChange={set('source')}
        />
      </Labeled>
      {form.source === 'stream' ? (
        <Labeled label="Stream">
          <Input size="sm" value={form.topic} onChange={field('topic')} />
        </Labeled>
      ) : (
        <Labeled label="Record labels, comma separated">
          <Input size="sm" value={form.labels} onChange={field('labels')} />
        </Labeled>
      )}
      <Labeled
        label={
          form.source === 'stream'
            ? 'Event kinds, comma separated'
            : 'Change kinds, comma separated (node_upserted, node_deleted, edge_upserted, edge_deleted)'
        }
      >
        <Input size="sm" value={form.kinds} onChange={field('kinds')} />
      </Labeled>
      <Labeled label="Timing">
        <Choice
          label="Timing"
          value={form.window}
          options={[
            { value: 'none', label: 'Each event' },
            { value: 'tumbling', label: 'Every window of time' },
            { value: 'absence', label: 'When nothing arrives for a while' },
          ]}
          onChange={set('window')}
        />
      </Labeled>
      {form.window !== 'none' && (
        <Labeled label="Seconds">
          <NumberEntry
            label="Seconds"
            value={form.seconds}
            onChange={set('seconds')}
          />
        </Labeled>
      )}
      <Labeled label="Only when">
        <Choice
          label="Only when"
          value={form.condition}
          options={[
            { value: 'always', label: 'Always' },
            { value: 'payload_equals', label: 'A payload field equals' },
            { value: 'count_at_least', label: 'At least this many arrive' },
          ]}
          onChange={set('condition')}
        />
      </Labeled>
      {form.condition === 'payload_equals' && (
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="Path">
            <Input
              size="sm"
              className="font-mono"
              placeholder="payload.record.properties.status"
              value={form.path}
              onChange={field('path')}
            />
          </Labeled>
          <Labeled label="Value">
            <Input size="sm" value={form.value} onChange={field('value')} />
          </Labeled>
        </div>
      )}
      {form.condition === 'count_at_least' && (
        <Labeled label="Count">
          <NumberEntry
            label="Count"
            value={form.threshold}
            onChange={set('threshold')}
          />
        </Labeled>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="Emit to stream">
          <Input
            size="sm"
            value={form.emitTopic}
            onChange={field('emitTopic')}
          />
        </Labeled>
        <Labeled label="Event kind">
          <Input size="sm" value={form.emitKind} onChange={field('emitKind')} />
        </Labeled>
      </div>
      <Labeled label="Urgency">
        <Choice
          label="Urgency"
          value={form.urgency}
          options={[
            { value: 'info', label: 'Info' },
            { value: 'ask', label: 'Ask' },
            { value: 'block', label: 'Block' },
          ]}
          onChange={set('urgency')}
        />
      </Labeled>
      <ToolError error={save.error} />
      <Button
        type="submit"
        size="sm"
        disabled={!form.id.trim() || !form.emitKind.trim() || save.isPending}
      >
        Save rule
      </Button>
    </form>
  )
}

type RuleNode = {
  id: string
  properties?: {
    rule_id?: string
    enabled?: boolean
    rule?: Record<string, unknown>
  }
}

function DeriveRules() {
  const [adding, setAdding] = useState(false)
  const rules = useQuery({
    queryKey: ['programs', 'derive'],
    queryFn: () => deriveCommand('list'),
    retry: false,
  })
  const poll = useMutation({
    mutationFn: () => deriveCommand('poll', { limit: 100 }),
    onSuccess: () => rules.refetch(),
  })
  const toggle = useMutation({
    mutationFn: (rule: Record<string, unknown>) =>
      deriveCommand('upsert', { rule }),
    onSuccess: () => rules.refetch(),
  })
  const listed = (rules.data?.rules ?? []) as Array<RuleNode>
  return (
    <Section
      title="Derivation rules"
      action={
        <div className="flex gap-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => setAdding(!adding)}
          >
            {adding ? 'Close' : 'Add rule'}
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={poll.isPending}
            onClick={() => poll.mutate()}
          >
            Consume now
          </Button>
        </div>
      }
    >
      <ToolError error={rules.error ?? poll.error ?? toggle.error} />
      {adding && (
        <RuleForm
          onSaved={() => {
            setAdding(false)
            void rules.refetch()
          }}
        />
      )}
      <ul className="flex flex-col gap-1">
        {listed.map((rule) => (
          <li key={rule.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-ink">
              {rule.properties?.rule_id ?? rule.id}
            </span>
            <Switch
              aria-label={`Run ${rule.properties?.rule_id ?? rule.id}`}
              checked={rule.properties?.enabled !== false}
              disabled={!rule.properties?.rule || toggle.isPending}
              onCheckedChange={(enabled) => {
                if (rule.properties?.rule)
                  toggle.mutate({ ...rule.properties.rule, enabled })
              }}
            />
          </li>
        ))}
      </ul>
      {poll.data && (
        <p className="text-ink-muted">
          {Array.isArray(poll.data.rules) && poll.data.rules.length > 0
            ? `${poll.data.rules.length} rules fired`
            : 'Nothing new to consume'}
        </p>
      )}
    </Section>
  )
}

/**
 * Committing a spec document is what derives its Spec, Deliverable and
 * AcceptanceCriterion records; the receipt names each one and the document it came from.
 */
function SpecDerive() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const commit = useMutation({
    mutationFn: () => commitSpec(title, content),
  })
  const receipt = commit.data?.derivation?.receipt
  return (
    <Section title="Derive from a spec">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          commit.mutate()
        }}
      >
        <Input
          size="sm"
          aria-label="Spec title"
          placeholder="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Textarea
          size="sm"
          aria-label="Spec text"
          className="font-mono"
          rows={6}
          placeholder={
            '# SPEC-NAME-1.0\nRegister: execution\n\n## Deliverables\n\n- ...'
          }
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!title.trim() || !content.trim() || commit.isPending}
        >
          Commit and derive
        </Button>
      </form>
      <ToolError error={commit.error} />
      {receipt && (
        <>
          <p>
            {receipt.record_ids.length} records from {receipt.document_id}, rule{' '}
            {receipt.rule_id}
          </p>
          <ul className="flex flex-col gap-1">
            {receipt.record_ids.map((id) => (
              <li key={id} className="truncate font-mono text-ink" title={id}>
                {id}
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

export function ComputePanel() {
  return (
    <>
      <Neighborhood />
      <LispNotebook />
      <GraphLint />
      <DeriveRules />
      <SpecDerive />
    </>
  )
}
