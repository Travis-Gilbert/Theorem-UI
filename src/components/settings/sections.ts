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
      { path: '/settings/ai', label: 'AI', Mark: Icon.Model },
      { path: '/settings/keys', label: 'API keys', Mark: Icon.Key },
      { path: '/settings/styles', label: 'Response styles', Mark: Icon.Draft },
      { path: '/settings/import', label: 'Import context', Mark: Icon.Download },
    ],
  },
] as const

/** The section at a route path, with its group, or undefined off settings. */
export function settingsSection(path: string) {
  for (const group of SETTINGS_GROUPS)
    for (const section of group.sections)
      if (path.startsWith(section.path))
        return { group: group.label, label: section.label }
  return undefined
}
