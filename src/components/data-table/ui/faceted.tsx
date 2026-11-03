// SOURCING: TanStack Table kitchen-sink-shadcn-base example (vendored from github.com/TanStack/table examples/react/kitchen-sink-shadcn-base/src/components/ui/faceted.tsx; imports point at this app)
'use client'

import * as React from 'react'

import { Badge } from '@/components/coss/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/data-table/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/data-table/ui/popover'
import { Icon } from '@/components/icons'
import { composeEventHandlers, useComposedRefs } from '@/lib/composition'
import { cn } from '@/lib/utils'

const FACETED_NAME = 'Faceted'
const TRIGGER_NAME = 'FacetedTrigger'
const BADGE_LIST_NAME = 'FacetedBadgeList'
const CONTENT_NAME = 'FacetedContent'
const ITEM_NAME = 'FacetedItem'

const ERRORS = {
  [FACETED_NAME]: `\`${FACETED_NAME}\` must be used as root component`,
  [TRIGGER_NAME]: `\`${TRIGGER_NAME}\` must be within \`${FACETED_NAME}\``,
  [BADGE_LIST_NAME]: `\`${BADGE_LIST_NAME}\` must be within \`${FACETED_NAME}\``,
  [CONTENT_NAME]: `\`${CONTENT_NAME}\` must be within \`${FACETED_NAME}\``,
  [ITEM_NAME]: `\`${ITEM_NAME}\` must be within \`${FACETED_NAME}\``,
}

type FacetedValue<TMultiple extends boolean> = TMultiple extends true
  ? Array<string>
  : string

interface FacetedContextValue<TMultiple extends boolean = boolean> {
  triggerRef: React.RefObject<HTMLButtonElement | null>
  value?: FacetedValue<TMultiple>
  onItemSelect?: (value: string) => void
  multiple?: TMultiple
}

const FacetedContext = React.createContext<FacetedContextValue<boolean> | null>(
  null,
)

function useFacetedContext(name: keyof typeof ERRORS) {
  const context = React.useContext(FacetedContext)
  if (!context) {
    throw new Error(ERRORS[name])
  }
  return context
}

interface FacetedProps<
  TMultiple extends boolean = false,
> extends React.ComponentProps<typeof Popover> {
  value?: FacetedValue<TMultiple>
  onValueChange?: (value: FacetedValue<TMultiple> | undefined) => void
  children?: React.ReactNode
  multiple?: TMultiple
}

function Faceted<TMultiple extends boolean = false>(
  props: FacetedProps<TMultiple>,
) {
  const {
    value,
    onValueChange,
    children,
    multiple = false as TMultiple,
    ...facetedProps
  } = props
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const onItemSelect = React.useCallback(
    (selectedValue: string) => {
      if (!onValueChange) return

      if (multiple) {
        const currentValue: Array<string> = Array.isArray(value) ? value : []
        const newValue = currentValue.includes(selectedValue)
          ? currentValue.filter((v) => v !== selectedValue)
          : [...currentValue, selectedValue]
        onValueChange(newValue as FacetedValue<TMultiple>)
      } else {
        if (value === selectedValue) {
          onValueChange(undefined)
        } else {
          onValueChange(selectedValue as FacetedValue<TMultiple>)
        }

        requestAnimationFrame(() => {
          setOpen(false)
        })
      }
    },
    [multiple, onValueChange, value],
  )

  const contextValue = React.useMemo<FacetedContextValue<TMultiple>>(
    () => ({ value, onItemSelect, multiple, triggerRef }),
    [value, onItemSelect, multiple],
  )

  return (
    <FacetedContext.Provider value={contextValue}>
      <Popover open={open} onOpenChange={setOpen} {...facetedProps}>
        {children}
      </Popover>
    </FacetedContext.Provider>
  )
}

function FacetedTrigger({
  ref,
  className,
  children,
  ...triggerProps
}: React.ComponentProps<typeof PopoverTrigger>) {
  const context = useFacetedContext(TRIGGER_NAME)
  const composedRef = useComposedRefs(ref, context.triggerRef)

  return (
    <PopoverTrigger
      data-slot="faceted-trigger"
      {...triggerProps}
      ref={composedRef}
      className={cn(
        'justify-between text-left focus:outline-none focus:ring-1 focus:ring-ring',
        className,
      )}
      onPointerDown={composeEventHandlers(
        triggerProps.onPointerDown,
        (event) => {
          // prevent implicit pointer capture
          const target = event.target
          if (!(target instanceof Element)) return
          if (target.hasPointerCapture(event.pointerId)) {
            target.releasePointerCapture(event.pointerId)
          }

          // Only prevent default if we're not clicking on the input
          // This allows text selection in the input while still preventing focus stealing elsewhere
          if (
            event.button === 0 &&
            event.ctrlKey === false &&
            event.pointerType === 'mouse' &&
            !(event.target instanceof HTMLInputElement)
          ) {
            event.preventDefault()
          }
        },
      )}
    >
      {children}
    </PopoverTrigger>
  )
}

