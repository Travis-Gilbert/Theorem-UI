// SOURCING: @tanstack/react-query over Theorem's own tools: why_derivation_trace and
// fold_semiring answer the derivation questions, programmable_graph interior and
// advance_pin carry compound nodes, and the run receipt supplies each output. Controls are
// the vendored coss kit (Textarea, Checkbox, Label, Badge, Alert, Empty) and
// JSON entry is @uiw/react-codemirror in lib/codemirror-theme's theme, as
// blocks/source-editor uses it.
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import type { Extension } from '@uiw/react-codemirror'
import { Fragment, useMemo, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/coss/alert'
import { Badge } from '@/components/coss/badge'
import { Checkbox } from '@/components/coss/checkbox'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/coss/empty'
import { Label } from '@/components/coss/label'
import { Textarea } from '@/components/coss/textarea'
import type {
  ProgramDefinition,
  ProgramNode,
  ProgramNodeInspection,
  ProgramValueRef,
} from '@/lib/program/contracts'
import { Button } from '@/components/ui/button'
import {
  advancePin,
  collapseNode,
  expandNode,
  forkProgram,
  interiorVersions,
  saveProgram,
  programInterior,
  programKeys,
} from '@/lib/program/api'
import type { CompoundChange } from '@/lib/program/api'
import { declaredParameters, isLongParameter } from '@/lib/program/parameters'
import type { Parameter } from '@/lib/program/parameters'
import { useProgramDoc } from '@/lib/program/store'
import { affectedNeighborhood } from '@/lib/program/compute'
import { describeError } from '@/lib/theorem/client'
import { callTool, fetchSpill } from '@/lib/theorem/native'
import { useCodeMirrorTheme } from '@/lib/codemirror-theme'
import { Affordances, Attachments, NodeDiagnostics } from './node-compute'
import { Choice, Json, Labeled, Section, ToolError } from './section'
import { AuthorityChoice } from './standing-sections'

const SEMIRINGS = [
  'boolean',
  'counting',
  'tropical',
  'probability',
  'viterbi',
  'corroboration',
] as const

const ENTRY_THEME = EditorView.theme({
  '&': { fontSize: '11px', maxHeight: '16rem' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content, .cm-gutter': { minHeight: '3.5rem' },
})

/** JSON typed by hand. The name goes on the editable surface, the editor's textbox. */
const JSON_LANGUAGE = json()

function JsonEntry({
  label,
  value,
  onChange,
  onBlur,
  language = JSON_LANGUAGE,
  placeholder,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  onBlur: () => void
  language?: Extension
  placeholder?: string
}) {
  const codeMirrorTheme = useCodeMirrorTheme()
  const extensions = useMemo(
    () => [
      language,
      EditorView.lineWrapping,
      ENTRY_THEME,
      EditorView.contentAttributes.of({ 'aria-label': label }),
    ],
    [label, language],
  )
  return (
    <CodeMirror
      className="w-full overflow-hidden rounded-md border border-separator focus-within:border-focus"
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      onBlur={onBlur}
      extensions={extensions}
      theme={codeMirrorTheme}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
      }}
    />
  )
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <Label className="gap-1.5 text-xs font-normal text-ink sm:text-xs">
      <Checkbox checked={checked} onCheckedChange={(next) => onChange(next)} />
      {label}
    </Label>
  )
}

/** A standing message in the panel, sized as ToolError is. */
function Notice({
  variant,
  children,
}: {
  variant: ComponentProps<typeof Alert>['variant']
  children: ReactNode
}) {
  return (
    <Alert variant={variant} className="px-2.5 py-2">
      <AlertDescription className="text-xs break-words">
        {children}
      </AlertDescription>
    </Alert>
  )
}

/** The node's own kind fields, edited as what they are in the definition. */
const JAVASCRIPT_LANGUAGE = javascript()
const PLAIN_LANGUAGE: Extension = []

