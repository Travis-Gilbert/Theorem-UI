// SOURCING: assistant-ui registry element composer-trigger-popover (https://r.assistant-ui.com/styles/base-nova/composer-trigger-popover.json) over ComposerPrimitive.TriggerPopover, vendored with four changes: the coss popup surface and item states, placement by Floating UI against the element that holds it (the primitive's absolute bottom-full placement is clipped by the thread's scroll area when the composer sits mid-screen), a bounded list that keeps the highlighted row in view (the primitive moves the highlight but does not scroll), and an icon only where one resolves plus an optional heading and per-item tag
'use client'

import { memo, useCallback, useEffect, useRef } from 'react'
import type { ComponentPropsWithoutRef, FC, ReactNode, RefObject } from 'react'
import {
  ComposerPrimitive,
  defaultDirectiveFormatter,
  unstable_useTriggerPopoverScopeContext,
} from '@assistant-ui/react'
import type { DirectiveFormatter, TriggerItem } from '@assistant-ui/react'
import {
  autoUpdate,
  flip,
  offset,
  size,
  useFloating,
} from '@floating-ui/react-dom'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type IconComponent = FC<{ className?: string }>

type DirectiveBehaviorProps = {
  /** Formatter used to serialize the selected item into composer text. */
  formatter?: DirectiveFormatter | undefined
  /** Called after the directive text has been inserted into the composer. */
  onInserted?: ((item: TriggerItem) => void) | undefined
}

type ActionBehaviorProps = {
  /** Formatter used to serialize the audit-trail chip (when `removeOnExecute` is false). */
  formatter?: DirectiveFormatter | undefined
  /** Invoked with the selected item at the moment of selection. */
  onExecute: (item: TriggerItem) => void
  /** If `true`, strip the trigger text from the composer after executing. @default false */
  removeOnExecute?: boolean | undefined
}

type ComposerTriggerPopoverBaseProps = Omit<
  ComponentPropsWithoutRef<typeof ComposerPrimitive.TriggerPopover>,
  'children'
> & {
  /**
   * Maps icon keys to components. Items look up via `item.metadata?.icon`
   * (string); categories look up via their `id`.
   */
  iconMap?: Record<string, IconComponent>
  /** Icon when no entry in `iconMap` matches; without one such rows have no icon. */
  fallbackIcon?: IconComponent
  /** A line above the list naming what it holds. */
  heading?: ReactNode
  /** A short trailing note for an item, such as what it changes. */
  itemTag?: (item: TriggerItem) => ReactNode
  /** Label shown on the back button. @default "Back" */
  backLabel?: string
  /** Label shown when no categories are available. @default "No items available" */
  emptyCategoriesLabel?: string
  /** Label shown when no items match. @default "No matching items" */
  emptyItemsLabel?: string
  /** Label shown while an async adapter is resolving items. @default "Loading…" */
  loadingLabel?: string
}

type ComposerTriggerPopoverProps = ComposerTriggerPopoverBaseProps &
  (
    | {
        /** Insert-directive behavior. */
        directive: DirectiveBehaviorProps
        action?: never
      }
    | {
        /** Action behavior. */
        action: ActionBehaviorProps
        directive?: never
      }
  )

function resolveIcon(
  iconKey: string | undefined,
  iconMap: Record<string, IconComponent> | undefined,
  fallback: IconComponent | undefined,
): IconComponent | undefined {
  return (iconKey ? iconMap?.[iconKey] : undefined) ?? fallback
}

const ROW =
  'flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm text-foreground outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground'

type CategoriesProps = {
  iconMap: Record<string, IconComponent> | undefined
  fallbackIcon: IconComponent | undefined
  emptyLabel: string
}

