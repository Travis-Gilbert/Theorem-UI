// SOURCING: coss ui Combobox over Base UI Combobox (input inside the popup, as coss's "With Input Inside Popup" example), @tanstack/react-router Link (to settings), lib/theorem/models (catalog, stars, pick)
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import {
  Combobox,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
  ComboboxCollection,
} from '@/components/coss/combobox'
import { Icon } from '@/components/icons'
import {
  formatContext,
  modelStub,
  useModelCatalog,
  usePickedModels,
} from '@/lib/theorem/models'
import type { ModelOption } from '@/lib/theorem/models'

/** Theorem's own choice: the chat role's model, unless the person picks another. */
const DEFAULT_ITEM: ModelOption = { ...modelStub('', 'Theorem default'), vendor: 'theorem' }

type Group = { label: string; items: ModelOption[] }

/** The vendor as a one-letter plate, so a list of models scans by maker. */
function VendorMark({ vendor }: { vendor: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-raised text-[11px] font-medium text-ink-muted uppercase"
    >
      {vendor === 'theorem' ? <Icon.Spaces className="size-3" /> : vendor[0]}
    </span>
  )
}

/**
 * The composer's model switch. It lists the models the person starred in
 * Settings, plus Theorem's default; picking one sets the model the next turn
 * runs on.
 */
export function ModelPicker() {
  const { data: catalog = [] } = useModelCatalog()
  const starred = usePickedModels((s) => s.starred)
  const selectedRef = usePickedModels((s) => s.selected)
  const select = usePickedModels((s) => s.select)

  const byRef = useMemo(
    () => new Map(catalog.map((model) => [model.ref, model])),
    [catalog],
  )
  const groups = useMemo<Group[]>(() => {
    const picks = starred.map((ref) => byRef.get(ref) ?? modelStub(ref))
    return [
      { label: 'Default', items: [DEFAULT_ITEM] },
      ...(picks.length ? [{ label: 'Starred', items: picks }] : []),
    ]
  }, [starred, byRef])

  const selected = selectedRef
    ? (byRef.get(selectedRef) ?? groups.flatMap((g) => g.items).find((m) => m.ref === selectedRef))
    : DEFAULT_ITEM

  return (
    <Combobox<ModelOption>
      items={groups}
      value={selected ?? DEFAULT_ITEM}
      onValueChange={(model) => select(model?.ref || undefined)}
      itemToStringLabel={(model) => model.name}
      itemToStringValue={(model) => `${model.name} ${model.ref}`}
      isItemEqualToValue={(a, b) => a.ref === b.ref}
    >
      <ComboboxTrigger
        aria-label="Model"
        className="flex h-7 max-w-44 items-center gap-1 rounded-md px-1.5 text-sm text-ink-muted transition-colors duration-100 outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-hover data-popup-open:text-ink"
      >
        <span className="truncate">{selected?.name ?? 'Model'}</span>
        <Icon.UpDown className="size-3.5 shrink-0" />
      </ComboboxTrigger>
      <ComboboxPopup side="top" align="start" className="w-80">
        <div className="border-b border-separator p-1.5">
          <ComboboxInput
            size="sm"
            showTrigger={false}
            placeholder="Find a model"
            startAddon={<Icon.Search className="size-3.5" />}
          />
        </div>
        <ComboboxEmpty className="px-3 py-4 text-sm text-ink-muted not-empty:block hidden">
          No starred model matches.
        </ComboboxEmpty>
        <ComboboxList className="overflow-y-auto p-1">
          {(group: Group) => (
            <ComboboxGroup key={group.label} items={group.items}>
              <ComboboxGroupLabel className="px-2 pt-1.5 pb-1 text-xs text-ink-faint">
                {group.label}
              </ComboboxGroupLabel>
              <ComboboxCollection>
                {(model: ModelOption) => (
                  <ComboboxItem key={model.ref} value={model} className="py-1.5">
                    <div className="flex items-center gap-2">
                      <VendorMark vendor={model.vendor} />
                      <span className="min-w-0 flex-1 truncate">{model.name}</span>
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
        <div className="border-t border-separator p-1">
          <Link
            to="/settings/ai"
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:bg-hover"
          >
            <Icon.Star className="size-3.5" />
            Star more models
          </Link>
        </div>
      </ComboboxPopup>
    </Combobox>
  )
}
