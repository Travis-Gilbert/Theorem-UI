// SOURCING: the settings frame's bordered rows (settings-frame SettingsBox), ui/button; the one row a style and a framework share in their lists
import type { ComponentProps, ReactNode } from 'react'
import { ResourceMarks } from './resource-marks'

/** The bordered list both pages use; rows are list items so a reader hears how many there are. */
export function ResourceList({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <ul
      aria-label={label}
      className="divide-y divide-separator overflow-hidden rounded-lg border border-separator"
    >
      {children}
    </ul>
  )
}

/** One style or framework: its name and marks, what it is for, then what can be done with it. */
export function ResourceRow({
  resource,
  children,
  actions,
}: {
  resource: ComponentProps<typeof ResourceMarks>['resource'] & {
    name: string
    description: string
  }
  children?: ReactNode
  actions: ReactNode
}) {
  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium wrap-anywhere">
          {resource.name}
        </span>
        <ResourceMarks resource={resource} />
      </div>
      {resource.description && (
        <p className="text-sm text-ink-muted">{resource.description}</p>
      )}
      {children}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </li>
  )
}
