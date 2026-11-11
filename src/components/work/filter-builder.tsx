// SOURCING: coss ui Popover, Command, Select and Input; react-day-picker (the kit's Calendar) and date-fns for date values; the filter vocabulary and chip algebra are ./filter, and its pickers are fed by GET /facets
import { format, parseISO } from 'date-fns'
import { useState } from 'react'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/coss/command'
import { Input } from '@/components/coss/input'
import { Popover, PopoverPopup } from '@/components/coss/popover'
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/coss/select'
import { Calendar } from '@/components/data-table/ui/calendar'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  FIELDS,
  OPERATOR_LABEL,
  addChip,
  chipOf,
  conditionOf,
  describeChip,
  fieldSpec,
  isCondition,
  operatorsFor,
  removeAt,
  replaceAt,
  valueOptions,
} from './filter'
import type { FilterChip } from './filter'
import { useWorkFacets } from './queries'
import type { WorkFacets, WorkField, WorkFilter, WorkOperator } from './contract'

const EMPTY_OPERATORS: ReadonlySet<WorkOperator> = new Set([
  'is_empty',
  'is_not_empty',
])

/** `is` and `in` read as one choice; the number of values decides which goes on the wire. */
const operatorChoices = (field: WorkField) =>
  operatorsFor(field).filter((op) => op !== 'in' && op !== 'not_in')

const normal = (operator: WorkOperator): WorkOperator =>
  operator === 'in' ? 'is' : operator === 'not_in' ? 'is_not' : operator

/** The fields a filter can start from; a pull request's fields only where the source has any. */
function FieldList({
  facets,
  onPick,
}: {
  facets: WorkFacets | undefined
  onPick: (field: WorkField) => void
}) {
  const github = (facets?.repos.length ?? 0) > 0
  const fields = FIELDS.filter((f) => !f.optional || github)
  return (
    <Command
      items={fields}
      itemToStringValue={(item: unknown) => (item as { label: string }).label}
    >
      <div className="w-56">
        <CommandInput autoFocus placeholder="Filter by..." />
        <CommandList className="max-h-72">
          {(spec: (typeof FIELDS)[number]) => (
            <CommandItem
              key={spec.field}
              value={spec}
              onClick={() => onPick(spec.field)}
            >
              {spec.label}
            </CommandItem>
          )}
        </CommandList>
        <CommandEmpty>No such field.</CommandEmpty>
      </div>
    </Command>
  )
}

/** The operator and values of one condition, applied together. */
function ChipEditor({
  chip,
  facets,
  onApply,
}: {
  chip: FilterChip
  facets: WorkFacets | undefined
  onApply: (chip: FilterChip) => void
}) {
  const spec = fieldSpec(chip.field)
  const [operator, setOperator] = useState<WorkOperator>(normal(chip.operator))
  const [values, setValues] = useState(chip.values)
  const needsValue = !EMPTY_OPERATORS.has(operator)
  const options = valueOptions(chip.field, facets)
  const choices = operatorChoices(chip.field).map((op) => ({
    value: op,
    label: OPERATOR_LABEL[op],
  }))
  const toggle = (value: string) =>
    setValues((held) =>
      held.includes(value) ? held.filter((v) => v !== value) : [...held, value],
    )

  return (
    <div className="flex w-64 flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{spec.label}</span>
        {choices.length > 1 && (
          <Select
            value={operator}
            items={choices}
            onValueChange={(next) => next && setOperator(next)}
          >
            <SelectTrigger aria-label="Operator" size="sm" className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {choices.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        )}
      </div>

      {needsValue && spec.kind === 'choice' && (
        <Command
          items={options}
          itemToStringValue={(item: unknown) => (item as { label: string }).label}
        >
          <CommandInput placeholder={`${spec.label}...`} />
          <CommandList className="max-h-52">
            {(option: { value: string; label: string }) => (
              <CommandItem
                key={option.value}
                value={option}
                onClick={() => toggle(option.value)}
                className="flex items-center gap-2"
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {values.includes(option.value) && (
                  <Icon.Check className="size-3.5 text-ink-muted" />
                )}
              </CommandItem>
            )}
          </CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
        </Command>
      )}

      {needsValue && spec.kind === 'flag' && (
        <div className="flex gap-1">
          {valueOptions(chip.field, facets).map((o) => (
            <Button
              key={o.value}
              size="sm"
              variant={values[0] === o.value ? 'secondary' : 'outline'}
              onClick={() => setValues([o.value])}
            >
              {o.label}
            </Button>
          ))}
        </div>
      )}

      {needsValue && spec.kind === 'date' && (
        <Calendar
          mode="single"
          className="p-0"
          selected={values[0] ? parseISO(values[0]) : undefined}
          onSelect={(day) => day && setValues([format(day, 'yyyy-MM-dd')])}
        />
      )}

      {needsValue && spec.kind === 'text' && (
        <Input
          autoFocus
          aria-label={spec.label}
          value={values[0] ?? ''}
          onChange={(event) => setValues([event.target.value])}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && values[0])
              onApply({ ...chip, operator, values })
          }}
        />
      )}

      <Button
        size="sm"
        disabled={needsValue && values.length === 0}
        onClick={() =>
          onApply({ field: chip.field, operator, values: needsValue ? values : [] })
        }
      >
        Apply
      </Button>
    </div>
  )
}

