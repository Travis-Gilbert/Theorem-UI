// SOURCING: the app's Dialog, Input and Textarea, coss ui SegmentedControl and Menu; the two-step new-field flow and its copy after Twenty's data model settings ("Select a field type" in Basic, Relation and Advanced; then name, description and values; relations as "Has many" or "Belongs to one"); every save is a whole re-declaration through `declareSchema` against the anchor that was read
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/coss/menu'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/coss/segmented-control'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { describeError } from '@/lib/theorem/client'
import { cn } from '@/lib/utils'
import type {
  Cardinality,
  DataModel,
  FieldKind,
  FieldSpec,
  ObjectType,
  SchemaFieldType,
} from './contract'
import { CATEGORY_TEXT, FieldTypeIcon, KIND, defaultFieldType } from './fields'
import { activeObjectTypes, useDeclareObjectType } from './queries'
import { displayHint, resolveObjectType, withDisplayHint } from './model'
import type { DisplayHint, DisplayName } from './model'
import {
  fieldKeyFor,
  newObjectType,
  withField,
  withFieldChanged,
  withoutField,
} from './schema-edit'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <SegmentedControl aria-label={label} size="sm">
      {options.map((option) => (
        <SegmentedControlItem
          key={option.value}
          size="sm"
          aria-pressed={value === option.value}
          data-pressed={value === option.value ? '' : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}

function Labeled({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  )
}

const PICKABLE: FieldKind[] = [
  'text',
  'long_text',
  'number',
  'integer',
  'boolean',
  'date',
  'timestamp',
  'enum',
  'enum_many',
  'relation',
  'json',
  'vector',
  'geometry',
]

function TypePicker({ onPick }: { onPick: (kind: FieldKind) => void }) {
  const [q, setQ] = useState('')
  const shown = PICKABLE.filter((kind) =>
    KIND[kind].label.toLowerCase().includes(q.trim().toLowerCase()),
  )
  return (
    <div className="flex flex-col gap-4">
      <Input
        autoFocus
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Search a type"
        aria-label="Search a type"
      />
      {(['basic', 'relation', 'advanced'] as const).map((category) => {
        const kinds = shown.filter((kind) => KIND[kind].category === category)
        if (!kinds.length) return null
        return (
          <section key={category} className="flex flex-col gap-2">
            <header>
              <h3 className="text-sm font-medium text-ink">
                {CATEGORY_TEXT[category].title}
              </h3>
              <p className="text-xs text-ink-faint">
                {CATEGORY_TEXT[category].detail}
              </p>
            </header>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {kinds.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => onPick(kind)}
                  className="flex items-center gap-2 rounded-lg border border-separator bg-raised px-2.5 py-2 text-start text-sm text-ink hover:bg-hover"
                >
                  <FieldTypeIcon kind={kind} />
                  {KIND[kind].label}
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function OptionsEditor({
  variants,
  onChange,
}: {
  variants: string[]
  onChange: (variants: string[]) => void
}) {
  const [next, setNext] = useState('')
  const add = () => {
    const value = next.trim()
    if (value && !variants.includes(value)) onChange([...variants, value])
    setNext('')
  }
  return (
    <div className="flex flex-col gap-1.5">
      {variants.map((variant, i) => (
        <div key={variant} className="flex items-center gap-1.5">
          <Input
            value={variant}
            aria-label={`Option ${i + 1}`}
            onChange={(event) =>
              onChange(
                variants.map((v, j) => (j === i ? event.target.value : v)),
              )
            }
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${variant} up`}
            disabled={i === 0}
            onClick={() => {
              const moved = [...variants]
              ;[moved[i - 1], moved[i]] = [moved[i]!, moved[i - 1]!]
              onChange(moved)
            }}
          >
            <Icon.ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove option ${variant}`}
            onClick={() => onChange(variants.filter((_, j) => j !== i))}
          >
            <Icon.Close />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <Input
          value={next}
          placeholder="Add option"
          aria-label="New option"
          onChange={(event) => setNext(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
        <Button variant="outline" size="sm" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  )
}

const TEXT_HINTS: { value: DisplayName | 'plain'; label: string }[] = [
  { value: 'plain', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'Link' },
  { value: 'phone', label: 'Phone' },
]
const NUMBER_HINTS: { value: DisplayName | 'plain'; label: string }[] = [
  { value: 'plain', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percent', label: 'Percentage' },
  { value: 'rating', label: 'Rating' },
]

function hintFor(
  name: DisplayName | 'plain',
  held: DisplayHint | undefined,
): DisplayHint | undefined {
  switch (name) {
    case 'plain':
      return undefined
    case 'currency':
      return {
        display: 'currency',
        currency: held?.display === 'currency' ? held.currency : 'USD',
      }
    case 'rating':
      return {
        display: 'rating',
        max: held?.display === 'rating' ? held.max : 5,
      }
    default:
      return { display: name }
  }
}

export type FieldDraft = { label?: string; type?: SchemaFieldType }

/**
 * Add a field (type first, then its settings) or edit one. A relation's type
 * and target are fixed once declared, as in Twenty.
 */
export function FieldDialog({
  objectType,
  model,
  field,
  initial,
  open,
  onOpenChange,
}: {
  objectType: ObjectType
  model: DataModel
  /** The field to edit; absent to add one. */
  field?: FieldSpec
  /** A starting point for a new field, such as an observed property. */
  initial?: FieldDraft
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const declare = useDeclareObjectType()
  const editing = !!field
  const [type, setType] = useState<SchemaFieldType | undefined>(
    field?.field_type ?? initial?.type,
  )
  const [label, setLabel] = useState(field?.label ?? initial?.label ?? '')
  const [key, setKey] = useState(field?.key ?? '')
  const [keyEdited, setKeyEdited] = useState(editing)
  const [description, setDescription] = useState(field?.description ?? '')
  const [required, setRequired] = useState(field?.required ?? false)
  const [hint, setHint] = useState<DisplayHint | undefined>(
    field ? displayHint(objectType, field.key) : undefined,
  )
  const [removing, setRemoving] = useState(false)
  const [localError, setLocalError] = useState<unknown>()

  const taken = objectType.fields
    .map((f) => f.key)
    .filter((k) => k !== field?.key)
  const effectiveKey = keyEdited ? key : fieldKeyFor(label, taken)
  const targets = activeObjectTypes(model)

  const reset = () => {
    declare.reset()
    setRemoving(false)
    setLocalError(undefined)
  }

  const save = () => {
    if (!type) return
    const spec: FieldSpec = {
      ...field,
      key: effectiveKey,
      label: label.trim(),
      description: description.trim() || undefined,
      field_type: type,
      required,
      system: field?.system ?? false,
    }
    try {
      const base = editing
        ? withFieldChanged(objectType, field.key, spec)
        : withField(objectType, spec)
      const extensions = withDisplayHint(
        field && field.key !== spec.key
          ? { extensions: withDisplayHint(objectType, field.key, undefined) }
          : objectType,
        spec.key,
        hint,
      )
      declare.mutate(
        { input: { ...base, extensions }, anchor: objectType.content_anchor },
        { onSuccess: () => onOpenChange(false) },
      )
    } catch (error) {
      declare.reset()
      // Validation from the schema edit (a taken key, say) reads like a refusal.
      setLocalError(error)
    }
  }

  const remove = () => {
    if (!field) return
    try {
      const input = withoutField(objectType, field.key)
      declare.mutate(
        {
          input: {
            ...input,
            extensions: withDisplayHint(objectType, field.key, undefined),
          },
          anchor: objectType.content_anchor,
        },
        { onSuccess: () => onOpenChange(false) },
      )
    } catch (error) {
      setLocalError(error)
    }
  }

  const error = localError ?? declare.error
  const invalid =
    !type ||
    !label.trim() ||
    !effectiveKey ||
    taken.includes(effectiveKey) ||
    (type.kind === 'relation' && !type.target_object_type_id) ||
    ((type.kind === 'enum' || type.kind === 'enum_many') &&
      !type.variants.length)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? field.label
              : type
                ? `New ${KIND[type.kind].label.toLowerCase()} field`
                : '1. Select a field type'}
          </DialogTitle>
          <DialogDescription>
            {objectType.label_plural}
            {editing && field.system ? ' · system field' : ''}
          </DialogDescription>
        </DialogHeader>

        {!type ? (
          <TypePicker onPick={(kind) => setType(defaultFieldType(kind))} />
        ) : (
          <div className="flex flex-col gap-4">
            {!editing && (
              <button
                type="button"
                onClick={() => setType(undefined)}
                className="flex items-center gap-1.5 self-start text-xs text-ink-muted hover:text-ink"
              >
                <Icon.ChevronLeft className="size-3.5" />
                <FieldTypeIcon kind={type.kind} /> {KIND[type.kind].label} ·
                change type
              </button>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Name">
                <Input
                  autoFocus
                  value={label}
                  onChange={(event) => {
                    setLocalError(undefined)
                    setLabel(event.target.value)
                  }}
                  placeholder="Employees"
                />
              </Labeled>
              <Labeled
                label="API name"
                hint={
                  taken.includes(effectiveKey)
                    ? 'Another field uses this name.'
                    : undefined
                }
              >
                <Input
                  value={effectiveKey}
                  disabled={field?.system}
                  className="font-mono text-xs"
                  onChange={(event) => {
                    setKeyEdited(true)
                    setKey(event.target.value.replace(/\s+/g, ''))
                  }}
                />
              </Labeled>
            </div>
            <Labeled label="Description">
              <Textarea
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Labeled>

            {(type.kind === 'enum' || type.kind === 'enum_many') && (
              <Labeled label="Values">
                <OptionsEditor
                  variants={type.variants}
                  onChange={(variants) => setType({ ...type, variants })}
                />
              </Labeled>
            )}

            {type.kind === 'relation' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="Relation type">
                  <Segmented<Cardinality>
                    label="Relation type"
                    value={type.cardinality}
                    onChange={(cardinality) =>
                      setType({ ...type, cardinality })
                    }
                    options={[
                      { value: 'many', label: 'Has many' },
                      { value: 'one', label: 'Belongs to one' },
                    ]}
                  />
                </Labeled>
                <Labeled label="Object destination">
                  <Menu>
                    <MenuTrigger
                      disabled={editing}
                      render={
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-between"
                        />
                      }
                    >
                      {resolveObjectType(model, type.target_object_type_id)
                        ?.label_plural ?? 'Choose an object'}
                      <Icon.ChevronDown />
                    </MenuTrigger>
                    <MenuPopup align="start">
                      <MenuRadioGroup
                        value={type.target_object_type_id}
                        onValueChange={(value: string) =>
                          setType({ ...type, target_object_type_id: value })
                        }
                      >
                        {targets.map((target) => (
                          <MenuRadioItem
                            key={target.object_type_id}
                            value={target.object_type_id}
                          >
                            {target.label_plural}
                          </MenuRadioItem>
                        ))}
                      </MenuRadioGroup>
                    </MenuPopup>
                  </Menu>
                </Labeled>
              </div>
            )}

            {type.kind === 'vector' && (
              <Labeled label="Dimensions">
                <Input
                  type="number"
                  min={1}
                  value={type.dim}
                  onChange={(event) =>
                    setType({
                      ...type,
                      dim: Math.max(1, Number(event.target.value) || 1),
                    })
                  }
                />
              </Labeled>
            )}

            {(type.kind === 'text' ||
              type.kind === 'number' ||
              type.kind === 'integer') && (
              <Labeled label="Shown as">
                <Segmented
                  label="Shown as"
                  value={hint?.display ?? 'plain'}
                  onChange={(name) => setHint(hintFor(name, hint))}
                  options={type.kind === 'text' ? TEXT_HINTS : NUMBER_HINTS}
                />
              </Labeled>
            )}
            {hint?.display === 'currency' && (
              <Labeled label="Currency">
                <Input
                  value={hint.currency}
                  maxLength={3}
                  className="w-24 uppercase"
                  onChange={(event) =>
                    setHint({
                      display: 'currency',
                      currency: event.target.value.toUpperCase(),
                    })
                  }
                />
              </Labeled>
            )}
            {hint?.display === 'rating' && (
              <Labeled label="Stars">
                <Input
                  type="number"
                  min={3}
                  max={10}
                  value={hint.max}
                  className="w-24"
                  onChange={(event) =>
                    setHint({
                      display: 'rating',
                      max: Math.min(
                        10,
                        Math.max(3, Number(event.target.value) || 5),
                      ),
                    })
                  }
                />
              </Labeled>
            )}

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={required}
                disabled={field?.system}
                onChange={(event) => setRequired(event.target.checked)}
                className="size-3.5 accent-[var(--color-focus)]"
              />
              Required
              <span className="text-xs text-ink-faint">
                {objectType.enforcement === 'reject'
                  ? 'Records without it are refused.'
                  : 'Records without it are flagged, not refused.'}
              </span>
            </label>

            {editing &&
              !field.system &&
              field.key !== objectType.label_identifier_field && (
                <section className="flex items-center justify-between gap-3 rounded-lg border border-error-ink/30 px-3 py-2">
                  <p className="text-sm text-ink-muted">
                    Remove this field from the schema. Records keep their
                    values, observed again.
                  </p>
                  {removing ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={remove}
                      disabled={declare.isPending}
                    >
                      Remove {field.label}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRemoving(true)}
                    >
                      Remove field
                    </Button>
                  )}
                </section>
              )}
          </div>
        )}

        {error != null && (
          <p role="alert" className="text-sm text-error-ink">
            {error instanceof Error ? error.message : describeError(error)}
          </p>
        )}

        {type && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={invalid || declare.isPending}>
              {declare.isPending ? 'Saving…' : editing ? 'Save' : 'Add field'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A new object: its names, and a Name field to identify its records. */
export function NewObjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (type: ObjectType) => void
}) {
  const declare = useDeclareObjectType()
  const [singular, setSingular] = useState('')
  const [plural, setPlural] = useState('')
  const [pluralEdited, setPluralEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [localError, setLocalError] = useState<unknown>()
  const effectivePlural = pluralEdited
    ? plural
    : singular.trim()
      ? `${singular.trim()}s`
      : ''

  const create = () => {
    try {
      const input = newObjectType({
        labelSingular: singular,
        labelPlural: effectivePlural,
        description,
      })
      declare.mutate(
        { input },
        {
          onSuccess: (result) => {
            onOpenChange(false)
            setSingular('')
            setPlural('')
            setPluralEdited(false)
            setDescription('')
            onCreated?.(result.object_type)
          },
        },
      )
    } catch (error) {
      setLocalError(error)
    }
  }
  const error = localError ?? declare.error

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New object</DialogTitle>
          <DialogDescription>
            Records of it get a Name, and anything else they carry is kept and
            observed until you declare it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Singular">
              <Input
                autoFocus
                value={singular}
                placeholder="Project"
                onChange={(event) => {
                  setLocalError(undefined)
                  setSingular(event.target.value)
                }}
              />
            </Labeled>
            <Labeled label="Plural">
              <Input
                value={effectivePlural}
                placeholder="Projects"
                onChange={(event) => {
                  setPluralEdited(true)
                  setPlural(event.target.value)
                }}
              />
            </Labeled>
          </div>
          <Labeled label="Description">
            <Textarea
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Labeled>
        </div>
        {error != null && (
          <p role="alert" className={cn('text-sm text-error-ink')}>
            {error instanceof Error ? error.message : describeError(error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={create}
            disabled={!singular.trim() || declare.isPending}
          >
            {declare.isPending ? 'Creating…' : 'Create object'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
