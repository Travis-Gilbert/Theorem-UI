// SOURCING: coss ui Combobox over Base UI Combobox (input inside the popup, as the composer's model picker), lib/theorem/models (ModelOption, modelStub)
import { useMemo } from 'react'
import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from '@/components/coss/combobox'
import { Icon } from '@/components/icons'
import { formatContext, modelStub } from '@/lib/theorem/models'
import type { ModelOption } from '@/lib/theorem/models'

/** A choice that is not a model: Theorem's default, or turning the role off. */
export type RoleChoice = { value: string; label: string }

type Group = { label: string; items: ModelOption[] }

/** Choices that are not models ride as stubs whose ref starts with `#`, which no catalog ref does. */
const choiceRef = (value: string) => `#${value}`

/**
 * Picks the model a role runs on from a searchable list, with the role's
 * non-model choices ("Theorem default", "None") above the models.
 */
export function RoleModelSelect({
  label,
  models,
  value,
  choices = [],
  placeholder = 'Choose a model',
  onChange,
}: {
  /** What the control picks, for assistive technology. */
  label: string
  /** What the trigger says while nothing is chosen. */
  placeholder?: string
  models: readonly ModelOption[]
  /** A model ref, a choice's value, or undefined for nothing chosen. */
  value: string | undefined
  choices?: readonly RoleChoice[]
  onChange: (value: string) => void
}) {
  const groups = useMemo<Group[]>(() => {
    const special = choices.map((c) => ({ ...modelStub(choiceRef(c.value), c.label), vendor: '' }))
    return [
      ...(special.length ? [{ label: 'Theorem', items: special }] : []),
      { label: 'Models', items: [...models] },
    ]
  }, [choices, models])

  const all = groups.flatMap((g) => g.items)
  const selected =
    value === undefined
      ? undefined
      : (all.find((m) => m.ref === value || m.ref === choiceRef(value)) ?? modelStub(value))

  return (
    <Combobox<ModelOption>
      items={groups}
      value={selected ?? null}
      onValueChange={(model) => {
        if (!model) return
        onChange(model.ref.startsWith('#') ? model.ref.slice(1) : model.ref)
      }}
      itemToStringLabel={(model) => model.name}
      itemToStringValue={(model) => `${model.name} ${model.ref}`}
      isItemEqualToValue={(a, b) => a.ref === b.ref}
    >
      <ComboboxTrigger
        aria-label={label}
        className="flex h-8 max-w-56 items-center gap-1.5 rounded-md border border-separator px-2 text-sm text-ink transition-colors duration-100 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-hover"
      >
        <span className="truncate">{selected?.name ?? placeholder}</span>
        <Icon.UpDown className="size-3.5 shrink-0 text-ink-muted" />
      </ComboboxTrigger>
      <ComboboxPopup align="end" className="w-80">
        <div className="border-b border-separator p-1.5">
          <ComboboxInput
            size="sm"
            showTrigger={false}
            placeholder="Find a model"
            startAddon={<Icon.Search className="size-3.5" />}
          />
        </div>
        <ComboboxEmpty className="hidden px-3 py-4 text-sm text-ink-muted not-empty:block">
          No model matches.
        </ComboboxEmpty>
        <ComboboxList className="max-h-80 overflow-y-auto p-1">
          {(group: Group) => (
            <ComboboxGroup key={group.label} items={group.items}>
              <ComboboxGroupLabel className="px-2 pt-1.5 pb-1 text-xs text-ink-faint">
                {group.label}
              </ComboboxGroupLabel>
              <ComboboxCollection>
                {(model: ModelOption) => (
                  <ComboboxItem key={model.ref} value={model} className="py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{model.name}</span>
                      {model.vendor && (
                        <span className="shrink-0 text-xs text-ink-faint">{model.vendor}</span>
                      )}
                      {model.contextLength && (
                        <span className="shrink-0 text-xs text-ink-faint tabular-nums">
                          {formatContext(model.contextLength)}
                        </span>
                      )}
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  )
}