interface FacetedBadgeListProps extends React.ComponentProps<'div'> {
  options?: Array<{ label: string; value: string }>
  max?: number
  badgeClassName?: string
  placeholder?: string
}

function FacetedBadgeList({
  ref,
  options = [],
  max = 2,
  placeholder = 'Select options...',
  className,
  badgeClassName,
  ...badgeListProps
}: FacetedBadgeListProps) {
  const context = useFacetedContext(BADGE_LIST_NAME)
  const values = Array.isArray(context.value)
    ? context.value
    : context.value
      ? [context.value]
      : []

  const getLabel = React.useCallback(
    (value: string) => {
      const option = options.find((opt) => opt.value === value)
      return option?.label ?? value
    },
    [options],
  )

  if (values.length === 0) {
    return (
      <div
        data-slot="faceted-badge-list"
        {...badgeListProps}
        ref={ref}
        className="flex w-full items-center gap-1 text-muted-foreground"
      >
        {placeholder}
        <Icon.UpDown className="ml-auto size-4 shrink-0 opacity-50" />
      </div>
    )
  }

  return (
    <div
      data-slot="faceted-badge-list"
      {...badgeListProps}
      ref={ref}
      className={cn('flex flex-wrap items-center gap-1', className)}
    >
      {values.length > max ? (
        <Badge
          variant="outline"
          className={cn('rounded-sm px-1 font-normal', badgeClassName)}
        >
          {values.length} selected
        </Badge>
      ) : (
        values.map((value) => (
          <Badge
            key={value}
            variant="outline"
            className={cn('rounded-sm px-1 font-normal', badgeClassName)}
          >
            <span className="truncate">{value ? getLabel(value) : ''}</span>
          </Badge>
        ))
      )}
    </div>
  )
}

function FacetedContent({
  className,
  children,
  ...contentProps
}: React.ComponentProps<typeof PopoverContent>) {
  const context = useFacetedContext(CONTENT_NAME)

  return (
    <PopoverContent
      data-slot="faceted-content"
      {...contentProps}
      align="start"
      className={cn('w-[200px] origin-(--transform-origin) p-0', className)}
      onCloseAutoFocus={composeEventHandlers(
        contentProps.onCloseAutoFocus,
        () => context.triggerRef.current?.focus({ preventScroll: true }),
      )}
    >
      <Command>{children}</Command>
    </PopoverContent>
  )
}

const FacetedInput = CommandInput
const FacetedList = CommandList
const FacetedEmpty = CommandEmpty
const FacetedGroup = CommandGroup
const FacetedSeparator = CommandSeparator

interface FacetedItemProps extends React.ComponentProps<typeof CommandItem> {
  value: string
}

function FacetedItem({
  className,
  children,
  value,
  onSelect,
  ...itemProps
}: FacetedItemProps) {
  const context = useFacetedContext(ITEM_NAME)

  const isSelected = context.multiple
    ? Array.isArray(context.value) && context.value.includes(value)
    : context.value === value

  const onItemSelect = React.useCallback(
    (currentValue: string) => {
      if (onSelect) {
        onSelect(currentValue)
      } else if (context.onItemSelect) {
        context.onItemSelect(currentValue)
      }
    },
    [onSelect, context],
  )

  return (
    <CommandItem
      data-slot="faceted-item"
      aria-selected={isSelected}
      data-selected={isSelected}
      className={cn('gap-2', className)}
      onSelect={() => onItemSelect(value)}
      {...itemProps}
    >
      <span
        className={cn(
          'flex size-4 items-center justify-center rounded-sm border border-primary',
          isSelected
            ? 'bg-primary text-primary-foreground'
            : 'opacity-50 [&_svg]:invisible',
        )}
      >
        <Icon.Check className="size-4" />
      </span>
      {children}
    </CommandItem>
  )
}

export {
  Faceted,
  FacetedBadgeList,
  FacetedContent,
  FacetedEmpty,
  FacetedGroup,
  FacetedInput,
  FacetedItem,
  FacetedList,
  FacetedSeparator,
  FacetedTrigger,
}
