// SOURCING: @milkdown/kit/plugin/upload (pasted and dropped files, with its
// placeholder while they are saved), mime (the extension of a nameless
// paste), date-fns (Obsidian's "Pasted image" name), pathe, and the folder's
// attachment setting (attachmentFolder) with writeNewFile, which finds a free
// name; react-query's cached settings and tree, read when a file arrives.
// Obsidian's rules for where a pasted file goes and how it is linked.
import type { Ctx } from '@milkdown/kit/ctx'
import { uploadConfig } from '@milkdown/kit/plugin/upload'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { format } from 'date-fns'
import mime from 'mime'
import { dirname, join, relative } from 'pathe'
import { useCallback, useEffect, useRef } from 'react'
import { writeNewFile } from '@/lib/handlers/file-sync'
import type { FileViewProps } from '@/lib/handlers/types'
import { attachmentFolder } from '@/lib/workspace/folder-settings'
import type { FolderSettings, WorkspaceClient } from '@/lib/workspace/types'
import { useFolderSettings, useWorkspaceTree } from '@/lib/workspace/workspaces'
import { linkTarget } from './link-target'
import { wikiEmbedNode } from './syntax'

/** The note a file is attached to, with its folder's settings and files. */
export interface AttachmentTarget {
  client: WorkspaceClient
  /** The note's path. */
  path: string
  settings: FolderSettings
  /** The folder's files, for the shortest link to a new one. */
  paths: Array<string>
}

/**
 * The note's attachment target as of when a file arrives: the folder's
 * settings and files as the editor last saw them, or read then.
 */
export function useAttachmentTarget({ client, path }: FileViewProps) {
  const settings = useFolderSettings(client).data
  const tree = useWorkspaceTree(client).data
  const latest = useRef({ client, path, settings, tree })
  useEffect(() => {
    latest.current = { client, path, settings, tree }
  })
  return useCallback(async (): Promise<AttachmentTarget> => {
    const now = latest.current
    const entries = now.tree ?? (await now.client.tree())
    return {
      client: now.client,
      path: now.path,
      settings: now.settings ?? (await now.client.settings()),
      paths: entries.filter((e) => e.kind === 'file').map((e) => e.path),
    }
  }, [])
}

/**
 * The name a file is saved under: its own, or for a paste without one,
 * Obsidian's `Pasted image YYYYMMDDHHmmss.png`. Browsers name an image from
 * the clipboard `image.png`, so that name counts as none.
 */
export function attachmentName(file: File, now = new Date()): string {
  const image = file.type.startsWith('image/')
  if (file.name && !(image && /^image\.\w+$/.test(file.name))) return file.name
  const extension =
    /\.(\w+)$/.exec(file.name)?.[1] ?? mime.getExtension(file.type) ?? 'bin'
  return `Pasted ${image ? 'image' : 'file'} ${format(now, 'yyyyMMddHHmmss')}.${extension}`
}

/** Saves `file` where the folder keeps the note's attachments; its path. */
export async function saveAttachment(
  { client, path, settings }: AttachmentTarget,
  file: File,
): Promise<string> {
  return writeNewFile(
    client,
    attachmentFolder(settings.attachments, path),
    attachmentName(file),
    new Uint8Array(await file.arrayBuffer()),
  )
}

/** `path` as a Markdown link from the note at `notePath`. */
export const relativeUrl = (notePath: string, path: string) =>
  encodeURI(relative(join('/', dirname(notePath)), join('/', path)))

/**
 * Pasted and dropped files saved as the note's attachments and embedded as
 * `![[name]]`, as Obsidian does: a config for `editor.config` after Crepe's,
 * whose uploader takes only images, into image blocks. `target` is read when
 * the files arrive.
 */
export const attachmentUploads =
  (target: () => Promise<AttachmentTarget>) => (ctx: Ctx) =>
    ctx.update(uploadConfig.key, (options) => ({
      ...options,
      uploader: async (files, schema) => {
        const at = await target()
        const embed = schema.nodes[wikiEmbedNode.id]
        if (!embed) return []
        const written: Array<string> = []
        for (const file of files) written.push(await saveAttachment(at, file))
        const paths = [...at.paths, ...written]
        return written.map((path): ProseNode =>
          embed.create({ value: linkTarget(path, paths), alias: null }),
        )
      },
    }))