const Categories: FC<CategoriesProps> = ({
  iconMap,
  fallbackIcon,
  emptyLabel,
}) => (
  <ComposerPrimitive.TriggerPopoverCategories>
    {(categories) => (
      <div
        data-slot="composer-trigger-popover-categories"
        className="flex flex-col p-1"
      >
        {categories.map((cat) => {
          const Icon = resolveIcon(cat.id, iconMap, fallbackIcon)
          return (
            <ComposerPrimitive.TriggerPopoverCategoryItem
              key={cat.id}
              categoryId={cat.id}
              className={cn(ROW, 'justify-between')}
            >
              <span className="flex items-center gap-2">
                {Icon && <Icon className="text-ink-muted size-4" />}
                {cat.label}
              </span>
              <ChevronRightIcon className="text-ink-muted size-4" />
            </ComposerPrimitive.TriggerPopoverCategoryItem>
          )
        })}
        {categories.length === 0 && (
          <div className="text-ink-muted px-2 py-1.5 text-sm">{emptyLabel}</div>
        )}
      </div>
    )}
  </ComposerPrimitive.TriggerPopoverCategories>
)

/** Keeps the highlighted row visible as the arrow keys move it through a list longer than the popover. */
function useHighlightInView(list: RefObject<HTMLDivElement | null>) {
  const { highlightedIndex } = unstable_useTriggerPopoverScopeContext()
  useEffect(() => {
    list.current
      ?.querySelector('[data-highlighted]')
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [list, highlightedIndex])
}

/**
 * The line above the list. The primitive renders its children even while
 * closed, so its behavior child can register; like the list parts, the
 * heading renders only while the popover is open.
 */
function Heading({ children }: { children: ReactNode }) {
  const { open } = unstable_useTriggerPopoverScopeContext()
  if (!open) return null
  return (
    <div className="text-ink-faint border-separator border-b px-3 py-1.5 text-xs">
      {children}
    </div>
  )
}

/** The least height worth keeping the popover above for: its heading and two rows. */
const MIN_HEIGHT = 160

/**
 * Places the popover over the element that holds it, no taller or wider than
 * the space its scroll container leaves, and below only when less than
 * MIN_HEIGHT is left above (Floating UI's size-before-flip arrangement).
 */
function usePlacement() {
  const { refs, floatingStyles } = useFloating({
    placement: 'top-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      size({
        padding: 8,
        apply({ availableHeight, rects, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${Math.max(MIN_HEIGHT, availableHeight)}px`,
            maxWidth: `${rects.reference.width}px`,
          })
        },
      }),
      flip({ padding: 8, fallbackStrategy: 'initialPlacement' }),
    ],
  })
  const ref = useCallback(
    (popover: HTMLDivElement | null) => {
      refs.setReference(popover?.parentElement ?? null)
      refs.setFloating(popover)
    },
    [refs],
  )
  return { ref, style: floatingStyles }
}

type ItemsProps = {
  iconMap: Record<string, IconComponent> | undefined
  fallbackIcon: IconComponent | undefined
  itemTag: ((item: TriggerItem) => ReactNode) | undefined
  backLabel: string
  emptyLabel: string
  loadingLabel: string
  isLoading: boolean
}

const Items: FC<ItemsProps> = ({
  iconMap,
  fallbackIcon,
  itemTag,
  backLabel,
  emptyLabel,
  loadingLabel,
  isLoading,
}) => {
  const list = useRef<HTMLDivElement>(null)
  useHighlightInView(list)
  return (
    <ComposerPrimitive.TriggerPopoverItems className="flex min-h-0 flex-col">
      {(items) => (
        <div
          data-slot="composer-trigger-popover-items"
          className="flex min-h-0 flex-col"
        >
          <ComposerPrimitive.TriggerPopoverBack className="text-ink-muted hover:bg-hover border-separator flex items-center gap-1.5 border-b px-3 py-2 text-xs transition-colors">
            <ChevronLeftIcon className="size-3.5" />
            {backLabel}
          </ComposerPrimitive.TriggerPopoverBack>

          <div
            ref={list}
            className="max-h-80 overflow-y-auto overscroll-contain p-1"
          >
            {items.map((item, index) => {
              const iconKey =
                typeof item.metadata?.icon === 'string'
                  ? item.metadata.icon
                  : undefined
              const Icon = resolveIcon(iconKey, iconMap, fallbackIcon)
              const tag = itemTag?.(item)
              return (
                <ComposerPrimitive.TriggerPopoverItem
                  key={item.id}
                  item={item}
                  index={index}
                  className={cn(ROW, 'flex-col items-stretch gap-0.5')}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {Icon && (
                      <Icon className="text-ink-muted size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                      {item.label}
                    </span>
                    {tag && (
                      <span className="text-ink-faint shrink-0 text-xs">
                        {tag}
                      </span>
                    )}
                  </span>
                  {item.description && (
                    <span className="text-ink-muted line-clamp-2 text-xs leading-snug">
                      {item.description}
                    </span>
                  )}
                </ComposerPrimitive.TriggerPopoverItem>
              )
            })}
            {items.length === 0 && (
              <div className="text-ink-muted px-2 py-1.5 text-sm">
                {isLoading ? loadingLabel : emptyLabel}
              </div>
            )}
          </div>
        </div>
      )}
    </ComposerPrimitive.TriggerPopoverItems>
  )
}

/**
 * Pre-built popover UI for a trigger-driven picker (mentions, slash commands, etc).
 * Pass exactly one of `directive` (inserts a chip) or `action` (fires a handler).
 */
const ComposerTriggerPopoverImpl: FC<ComposerTriggerPopoverProps> = ({
  iconMap,
  fallbackIcon,
  heading,
  itemTag,
  backLabel = 'Back',
  emptyCategoriesLabel = 'No items available',
  emptyItemsLabel = 'No matching items',
  loadingLabel = 'Loading…',
  isLoading = false,
  className,
  directive,
  action,
  ...props
}) => {
  const placement = usePlacement()
  const warnedRef = useRef(false)
  if (
    import.meta.env.DEV &&
    !warnedRef.current &&
    Boolean(directive) === Boolean(action)
  ) {
    warnedRef.current = true
    console.warn(
      '[assistant-ui] ComposerTriggerPopover requires exactly one of `directive` or `action` props.',
    )
  }

  return (
    <ComposerPrimitive.TriggerPopover
      data-slot="composer-trigger-popover"
      ref={placement.ref}
      style={placement.style}
      className={cn(
        'aui-composer-trigger-popover bg-popover text-popover-foreground z-50 flex w-64 flex-col overflow-hidden rounded-lg border shadow-lg/5',
        className,
      )}
      isLoading={isLoading}
      {...props}
    >
      {directive ? (
        <ComposerPrimitive.TriggerPopover.Directive
          formatter={directive.formatter ?? defaultDirectiveFormatter}
          onInserted={directive.onInserted}
        />
      ) : action ? (
        <ComposerPrimitive.TriggerPopover.Action
          formatter={action.formatter ?? defaultDirectiveFormatter}
          onExecute={action.onExecute}
          removeOnExecute={action.removeOnExecute}
        />
      ) : null}
      {heading && <Heading>{heading}</Heading>}
      <Categories
        iconMap={iconMap}
        fallbackIcon={fallbackIcon}
        emptyLabel={emptyCategoriesLabel}
      />
      <Items
        iconMap={iconMap}
        fallbackIcon={fallbackIcon}
        itemTag={itemTag}
        backLabel={backLabel}
        emptyLabel={emptyItemsLabel}
        loadingLabel={loadingLabel}
        isLoading={isLoading}
      />
    </ComposerPrimitive.TriggerPopover>
  )
}
ComposerTriggerPopoverImpl.displayName = 'ComposerTriggerPopover'

export const ComposerTriggerPopover = memo(
  ComposerTriggerPopoverImpl,
) as FC<ComposerTriggerPopoverProps>
