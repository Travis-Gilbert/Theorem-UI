// SOURCING: zod (the file's shape, with defaults for what it leaves out) and
// write-file-atomic through files.ts. The settings are plan D8's: kept in the
// folder, so they travel with it through git or sync.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { FolderSettings } from '#/lib/workspace/types'
import { WorkspaceError } from './errors'
import { writeAtomic } from './files'
import { encode, readJson } from './identity'
import { INTERNAL_DIR } from './paths'

export const SETTINGS_FILE = `${INTERNAL_DIR}/settings.json`

/** New attachments go beside the note until the person says otherwise. */
export const folderSettingsSchema = z.object({
  attachments: z.string().default('./'),
  dailyNotes: z
    .object({
      folder: z.string().default(''),
      template: z.string().default(''),
    })
    .prefault({}),
})

/** `.theorem/settings.json`, with defaults for anything it leaves out. */
export async function readFolderSettings(
  root: string,
): Promise<FolderSettings> {
  const file = path.join(root, SETTINGS_FILE)
  const parsed = folderSettingsSchema.safeParse((await readJson(file)) ?? {})
  if (!parsed.success)
    throw new WorkspaceError(
      500,
      'workspace_config_invalid',
      `${file}: ${z.prettifyError(parsed.error)}`,
    )
  return parsed.data
}

export async function writeFolderSettings(
  root: string,
  settings: unknown,
): Promise<FolderSettings> {
  const parsed = folderSettingsSchema.parse(settings)
  await mkdir(path.join(root, INTERNAL_DIR), { recursive: true })
  await writeAtomic(path.join(root, SETTINGS_FILE), encode(parsed))
  return parsed
}