/** "+ Filter": pick a field, then its operator and values. */
export function AddFilter({
  filter,
  onChange,
}: {
  filter: WorkFilter
  onChange: (filter: WorkFilter) => void
}) {
  const facets = useWorkFacets().data
  const [anchor, setAnchor] = useState<Element | null>(null)
  const [field, setField] = useState<WorkField>()
  const close = () => {
    setAnchor(null)
    setField(undefined)
  }
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <Icon.Filter className="size-3.5" />
        Filter
      </Button>
      <Popover open={!!anchor} onOpenChange={(open) => !open && close()}>
        <PopoverPopup anchor={anchor} align="start" className="p-0">
          {field ? (
            <ChipEditor
              chip={{
                field,
                operator: fieldSpec(field).kind === 'text' ? 'contains' : fieldSpec(field).kind === 'date' ? 'before' : 'is',
                values: [],
              }}
              facets={facets}
              onApply={(chip) => {
                onChange(addChip(filter, chip))
                close()
              }}
            />
          ) : (
            <FieldList facets={facets} onPick={setField} />
          )}
        </PopoverPopup>
      </Popover>
    </>
  )
}

/** The conditions of a filter as chips: click one to edit it, x to remove it. */
export function FilterChips({
  filter,
  onChange,
}: {
  filter: WorkFilter
  onChange: (filter: WorkFilter) => void
}) {
  const facets = useWorkFacets().data
  const [editing, setEditing] = useState<{ index: number; anchor: Element }>()
  const editedEntry = editing ? filter.conditions[editing.index] : undefined
  const editingChip =
    editedEntry && isCondition(editedEntry) ? chipOf(editedEntry) : undefined
  return (
    <>
      {filter.conditions.length > 1 && (
        <Select
          value={filter.op}
          items={[
            { value: 'and', label: 'Match all' },
            { value: 'or', label: 'Match any' },
          ]}
          onValueChange={(op) => op && onChange({ ...filter, op: op })}
        >
          <SelectTrigger aria-label="Match" size="sm" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="and">Match all</SelectItem>
            <SelectItem value="or">Match any</SelectItem>
          </SelectPopup>
        </Select>
      )}
      {filter.conditions.map((entry, index) => {
        const chip = isCondition(entry) ? chipOf(entry) : undefined
        const label = isCondition(entry)
          ? describeChip(chipOf(entry), facets)
          : `Group of ${entry.conditions.length} conditions`
        return (
          <span
            key={index}
            className="inline-flex h-6 items-center rounded-full border border-separator bg-pill text-xs"
          >
            <button
              type="button"
              disabled={!chip}
              onClick={(event) =>
                setEditing({ index, anchor: event.currentTarget })
              }
              className={cn(
                'max-w-64 truncate ps-2 pe-1 text-start',
                chip && 'hover:text-ink',
              )}
            >
              {label}
            </button>
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => onChange(removeAt(filter, index))}
              className="me-1 rounded-full p-0.5 text-ink-faint hover:bg-hover hover:text-ink"
            >
              <Icon.Close className="size-3" />
            </button>
          </span>
        )
      })}
      <Popover open={!!editing} onOpenChange={(open) => !open && setEditing(undefined)}>
        <PopoverPopup anchor={editing?.anchor} align="start" className="p-0">
          {editing && editingChip && (
            <ChipEditor
              key={editing.index}
              chip={editingChip}
              facets={facets}
              onApply={(chip) => {
                onChange(replaceAt(filter, editing.index, conditionOf(chip)))
                setEditing(undefined)
              }}
            />
          )}
        </PopoverPopup>
      </Popover>
    </>
  )
}