function LongParameter({
  nodeId,
  parameter,
  value,
}: {
  nodeId: string
  parameter: Parameter
  value: unknown
}) {
  const setParameter = useProgramDoc((doc) => doc.setParameter)
  const isCode = parameter.control === 'code'
  const shown = isCode
    ? typeof value === 'string'
      ? value
      : ''
    : JSON.stringify(value ?? {}, null, 2)
  const [text, setText] = useState(shown)
  const [seen, setSeen] = useState(shown)
  if (seen !== shown) {
    setSeen(shown)
    setText(shown)
  }
  const [invalid, setInvalid] = useState(false)
  const commit = () => {
    if (isCode) return setParameter(nodeId, parameter.name, text || undefined)
    try {
      setParameter(nodeId, parameter.name, JSON.parse(text))
      setInvalid(false)
    } catch {
      setInvalid(true)
    }
  }
  return (
    <Labeled label={parameter.title}>
      <JsonEntry
        label={parameter.title}
        value={text}
        onChange={setText}
        onBlur={commit}
        language={
          !isCode
            ? JSON_LANGUAGE
            : parameter.language === 'javascript'
              ? JAVASCRIPT_LANGUAGE
              : PLAIN_LANGUAGE
        }
        placeholder={
          parameter.language === 'javascript'
            ? 'return { output: input.input };'
            : undefined
        }
      />
      {invalid && <Notice variant="error">Not valid JSON yet</Notice>}
    </Labeled>
  )
}

function KindFields({ node }: { node: ProgramNode }) {
  const patchNode = useProgramDoc((doc) => doc.patchNode)
  const long = declaredParameters(node).filter(isLongParameter)
  const {
    id: _id,
    block_id: _block,
    contract: _contract,
    inputs: _inputs,
    outputs: _outputs,
    bypassed: _bypassed,
    muted: _muted,
    station: _station,
    kind: _kind,
    // A compound's pin moves through its versions in Interior, not by typing an id.
    interior_program_id: _interior,
    pinned_content_id: _pinned,
    ...rest
  } = node as unknown as Record<string, unknown>
  // These blocks are set through their own editors; what they run is theirs, not a raw field.
  const fields = Object.entries(rest).filter(
    ([name]) =>
      long.length === 0 || (name !== 'affordance_id' && name !== 'parameters'),
  )
  return (
    <>
      {fields.map(([name, value]) => (
        <FieldEditor
          key={`${node.id}:${name}`}
          name={name}
          value={value}
          onCommit={(next) => patchNode(node.id, { [name]: next })}
        />
      ))}
      {long.map((parameter) => (
        <LongParameter
          key={`${node.id}:${parameter.name}`}
          nodeId={node.id}
          parameter={parameter}
          value={node.parameters?.[parameter.name]}
        />
      ))}
    </>
  )
}

