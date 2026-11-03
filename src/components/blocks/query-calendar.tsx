// SOURCING: FullCalendar (@fullcalendar/react with its day-grid month view:
// rows placed on the days their date column names, with month navigation).
// Loaded on demand, the first time a query shows a calendar.
import dayGridPlugin from '@fullcalendar/daygrid'
import FullCalendar from '@fullcalendar/react'
import type { EventInput } from '@fullcalendar/core'
import { useMemo } from 'react'
import type { QueryViewResult } from '@/lib/blocks/query'
import { cellText, dateOf } from './query-cells'

/** A calendar view: one event per row on its date, titled by its first column. */
export default function QueryCalendar({ view }: { view: QueryViewResult }) {
  const titleKey =
    view.columns.find((column) => column.key !== view.dateKey)?.key ?? null
  const events = useMemo(
    () =>
      view.rows.flatMap((row, index): Array<EventInput> => {
        const date = view.dateKey ? dateOf(row[view.dateKey]) : null
        if (!date) return []
        return [
          {
            id: String(index),
            title: titleKey ? cellText(row[titleKey]) : date,
            start: date,
            allDay: true,
          },
        ]
      }),
    [view, titleKey],
  )
  const first = events[0]?.start
  return (
    // FullCalendar's documented CSS variables, set to the app's tokens.
    <div className="px-2 text-xs [--fc-border-color:var(--color-separator)] [--fc-button-active-bg-color:var(--color-selected)] [--fc-button-active-border-color:var(--color-separator)] [--fc-button-bg-color:var(--color-raised)] [--fc-button-border-color:var(--color-separator)] [--fc-button-hover-bg-color:var(--color-hover)] [--fc-button-hover-border-color:var(--color-separator)] [--fc-button-text-color:var(--color-ink)] [--fc-event-bg-color:var(--color-accent)] [--fc-event-border-color:var(--color-accent)] [--fc-event-text-color:var(--color-accent-foreground)] [--fc-page-bg-color:transparent] [--fc-today-bg-color:var(--color-hover)]">
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        initialDate={typeof first === 'string' ? first : undefined}
        events={events}
        height="auto"
        fixedWeekCount={false}
        headerToolbar={{ start: 'title', center: '', end: 'today prev,next' }}
      />
    </div>
  )
}
