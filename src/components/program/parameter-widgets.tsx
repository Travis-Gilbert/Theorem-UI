// SOURCING: coss ui Select, NumberField, Switch and Input, the project's vendored Base UI
// kit. Rows generate from the parameters the node's contract declares; one component
// covers every block, per the spec's one-renderer law.
import { useState } from 'react'
import { Input } from '@/components/coss/input'
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/coss/number-field'
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/coss/select'
import { Switch } from '@/components/coss/switch'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import type { ProgramNode } from '@/lib/program/contracts'
import { declaredParameters, isLongParameter } from '@/lib/program/parameters'
import type { Parameter } from '@/lib/program/parameters'
import { useProgramDoc } from '@/lib/program/store'

function TextControl({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (next: string) => void
}) {
  const [text, setText] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setText(value)
  }
  return (
    <Input
      aria-label={label}
      size="sm"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text !== value) onCommit(text)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

export function ComboControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | undefined
  options: Array<string>
  onChange: (next: string) => void
}) {
  return (
    <Select
      value={value ?? null}
      onValueChange={(next) => {
        if (typeof next === 'string') onChange(next)
      }}
    >
      <SelectTrigger aria-label={label} size="sm" className="min-w-0">
        <SelectValue placeholder="Choose" />
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  )
}

function NumberControl({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number | null
  onCommit: (next: number | null) => void
}) {
  return (
    <NumberField size="sm" value={value} onValueCommitted={onCommit}>
      <NumberFieldGroup>
        <NumberFieldDecrement aria-label={`Lower ${label}`} />
        <NumberFieldInput aria-label={label} />
        <NumberFieldIncrement aria-label={`Raise ${label}`} />
      </NumberFieldGroup>
    </NumberField>
  )
}

function WidgetRow({
  nodeId,
  parameter,
  value,
}: {
  nodeId: string
  parameter: Parameter
  value: unknown
}) {
  const setParameter = useProgramDoc((doc) => doc.setParameter)
  const promote = useProgramDoc((doc) => doc.promoteParameter)
  const shown = value ?? parameter.defaultValue
  const commit = (next: unknown) => setParameter(nodeId, parameter.name, next)
  const { title } = parameter
  return (
    <li className="flex h-8 items-center gap-2 px-3 text-xs">
      <span className="w-16 shrink-0 truncate text-ink-muted" title={title}>
        {title}
      </span>
      <span className="flex min-w-0 flex-1 items-center">
        {parameter.control === 'combo' && (
          <ComboControl
            label={title}
            value={typeof shown === 'string' ? shown : undefined}
            options={parameter.options}
            onChange={commit}
          />
        )}
        {parameter.control === 'number' && (
          <NumberControl
            label={title}
            value={typeof shown === 'number' ? shown : null}
            onCommit={(next) => commit(next ?? undefined)}
          />
        )}
        {parameter.control === 'text' && (
          <TextControl
            label={title}
            value={typeof shown === 'string' ? shown : ''}
            onCommit={(next) => commit(next || undefined)}
          />
        )}
        {parameter.control === 'toggle' && (
          <Switch
            aria-label={title}
            checked={shown === true}
            onCheckedChange={commit}
          />
        )}
      </span>
      {parameter.portShape && (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Feed ${title} from a port`}
          title={`Feed ${title} from a port`}
          onClick={() => promote(nodeId, parameter.name, parameter.portShape!)}
        >
          <Icon.Link className="size-3" />
        </Button>
      )}
    </li>
  )
}

/** A parameter fed by a port shows as that port, so its widget steps aside. */
export function ParameterWidgets({ node }: { node: ProgramNode }) {
  const rows = declaredParameters(node).filter(
    (parameter) =>
      !isLongParameter(parameter) &&
      !node.inputs.some((port) => port.id === parameter.name),
  )
  if (rows.length === 0) return null
  return (
    <ul className="nodrag nowheel nopan border-t border-separator py-1">
      {rows.map((parameter) => (
        <WidgetRow
          key={parameter.name}
          nodeId={node.id}
          parameter={parameter}
          value={node.parameters?.[parameter.name]}
        />
      ))}
    </ul>
  )
}
