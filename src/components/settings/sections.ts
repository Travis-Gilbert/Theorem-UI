// SOURCING: none — the settings route table, pure data
import { Icon } from '@/components/icons'

/** Settings' sections, grouped as the nav shows them. Each path is a file route. */
export const SETTINGS_GROUPS = [
  {
    label: 'You',
    sections: [
      { path: '/settings/appearance', label: 'Appearance', Mark: Icon.Sun },
    ],
  },
  {
    label: 'Theorem',
    sections: [
      { path: '/settings/ai', label: 'AI', Mark: Icon.Model, width: 1280 },
      { path: '/settings/keys', label: 'API keys', Mark: Icon.Key },
      { path: '/settings/connections', label: 'Connections', Mark: Icon.Plugin },
      { path: '/settings/import', label: 'Import context', Mark: Icon.Download },
      // Tables of turns and a time axis: wider than a page of fields.
      { path: '/settings/observe', label: 'Observe', Mark: Icon.Eye, width: 1080 },
      { path: '/settings/work', label: 'Work', Mark: Icon.Checklist },
    ],
  },
] as const

/** The section at a route path, with its group, or undefined off settings. */
export function settingsSection(path: string) {
  for (const group of SETTINGS_GROUPS)
    for (const section of group.sections)
      if (path.startsWith(section.path))
        return {
          group: group.label,
          label: section.label,
          path: section.path,
          width: 'width' in section ? section.width : 680,
          // A page under the section, such as one turn under Observe.
          within: path.replace(/\/$/, '') !== section.path,
        }
  return undefined
}
