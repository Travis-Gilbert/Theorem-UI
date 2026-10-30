// SOURCING: pathe (POSIX joins) and date-fns (the daily note's name and its
// template's {{date}} and {{time}}). Obsidian's rules for where a folder's
// attachments and daily notes go, as plain functions over FolderSettings.
import { format } from 'date-fns'
import { dirname, join } from 'pathe'

/** A workspace path from a joined one: no `.`, no leading or trailing `/`. */
const clean = (path: string) => {
  const joined = join('/', path).replace(/^\/+|\/+$/g, '')
  return joined === '.' ? '' : joined
}

/**
 * The folder a note's new attachments go in, from the `attachments` setting
 * as Obsidian reads "Default location for new attachments": `/` is the root,
 * `./` the note's folder, `./name` a folder in it, anything else a folder
 * from the root. '' is the root.
 */
export function attachmentFolder(setting: string, notePath: string): string {
  const noteFolder = dirname(notePath) === '.' ? '' : dirname(notePath)
  const value = setting.trim()
  if (value === '.' || value === './') return noteFolder
  if (value.startsWith('./')) return clean(join(noteFolder, value.slice(2)))
  return clean(value)
}

/** Today's daily note: `<folder>/YYYY-MM-DD.md`, as Obsidian names it. */
export function dailyNotePath(folder: string, date: Date): string {
  return clean(join(folder, `${format(date, 'yyyy-MM-dd')}.md`))
}

/**
 * A template's text with `{{date}}`, `{{time}}` and `{{title}}` filled in,
 * as Obsidian's Templates fills them by default.
 */
export function fillTemplate(
  template: string,
  { title, date }: { title: string; date: Date },
): string {
  const values: Record<string, string> = {
    date: format(date, 'yyyy-MM-dd'),
    time: format(date, 'HH:mm'),
    title,
  }
  return template.replace(
    /\{\{\s*(date|time|title)\s*\}\}/gi,
    (match, name: string) => values[name.toLowerCase()] ?? match,
  )
}
