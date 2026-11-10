// SOURCING: coss ui Popover and Command (a searchable list in a popover, as the records fields use them) for the quick edits of status, priority, assignee, labels, project and milestone; the edit rules are ./edits
import { useContext, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/coss/command'
import { Popover, PopoverPopup } from '@/components/coss/popover'
import { Icon } from '@/components/icons'
import { cn } from '@/lib/utils'
import {
  EDIT_LABEL,
  addsOnToggle,
  canClear,
  isMultiple,
  optionsFor,
  patchFor,
  sharedBy,
} from './edits'
import type { EditField, Option } from './edits'
import { LabelChip, PriorityMark, StatusMark } from './marks'
import { EditErrorContext } from './notice'
import { usePatchWorkItem, useWorkFacets } from './queries'
import { useWorkSource } from './source'
import type { WorkFacets, WorkItem, WorkPriority } from './contract'

/** Applies a choice to one or more items; every item gets its own patch. */
export function useQuickEdit(onError?: (error: unknown) => void) {
  const source = useWorkSource()
  const patch = usePatchWorkItem()
  const report = useContext(EditErrorContext)
  return {
    canEdit: !!source.patchItem,
    choose(items: WorkItem[], field: EditField, value: string | null) {
      const add = value ? addsOnToggle(items, field, value) : true
      for (const item of items) {
        const change = patchFor(field, item, value, add)
        if (change)
          patch.mutate({ id: item.id, patch: change }, { onError: onError ?? report })
      }
    },
  }
}

/** The mark an option draws before its label; labels draw their own chip. */
function optionMark(
  field: EditField,
  option: Option,
  facets: WorkFacets | undefined,
): ReactNode {
  switch (field) {
    case 'status': {
      const status = facets?.statuses.find((s) => s.id === option.value)
      return status ? <StatusMark status={status} /> : null
    }
    case 'priority':
      return <PriorityMark priority={Number(option.value) as WorkPriority} />
    default:
      return null
  }
}

/**
 * A searchable list of options in a popover anchored to `anchor`, open while
 * `anchor` is set. `chosen` shows a check; a single-valued list closes on a
 * choice, a multi-valued one stays open to pick again.
 */
export function OptionPicker({
  anchor,
  onClose,
  options,
  chosen,
  multiple = false,
  placeholder,
  onChoose,
  mark,
  clearLabel,
}: {
  anchor: Element | null
  onClose: () => void
  options: Option[]
  chosen: string[]
  multiple?: boolean
  placeholder: string
  onChoose: (value: string | null) => void
  /** Draws an option; its label alone when this returns nothing. */
  mark?: (option: Option) => ReactNode
  clearLabel?: string
}) {
  return (
    <Popover open={!!anchor} onOpenChange={(open) => !open && onClose()}>
      <PopoverPopup anchor={anchor} align="start" className="p-0">
        <Command
          items={options}
          itemToStringValue={(item: unknown) => (item as Option).label}
        >
          <div className="w-60">
            <CommandInput autoFocus placeholder={placeholder} />
            <CommandList className="max-h-64">
              {(option: Option) => (
                <CommandItem
                  key={option.value}
                  value={option}
                  onClick={() => {
                    onChoose(option.value)
                    if (!multiple) onClose()
                  }}
                  className="flex items-center gap-2"
                >
                  {mark?.(option) ?? (
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                  )}
                  {chosen.includes(option.value) && (
                    <Icon.Check className="size-3.5 text-ink-muted" />
                  )}
                </CommandItem>
              )}
            </CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {clearLabel && chosen.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onChoose(null)
                  onClose()
                }}
                className="w-full border-t border-separator px-3 py-1.5 text-start text-xs text-ink-muted hover:bg-hover"
              >
                {clearLabel}
              </button>
            )}
          </div>
        </Command>
      </PopoverPopup>
    </Popover>
  )
}

/** The options of a field, each drawn with its own mark (status dot, priority bars, label chip). */
export function useOptionMark(field: EditField) {
  const facets = useWorkFacets().data
  return (option: Option): ReactNode => {
    if (field === 'label') {
      const label = facets?.labels.find((l) => l.id === option.value)
      return (
        <span className="min-w-0 flex-1">
          {label ? <LabelChip label={label} /> : option.label}
        </span>
      )
    }
    const mark = optionMark(field, option, facets)
    return mark ? (
      <>
        {mark}
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
      </>
    ) : null
  }
}

/** A searchable list of what `field` can be, for these items. */
export function FieldPicker({
  field,
  items,
  anchor,
  onClose,
  onChoose,
}: {
  field: EditField
  items: WorkItem[]
  anchor: Element | null
  onClose: () => void
  onChoose: (value: string | null) => void
}) {
  const facets = useWorkFacets().data
  const mark = useOptionMark(field)
  return (
    <OptionPicker
      anchor={anchor}
      onClose={onClose}
      options={optionsFor(field, facets, items[0]?.projectId)}
      chosen={sharedBy(items, field)}
      multiple={isMultiple(field)}
      placeholder={`${EDIT_LABEL[field]}...`}
      onChoose={onChoose}
      mark={mark}
      clearLabel={
        canClear(field) ? `Clear ${EDIT_LABEL[field].toLowerCase()}` : undefined
      }
    />
  )
}

/** A button that opens the picker for one item's field; the trigger shows `children`. */
export function PickerButton({
  field,
  item,
  children,
  className,
  onError,
}: {
  field: EditField
  item: WorkItem
  children: ReactNode
  className?: string
  onError?: (error: unknown) => void
}) {
  const edit = useQuickEdit(onError)
  const [anchor, setAnchor] = useState<Element | null>(null)
  if (!edit.canEdit)
    return <span className={cn('inline-flex items-center gap-1.5', className)}>{children}</span>
  return (
    <>
      <button
        type="button"
        aria-label={EDIT_LABEL[field]}
        onClick={(event) => {
          // The row or card around it opens the item; this only edits it.
          event.stopPropagation()
          setAnchor(event.currentTarget)
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-start hover:bg-hover',
          className,
        )}
      >
        {children}
      </button>
      <FieldPicker
        field={field}
        items={[item]}
        anchor={anchor}
        onClose={() => setAnchor(null)}
        onChoose={(value) => edit.choose([item], field, value)}
      />
    </>
  )
}
