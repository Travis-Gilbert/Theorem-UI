// SOURCING: writeNewFile (new files named "Untitled", then "Untitled 1", as
// Obsidian names them) and the daily-note rules in folder-settings.ts, over
// the WorkspaceClient. The commands that make a note or a folder.
import { basename, extname, join } from 'pathe'
import { writeNewFile } from '@/lib/handlers/file-sync'
import { WorkspaceRequestError } from './desktop-client'
import { dailyNotePath, fillTemplate } from './folder-settings'
import { openWorkspaceFile } from './open'
import { WorkspaceConflictError } from './types'
import type { WorkspaceClient } from './types'

/** Makes an empty note in `folder` ('' is the root); answers its path. */
export function newNote(client: WorkspaceClient, folder: string) {
  return writeNewFile(client, folder, 'Untitled.md', '')
}

/** Makes a folder in `folder`, named as a new note is; answers its path. */
export async function newFolder(client: WorkspaceClient, folder: string) {
  for (let n = 0; ; n++) {
    const path = join(folder, n ? `Untitled ${n}` : 'Untitled')
    try {
      await client.mkdir(path)
      return path
    } catch (error) {
      if (!(error instanceof WorkspaceRequestError && error.status === 409))
        throw error
    }
  }
}

/** Makes `path` as an empty note unless it exists, then opens it. */
export async function openOrCreate(
  client: WorkspaceClient,
  path: string,
  text = '',
) {
  try {
    await client.write(path, text, { expectedHash: null })
  } catch (error) {
    if (!(error instanceof WorkspaceConflictError)) throw error
  }
  openWorkspaceFile({ workspaceId: client.workspace.id, path })
}

/**
 * Opens today's daily note, making it first from the folder's template, as
 * Obsidian's Daily notes does. A template that is set but cannot be found
 * leaves the new note empty.
 */
export async function openTodaysNote(
  client: WorkspaceClient,
  now = new Date(),
) {
  const { dailyNotes } = await client.settings()
  const path = dailyNotePath(dailyNotes.folder, now)
  const templatePath =
    dailyNotes.template.trim() &&
    (await client.resolve(dailyNotes.template.trim(), path))
  const template = templatePath
    ? (await client.readText(templatePath)).text
    : ''
  const title = basename(path, extname(path))
  await openOrCreate(client, path, fillTemplate(template, { title, date: now }))
  return path
}
