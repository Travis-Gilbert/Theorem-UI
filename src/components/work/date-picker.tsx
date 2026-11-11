// SOURCING: coss ui Popover with the kit's Calendar (react-day-picker); date-fns for the quick choices. One picker for a due date and for snoozing an inbox entry
import { addDays, addHours, nextMonday, setHours, startOfDay } from 'date-fns'
import { Popover, PopoverPopup } from '@/components/coss/popover'
import { Calendar } from '@/components/data-table/ui/calendar'

/** A named moment offered above the calendar. */
export type DatePreset = { label: string; at: Date }

/** The moments a snooze usually means, counted from `now`. */
export function snoozePresets(now = new Date()): DatePreset[] {
  const morning = (day: Date) => setHours(startOfDay(day), 9)
  return [
    { label: 'Later today', at: addHours(now, 3) },
    { label: 'Tomorrow', at: morning(addDays(now, 1)) },
    { label: 'Next week', at: morning(nextMonday(now)) },
  ]
}

/**
 * A calendar in a popover anchored to `anchor`, open while `anchor` is set.
 * Picking a day (or a preset) calls `onPick` and closes; `onPick(null)` is the
 * clear action, offered when `clearLabel` is given and a day is held.
 */
export function DatePicker({
  anchor,
  onClose,
  selected,
  presets,
  clearLabel,
  onPick,
}: {
  anchor: Element | null
  onClose: () => void
  selected?: Date
  presets?: DatePreset[]
  clearLabel?: string
  onPick: (date: Date | null) => void
}) {
  const pick = (date: Date | null) => {
    onPick(date)
    onClose()
  }
  return (
    <Popover open={!!anchor} onOpenChange={(open) => !open && onClose()}>
      <PopoverPopup anchor={anchor} align="start" className="p-0">
        {presets && (
          <div className="flex flex-col border-b border-separator py-1">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => pick(preset.at)}
                className="px-3 py-1.5 text-start text-sm hover:bg-hover"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(day) => day && pick(setHours(startOfDay(day), 9))}
        />
        {clearLabel && selected && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="w-full border-t border-separator px-3 py-1.5 text-start text-xs text-ink-muted hover:bg-hover"
          >
            {clearLabel}
          </button>
        )}
      </PopoverPopup>
    </Popover>
  )
}
