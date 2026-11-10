// SOURCING: coss ui Popover, Menu, Select, SegmentedControl, Checkbox, Input and AlertDialog; the filter builder (./filter-builder) feeds a WorkFilter, saving goes to PUT /views through the WorkSource; the unsaved state is ./draft
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/coss/alert-dialog'
import { Checkbox } from '@/components/coss/checkbox'
import { Input } from '@/components/coss/input'
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/coss/menu'
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/coss/popover'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/coss/segmented-control'
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/coss/select'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DISPLAY_FIELDS, shownFields, withDraft } from './draft'
import type { DisplayField } from './draft'
import { AddFilter, FilterChips } from './filter-builder'
import { GROUP_LABEL, ORDER_LABEL, toggleDirection } from './grouping'
import { Notice, useNotice } from './notice'
import { useDeleteWorkView, useSaveWorkView } from './queries'
import { useWorkSource } from './source'
import type { ViewState } from './view-state'
import type { WorkGroupBy, WorkView } from './contract'

const GROUPS = [
  { value: 'none', label: 'No grouping' },
  ...Object.entries(GROUP_LABEL).map(([value, label]) => ({ value, label })),
]
const ORDERS = Object.entries(ORDER_LABEL).map(([value, label]) => ({
  value,
  label,
}))

function DisplayMenu({
  state,
  layoutToggle,
}: {
  state: ViewState
  layoutToggle: boolean
}) {
  const { view, edit } = state
  if (!view) return null
  const shown = shownFields(view.displayFields)
  const toggleField = (id: DisplayField) => {
    const next = new Set(shown)
    if (!next.delete(id)) next.add(id)
    edit({ displayFields: DISPLAY_FIELDS.filter((f) => next.has(f.id)).map((f) => f.id) })
  }
  return (
    <Popover>
      <PopoverTrigger render={<Button size="sm" variant="ghost" />}>
        <Icon.Layout className="size-3.5" />
        Display
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-64">
        <div className="flex flex-col gap-3">
          {layoutToggle && (
            <SegmentedControl aria-label="Layout" size="sm" className="w-full">
              {(['list', 'board'] as const).map((layout) => (
                <SegmentedControlItem
                  key={layout}
                  size="sm"
                  className="flex-1"
                  aria-pressed={view.layout === layout}
                  data-pressed={view.layout === layout ? '' : undefined}
                  onClick={() => edit({ layout })}
                >
                  {layout === 'list' ? 'List' : 'Board'}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          )}
          <label className="flex items-center justify-between gap-2 text-sm">
            Group by
            <Select
              value={view.groupBy ?? 'none'}
              items={GROUPS}
              onValueChange={(next) =>
                next &&
                edit({ groupBy: (next === 'none' ? null : next) as WorkGroupBy })
              }
            >
              <SelectTrigger aria-label="Group by" size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {GROUPS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </label>
          <div className="flex items-center justify-between gap-2 text-sm">
            Order by
            <span className="flex items-center gap-1">
              <Select
                value={view.orderBy.field}
                items={ORDERS}
                onValueChange={(field) =>
                  field &&
                  edit({
                    orderBy: { ...view.orderBy, field: field },
                  })
                }
              >
                <SelectTrigger aria-label="Order by" size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {ORDERS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={
                  view.orderBy.direction === 'asc' ? 'Ascending' : 'Descending'
                }
                onClick={() => edit({ orderBy: toggleDirection(view.orderBy) })}
              >
                {view.orderBy.direction === 'asc' ? (
                  <Icon.ArrowUp className="size-3.5" />
                ) : (
                  <Icon.ArrowDown className="size-3.5" />
                )}
              </Button>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-faint">Show</span>
            {DISPLAY_FIELDS.map((field) => (
              <label key={field.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={shown.has(field.id)}
                  onCheckedChange={() => toggleField(field.id)}
                />
                {field.label}
              </label>
            ))}
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  )
}

/**
 * The bar over a list or board: the view's name, its filter as chips, the
 * display options, and saving. Changes stay in this page until saved; a
 * built-in view is saved as a copy, never over itself.
 */
export function WorkViewBar({
  state,
  onOpenView,
  layoutToggle = true,
  actions,
}: {
  state: ViewState
  /** Called with a view just saved as new, so the host can open it. */
  onOpenView?: (viewId: string) => void
  layoutToggle?: boolean
  /** Controls the host adds at the end of the bar, such as New. */
  actions?: ReactNode
}) {
  const source = useWorkSource()
  const save = useSaveWorkView()
  const remove = useDeleteWorkView()
  const { notice, say, clear } = useNotice()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { saved, view, dirty, edit, reset } = state
  if (!view) return null

  const canSave = !!source.saveView
  const saveOver = () => {
    if (!saved || saved.builtin) return
    save.mutate(
      { view: withDraft(saved, view), revision: saved.revision },
      { onSuccess: reset, onError: say },
    )
  }
  const saveAsNew = () => {
    const title = name.trim()
    if (!title) return
    const id = crypto.randomUUID()
    const next: WorkView = {
      ...view,
      id,
      name: title,
      builtin: false,
      revision: '',
    }
    save.mutate(
      { view: next },
      {
        onSuccess: () => {
          reset()
          setNaming(false)
          setName('')
          onOpenView?.(id)
        },
        onError: say,
      },
    )
  }

  return (
    <div className="flex flex-col">
      <Notice notice={notice} onClear={clear} />
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5">
        <h3 className="me-1 font-heading text-[15px] font-medium">
          {view.name}
          {dirty && <span className="ms-1 text-ink-faint">(edited)</span>}
        </h3>
        <FilterChips filter={view.filter} onChange={(filter) => edit({ filter })} />
        <AddFilter filter={view.filter} onChange={(filter) => edit({ filter })} />
        <span className="flex-1" />
        <DisplayMenu state={state} layoutToggle={layoutToggle} />
        {canSave && (dirty || (saved && !saved.builtin)) && (
          <Menu>
            <MenuTrigger
              ref={setAnchor}
              render={<Button size="sm" variant={dirty ? 'secondary' : 'ghost'} />}
            >
              {dirty ? 'Save view' : 'View'}
              <Icon.ChevronDown className="size-3" />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-44">
              {saved && !saved.builtin && (
                <MenuItem disabled={!dirty} onClick={saveOver}>
                  Save view
                </MenuItem>
              )}
              <MenuItem
                onClick={() => {
                  setName(`${view.name} copy`)
                  setNaming(true)
                }}
              >
                Save as new view
              </MenuItem>
              {dirty && <MenuItem onClick={reset}>Discard changes</MenuItem>}
              {saved && !saved.builtin && !!source.deleteView && (
                <>
                  <MenuSeparator />
                  <MenuItem onClick={() => setConfirmDelete(true)}>
                    Delete view
                  </MenuItem>
                </>
              )}
            </MenuPopup>
          </Menu>
        )}
        {actions}
      </div>

      <Popover open={naming} onOpenChange={setNaming}>
        <PopoverPopup anchor={anchor} align="end" className="w-64">
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              saveAsNew()
            }}
          >
            <Input
              autoFocus
              aria-label="View name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button size="sm" type="submit" disabled={!name.trim() || save.isPending}>
              Save as new view
            </Button>
          </form>
        </PopoverPopup>
      </Popover>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {view.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The view is removed for good. The items it showed are not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Keep
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() =>
                saved &&
                remove.mutate(saved.id, {
                  onSuccess: () => {
                    reset()
                    setConfirmDelete(false)
                  },
                  onError: say,
                })
              }
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  )
}