function FieldEditor({
  name,
  value,
  onCommit,
}: {
  name: string
  value: unknown
  onCommit: (next: unknown) => void
}) {
  const isText = typeof value === 'string'
  const shown = isText ? value : JSON.stringify(value, null, 2)
  const [text, setText] = useState(shown)
  // The node's own widgets write this value too; follow them.
  const [seen, setSeen] = useState(shown)
  if (seen !== shown) {
    setSeen(shown)
    setText(shown)
  }
  const [invalid, setInvalid] = useState(false)
  const label = name.replaceAll('_', ' ')
  if (typeof value === 'boolean') {
    return <CheckField label={label} checked={value} onChange={onCommit} />
  }
  const commit = () => {
    if (isText) return onCommit(text)
    try {
      onCommit(JSON.parse(text))
      setInvalid(false)
    } catch {
      setInvalid(true)
    }
  }
  return (
    <Labeled label={label}>
      {isText ? (
        <Textarea
          size="sm"
          // A short value keeps one row; the kit's minimum height would hold three.
          className={text.length < 60 ? '[&_textarea]:min-h-0' : undefined}
          rows={text.length < 60 ? 1 : 3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
        />
      ) : (
        <JsonEntry
          label={label}
          value={text}
          onChange={setText}
          onBlur={commit}
        />
      )}
      {invalid && <Notice variant="error">Not valid JSON yet</Notice>}
    </Labeled>
  )
}

/** A pin names its value by hash; a spilled value already carries Theorem's digest. */
async function valueHash(value: ProgramValueRef) {
  if (value.storage === 'spilled') return value.digest
  const bytes = new TextEncoder().encode(JSON.stringify(value.value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return `value:${hex}`
}

/** An inline value shows; a spilled one shows its summary and loads on request. */
function ValueView({ value }: { value: ProgramValueRef }) {
  const spilled = value.storage === 'spilled' ? value.fetch_handle : undefined
  const full = useMutation({
    mutationFn: () => fetchSpill(spilled!),
  })
  if (value.storage === 'inline') return <Json value={value.value} />
  return (
    <>
      <Json value={full.data ?? value.summary} />
      {!full.data && (
        <Button
          size="xs"
          variant="outline"
          className="self-start"
          disabled={full.isPending}
          onClick={() => full.mutate()}
        >
          Load all {value.original_bytes} bytes
        </Button>
      )}
      <ToolError error={full.error} />
    </>
  )
}

function Output({ inspection }: { inspection: ProgramNodeInspection }) {
  const pins = useProgramDoc((doc) => doc.layout.pins)
  const setPins = useProgramDoc((doc) => doc.setPins)
  const nodeId = inspection.node_id
  const pinned = pins?.[nodeId]
  const output = inspection.outputs
  return (
    <>
      {output && <ValueView value={output} />}
      {inspection.stale && (
        <Notice variant="warning">
          An upstream value changed since this was pinned.
        </Notice>
      )}
      <Button
        size="xs"
        variant="outline"
        className="self-start"
        disabled={!pinned && !output}
        onClick={async () => {
          const next = { ...pins }
          if (pinned) delete next[nodeId]
          else if (output) {
            next[nodeId] = {
              value: output,
              value_hash: await valueHash(output),
              pinned_at_ms: Date.now(),
            }
          }
          setPins(next)
        }}
      >
        {pinned ? 'Unpin output' : 'Pin this output'}
      </Button>
    </>
  )
}

/** Keyed by node and stored value, so editing starts over when either changes. */
function Tweaks({ nodeId }: { nodeId: string }) {
  const stored = useProgramDoc((doc) => doc.tweaks[nodeId])
  return (
    <TweakEditor
      key={`${nodeId}:${JSON.stringify(stored)}`}
      nodeId={nodeId}
      stored={stored}
    />
  )
}

function TweakEditor({ nodeId, stored }: { nodeId: string; stored: unknown }) {
  const setTweak = useProgramDoc((doc) => doc.setTweak)
  const [text, setText] = useState(
    stored === undefined ? '' : JSON.stringify(stored, null, 2),
  )
  const [invalid, setInvalid] = useState(false)
  return (
    <>
      <JsonEntry
        label="Tweak for the next run"
        value={text}
        onChange={setText}
        onBlur={() => {
          if (!text.trim()) {
            setTweak(nodeId, undefined)
            setInvalid(false)
            return
          }
          try {
            setTweak(nodeId, JSON.parse(text))
            setInvalid(false)
          } catch {
            setInvalid(true)
          }
        }}
      />
      {invalid && <Notice variant="error">Not valid JSON yet</Notice>}
    </>
  )
}

type WhyNode = {
  node_id: string
  is_assumption: boolean
  supports?: Array<WhyNode>
}

type WhyAnswer = {
  root: WhyNode
  total_supporters: number
  assumption_count: number
}

/** What depends on an assumption, from Theorem's graph, kept with the derivation. */
function Dependents({
  assumption,
  target,
}: {
  assumption: string
  target: string
}) {
  const downstream = useMutation({
    mutationFn: () =>
      affectedNeighborhood({
        seeds: [assumption],
        hops: 4,
        attach_to: target,
        direction: 'forward',
      }),
  })
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="xs"
        variant="ghost"
        className="self-start"
        disabled={downstream.isPending}
        onClick={() => downstream.mutate()}
      >
        What depends on this
      </Button>
      <ToolError error={downstream.error} />
      {downstream.data && (
        <ul className="flex flex-col gap-0.5 pl-2">
          {downstream.data.affected.map((node) => (
            <li key={node.node_id} className="truncate">
              {node.node_id}
            </li>
          ))}
          {downstream.data.affected_count === 0 && <li>Nothing yet.</li>}
        </ul>
      )}
    </div>
  )
}

function WhyTree({ node, target }: { node: WhyNode; target: string }) {
  return (
    <li className="flex flex-col gap-1">
      <p className="flex items-center gap-1.5 text-ink" title={node.node_id}>
        <span className="min-w-0 truncate">{node.node_id}</span>
        {node.is_assumption && (
          <Badge variant="outline" size="sm" className="text-ink-muted">
            assumption
          </Badge>
        )}
      </p>
      {node.is_assumption && (
        <Dependents assumption={node.node_id} target={target} />
      )}
      {node.supports?.length ? (
        <ul className="flex flex-col gap-1 border-l border-separator pl-2">
          {node.supports.map((support) => (
            <WhyTree key={support.node_id} node={support} target={target} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/** Why this value holds: its derivation, what supports it, and the fold over it. */
function Derivation({ derivationId }: { derivationId: string }) {
  const why = useQuery({
    queryKey: ['programs', 'why', derivationId],
    queryFn: () =>
      callTool<{ trace: WhyAnswer }>('why_derivation_trace', {
        node_id: derivationId,
      }).then((answer) => answer.trace),
    retry: false,
  })
  const folds = useQueries({
    queries: SEMIRINGS.map((semiring) => ({
      queryKey: ['programs', 'fold', derivationId, semiring],
      queryFn: () =>
        callTool<{ value: unknown }>('fold_semiring', {
          node_id: derivationId,
          semiring_kind: semiring,
        }),
      enabled: why.isSuccess,
      retry: false,
    })),
  })
  // Nothing has derived this value until a run does; that is a state, not a failure.
  const underived =
    why.error != null && describeError(why.error).endsWith('not found')
  if (underived) {
    return (
      <Notice variant="info">{derivationId} has not been derived yet.</Notice>
    )
  }
  return (
    <>
      <ToolError error={why.error} />
      {why.data && (
        <>
          <p>
            {why.data.total_supporters} supporting, {why.data.assumption_count}{' '}
            assumptions
          </p>
          <ul>
            <WhyTree node={why.data.root} target={derivationId} />
          </ul>
        </>
      )}
      {why.isSuccess && (
        <dl className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1">
          {SEMIRINGS.map((semiring, index) => {
            const fold = folds[index]!
            return (
              <Fragment key={semiring}>
                <dt className="text-ink-muted">{semiring}</dt>
                <dd className="min-w-0">
                  <ToolError error={fold.error} />
                  {fold.data && <Json value={fold.data.value} />}
                </dd>
              </Fragment>
            )
          })}
        </dl>
      )}
    </>
  )
}

/** Theorem saves a compound change over the draft, or as a new draft of a published program. */
function useCompoundChange() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const openId = useProgramDoc((doc) => doc.nodeId)
  return (saved: CompoundChange) => {
    // The draft's content id moved. Reads keyed on the old one would be refused.
    if (saved.node_id === openId) {
      const doc = useProgramDoc.getState()
      doc.saved(saved.node_id, saved.content_id, doc.definitionRevision)
    }
    void client.invalidateQueries({ queryKey: ['programs', 'interior'] })
    void client.invalidateQueries({
      queryKey: ['programs', 'interior-versions'],
    })
    if (saved.node_id === openId) {
      void client.invalidateQueries({
        queryKey: programKeys.load(saved.node_id),
      })
    } else {
      void client.invalidateQueries({ queryKey: programKeys.list() })
      void navigate({ to: '/canvas', search: { program: saved.node_id } })
    }
  }
}

function Compound({
  node,
}: {
  node: ProgramNode & { kind: 'compound'; pinned_content_id: string }
}) {
  const programId = useProgramDoc((doc) => doc.contentId)!
  // A node placed a moment ago is not on the saved program until the autosave lands.
  const onSavedProgram = useProgramDoc(
    (doc) => doc.savedDefinition === doc.definitionRevision,
  )
  const interior = useQuery({
    enabled: onSavedProgram,
    queryKey: programKeys.interior(programId, node.id),
    queryFn: () => programInterior(programId, node.id),
    retry: false,
  })
  const versions = useQuery({
    enabled: onSavedProgram,
    queryKey: programKeys.interiorVersions(programId, node.id),
    queryFn: () => interiorVersions(programId, node.id),
    retry: false,
  })
  const [target, setTarget] = useState<string>()
  const changed = useCompoundChange()
  const advance = useMutation({
    mutationFn: () => advancePin(programId, node.id, target!),
    onSuccess: changed,
  })
  const collapse = useMutation({
    mutationFn: () => collapseNode(programId, node.id),
    onSuccess: changed,
  })
  const navigate = useNavigate()
  const client = useQueryClient()
  const fork = useMutation({
    mutationFn: async (interiorProgram: ProgramDefinition) => {
      const copy = await forkProgram(
        interiorProgram,
        `${interiorProgram.name} fork`,
        interiorProgram.intent,
      )
      return saveProgram(copy, {})
    },
    onSuccess: (saved) => {
      void client.invalidateQueries({ queryKey: programKeys.list() })
      void navigate({ to: '/canvas', search: { program: saved.node_id } })
    },
  })
  const expandedHere =
    interior.data?.program.metadata.expanded_from_node_id === node.id
  return (
    <>
      <p className="truncate text-ink" title={node.pinned_content_id}>
        {interior.data?.program.name}
      </p>
      <ToolError error={interior.error} />
      {versions.data && versions.data.length > 0 && (
        <>
          <Choice
            label="Later versions"
            placeholder="Later versions"
            value={target}
            options={versions.data.map((version) => ({
              value: version.content_id,
              label: `${version.name}, ${version.content_id.slice(-8)}`,
            }))}
            onChange={setTarget}
          />
          <Button
            size="xs"
            variant="outline"
            className="self-start"
            disabled={!target || advance.isPending}
            onClick={() => advance.mutate()}
          >
            Move the pin to this version
          </Button>
        </>
      )}
      <Button
        size="xs"
        variant="outline"
        className="self-start"
        disabled={!interior.data || fork.isPending}
        onClick={() => {
          if (interior.data) fork.mutate(interior.data.program)
        }}
      >
        Fork an editable copy
      </Button>
      {expandedHere && (
        <Button
          size="xs"
          variant="outline"
          className="self-start"
          disabled={collapse.isPending}
          onClick={() => collapse.mutate()}
        >
          Collapse back to a rule
        </Button>
      )}
      <ToolError error={advance.error ?? collapse.error ?? fork.error} />
    </>
  )
}

function ExpandRule({ nodeId }: { nodeId: string }) {
  const programId = useProgramDoc((doc) => doc.contentId)!
  const changed = useCompoundChange()
  const expand = useMutation({
    mutationFn: () => expandNode(programId, nodeId),
    onSuccess: changed,
  })
  return (
    <>
      <Button
        size="xs"
        variant="outline"
        className="self-start"
        disabled={expand.isPending}
        onClick={() => expand.mutate()}
      >
        Expand into a stack
      </Button>
      <ToolError error={expand.error} />
    </>
  )
}

export function NodeInspector() {
  const selected = useProgramDoc((doc) => doc.selected)
  const node = useProgramDoc((doc) =>
    doc.program?.nodes.find((candidate) => candidate.id === doc.selected),
  )
  const inspection = useProgramDoc((doc) =>
    doc.selected ? doc.receipt?.inspections[doc.selected] : undefined,
  )
  const refusal = useProgramDoc((doc) =>
    doc.run?.failureNode === doc.selected ? doc.run?.failure : undefined,
  )
  const advisory = useProgramDoc((doc) => doc.program?.authority === 'advisory')
  const patchNode = useProgramDoc((doc) => doc.patchNode)
  const removeNode = useProgramDoc((doc) => doc.removeNode)
  if (!selected || !node) {
    return (
      <Empty className="px-3 py-6 md:py-6">
        <EmptyHeader>
          <EmptyDescription className="text-xs text-ink-muted">
            Select a node.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  const derivationId =
    'target_derivation_id' in node ? node.target_derivation_id : undefined
  return (
    <div key={node.id}>
      <Section
        title={node.id}
        action={
          <Button size="xs" variant="ghost" onClick={() => removeNode(node.id)}>
            Delete
          </Button>
        }
      >
        <p className="flex items-center gap-1.5">
          <Badge variant="outline" size="sm" className="text-ink-muted">
            {node.kind.replace('_', ' ')}
          </Badge>
          <span className="min-w-0 truncate">{node.block_id}</span>
        </p>
        <div className="flex gap-3">
          <CheckField
            label="Bypass"
            checked={node.bypassed}
            onChange={(bypassed) => patchNode(node.id, { bypassed })}
          />
          <CheckField
            label="Mute"
            checked={node.muted}
            onChange={(muted) => patchNode(node.id, { muted })}
          />
        </div>
      </Section>
      <Section title="Configuration">
        {refusal && <Notice variant="error">{refusal}</Notice>}
        {refusal && advisory && <AuthorityChoice />}
        <KindFields node={node} />
      </Section>
      {inspection && (
        <Section title="Output">
          <Output inspection={inspection} />
        </Section>
      )}
      <NodeDiagnostics nodeId={node.id} />
      <Attachments nodeId={node.id} />
      <Affordances key={node.id} node={node} inspection={inspection} />
      <Section title="Tweak for the next run">
        <Tweaks nodeId={node.id} />
      </Section>
      {node.kind === 'compound' && (
        <Section title="Interior">
          <Compound node={node} />
        </Section>
      )}
      {node.kind === 'rule' && (
        <Section title="Interior">
          <ExpandRule nodeId={node.id} />
        </Section>
      )}
      {derivationId && (
        <Section title="Why">
          <Derivation derivationId={derivationId} />
        </Section>
      )}
      <Section title="Contract">
        <p className="text-ink">{node.contract.description}</p>
        <Json value={node.contract.capabilities} />
      </Section>
    </div>
  )
}
