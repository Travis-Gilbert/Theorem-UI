// SOURCING: after Craft web's field editor rows (Mobbin ebf78810-7a01-4f15-a3af-3051010ed5cd: one row per entry, edited in place) for the class's actions; the tool list is Theorem's native catalog (lib/theorem/tools useToolCatalog), field-form Segmented for the effect, ui/input and ui/textarea for the rest. The register validates the binding when the class is declared (rustyred-thg-schema operations.rs), so nothing here is a second validator.
import { useState } from 'react'
import type { FieldSpec } from '@/components/records/contract'
import { Segmented } from '@/components/records/field-form'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { operationKey } from '@/lib/objects/operations'
import type {
  OperationBinding,
  OperationInput,
  OperationInputKind,
} from '@/lib/objects/operations'
import { useToolCatalog } from '@/lib/theorem/tools'

const selectClass =
  'h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-focus'

/** A class's actions: each binds an existing tool, its arguments made from the object. */
export function OperationsEditor({
  value,
  onChange,
  fields,
}: {
  value: OperationBinding[]
  onChange: (next: OperationBinding[]) => void
  fields: FieldSpec[]
}) {
  const [open, setOpen] = useState<number>()
  const replace = (at: number, next: OperationBinding) =>
    onChange(value.map((b, i) => (i === at ? next : b)))
  return (
    <div className="flex flex-col gap-2">
      {value.map((binding, at) => (
        <div
          key={at}
          className="flex flex-col rounded-lg border border-separator"
        >
          <div className="group flex min-h-9 items-center gap-2 px-3">
            <button
              type="button"
              aria-expanded={open === at}
              onClick={() => setOpen(open === at ? undefined : at)}
              className="flex min-w-0 flex-1 items-center gap-2 text-start text-sm outline-none focus-visible:outline-2 focus-visible:outline-focus"
            >
              <span className="truncate">{binding.label || 'Action'}</span>
              <span className="truncate font-mono text-xs text-ink-faint">
                {binding.tool}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${binding.label || 'action'}`}
              onClick={() => onChange(value.filter((_, i) => i !== at))}
              className="flex size-6 items-center justify-center rounded text-ink-faint outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              <Icon.Delete aria-hidden className="size-3.5" />
            </button>
          </div>
          {open === at && (
            <BindingForm
              binding={binding}
              fields={fields}
              onChange={(next) => replace(at, next)}
            />
          )}
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="self-start"
        onClick={() => {
          onChange([
            ...value,
            { key: '', label: '', tool: '', arguments: {}, effect: 'read' },
          ])
          setOpen(value.length)
        }}
      >
        <Icon.Add aria-hidden className="size-3.5" />
        Add action
      </Button>
    </div>
  )
}

function BindingForm({
  binding,
  fields,
  onChange,
}: {
  binding: OperationBinding
  fields: FieldSpec[]
  onChange: (next: OperationBinding) => void
}) {
  const catalog = useToolCatalog()
  const [text, setText] = useState(() =>
    JSON.stringify(binding.arguments ?? {}, null, 2),
  )
  const [parseError, setParseError] = useState<string>()
  const inputs = binding.inputs ?? []
  const setInputs = (next: OperationInput[]) =>
    onChange({ ...binding, inputs: next.length ? next : undefined })
  const references = [
    '{{record.id}}',
    ...fields.map((f) => `{{record.${f.key}}}`),
    ...inputs.filter((i) => i.key).map((i) => `{{input.${i.key}}}`),
  ]
  return (
    <div className="flex flex-col gap-3 border-t border-separator p-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-muted">Name</span>
        <Input
          aria-label="Action name"
          value={binding.label}
          onChange={(event) => {
            const label = event.target.value
            onChange({ ...binding, label, key: operationKey(label) })
          }}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-muted">Tool</span>
        <select
          aria-label="Tool"
          value={binding.tool}
          onChange={(event) => {
            const tool = catalog.tools.find(
              (t) => t.name === event.target.value,
            )
            onChange({
              ...binding,
              tool: event.target.value,
              effect: tool && tool.effect !== 'read' ? 'write' : binding.effect,
            })
          }}
          className={selectClass}
        >
          <option value="">
            {catalog.status === 'loading' ? 'Loading…' : 'Choose a tool'}
          </option>
          {binding.tool &&
            !catalog.tools.some((t) => t.name === binding.tool) && (
              <option value={binding.tool}>{binding.tool}</option>
            )}
          {catalog.tools.map((tool) => (
            <option key={tool.name} value={tool.name}>
              {tool.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-muted">Effect</span>
        <Segmented
          label="Effect"
          value={binding.effect ?? 'read'}
          onChange={(effect) => onChange({ ...binding, effect })}
          options={[
            { value: 'read', label: 'Reads' },
            { value: 'write', label: 'Changes things' },
          ]}
        />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-muted">Arguments</span>
        <Textarea
          aria-label="Arguments"
          value={text}
          rows={5}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value)
            try {
              const parsed: unknown = JSON.parse(event.target.value || '{}')
              if (
                typeof parsed !== 'object' ||
                parsed === null ||
                Array.isArray(parsed)
              )
                throw new Error('The arguments are one JSON object.')
              setParseError(undefined)
              onChange({
                ...binding,
                arguments: parsed as Record<string, unknown>,
              })
            } catch (problem) {
              setParseError(
                problem instanceof Error ? problem.message : String(problem),
              )
            }
          }}
          className="font-mono text-xs"
        />
        {parseError && (
          <span role="alert" className="text-xs text-error-ink">
            {parseError}
          </span>
        )}
        <span className="flex flex-wrap gap-1">
          {references.map((reference) => (
            <code
              key={reference}
              className="rounded bg-frame px-1 font-mono text-[11px] text-ink-muted"
            >
              {reference}
            </code>
          ))}
        </span>
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-ink-muted">Inputs</span>
        {inputs.map((input, at) => (
          <div key={at} className="flex items-center gap-2">
            <Input
              aria-label="Input name"
              value={input.label}
              onChange={(event) => {
                const label = event.target.value
                setInputs(
                  inputs.map((i, n) =>
                    n === at ? { ...i, label, key: operationKey(label) } : i,
                  ),
                )
              }}
            />
            <select
              aria-label="Input kind"
              value={input.kind ?? 'text'}
              onChange={(event) =>
                setInputs(
                  inputs.map((i, n) =>
                    n === at
                      ? { ...i, kind: event.target.value as OperationInputKind }
                      : i,
                  ),
                )
              }
              className={`${selectClass} w-28 shrink-0`}
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Yes or no</option>
            </select>
            <label className="flex shrink-0 items-center gap-1 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={!!input.required}
                onChange={(event) =>
                  setInputs(
                    inputs.map((i, n) =>
                      n === at ? { ...i, required: event.target.checked } : i,
                    ),
                  )
                }
              />
              Required
            </label>
            <button
              type="button"
              aria-label={`Remove ${input.label || 'input'}`}
              onClick={() => setInputs(inputs.filter((_, n) => n !== at))}
              className="flex size-6 shrink-0 items-center justify-center rounded text-ink-faint outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              <Icon.Close aria-hidden className="size-3.5" />
            </button>
          </div>
        ))}
        <Button
          size="xs"
          variant="ghost"
          className="self-start"
          onClick={() =>
            setInputs([...inputs, { key: '', label: '', kind: 'text' }])
          }
        >
          <Icon.Add aria-hidden className="size-3" />
          Add input
        </Button>
      </div>
    </div>
  )
}
