// SOURCING: the WorkspaceClient contract, read-only over one Theorem upload, so the file handlers' viewers (MediaPanel, PdfPanel) read an upload the way they read a folder's file. mime names the extension the handlers decide on.
import mime from 'mime'
import type { EmbedRef } from '@/lib/theorem/embeds'
import { readUpload, uploadContentPath } from '@/lib/theorem/uploads'
import type { WorkspaceClient, WorkspaceEntry } from '@/lib/workspace/types'

const refuse = () => Promise.reject(new Error('An upload is read-only.'))
const nothing = () => Promise.resolve([])

/** The file's name there: its title, ending in what picks a viewer for its type. */
function fileName({ id, title, mime: type }: EmbedRef) {
  const name = (title ?? id).replaceAll('/', '-')
  return mime.getType(name) === type
    ? name
    : `${name}.${mime.getExtension(type ?? '') ?? 'bin'}`
}

/** A one-file folder holding the upload, and the file's path and entry in it. */
export function uploadClient(embed: EmbedRef) {
  const path = fileName(embed)
  const entry: WorkspaceEntry = {
    id: embed.id,
    path,
    kind: 'file',
    size: embed.size ?? 0,
    mtimeMs: 0,
  }
  const read = async () => {
    const blob = await readUpload(uploadContentPath(embed.id))
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      hash: embed.sha256 ?? embed.id,
    }
  }
  const client: WorkspaceClient = {
    workspace: {
      id: `upload:${embed.id}`,
      name: embed.title ?? embed.id,
      path: '',
      trusted: false,
      policy: 'ConnectedLive',
    },
    tree: () => Promise.resolve([entry]),
    read,
    readText: async () => {
      const { bytes, hash } = await read()
      return { text: new TextDecoder().decode(bytes), hash }
    },
    write: refuse,
    mkdir: refuse,
    rename: refuse,
    remove: refuse,
    resolve: () => Promise.resolve(null),
    links: nothing,
    backlinks: nothing,
    graph: () => Promise.resolve({ notes: [], links: [] }),
    search: nothing,
    tags: nothing,
    properties: () => Promise.resolve({}),
    settings: refuse,
    setSettings: refuse,
    setTrusted: refuse,
    subscribe: () => () => undefined,
  }
  return { client, path, entry }
}
