// SOURCING: expo-file-system SDK 58 object API (File, Directory, Paths.document: copy, bytes, digest, delete)
//
// A picked, captured or shared file is copied into the app's own storage at
// once. Pickers and the camera hand out temporary files, and a delivery must
// still have its bytes after the app is closed and reopened.
import { Directory, File, Paths } from 'expo-file-system'
import type { FileItem, ItemSource } from './model'
import { mimeOf, safeName } from './wire'

const root = () => new Directory(Paths.document, 'intake')

export type Picked = { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }

/** Copies one file in and describes it. `itemId` names its folder, so two files may share a name. */
export function keep(itemId: string, source: ItemSource, picked: Picked): FileItem {
  const origin = new File(picked.uri)
  const name = safeName(picked.name ?? origin.name, `${source}-${itemId.slice(0, 8)}`)
  const folder = new Directory(root(), itemId)
  folder.create({ intermediates: true, idempotent: true })
  const kept = new File(folder, name)
  if (kept.exists) kept.delete()
  origin.copy(kept)
  return {
    kind: 'file',
    id: itemId,
    source,
    uri: kept.uri,
    name,
    mimeType: mimeOf(name, picked.mimeType || kept.type),
    size: picked.size ?? kept.size ?? undefined,
  }
}

/** Removes an item's copy. A file already gone is not an error. */
export function discard(itemId: string): void {
  const folder = new Directory(root(), itemId)
  if (folder.exists) folder.delete()
}

/** Everything intake kept, for sign-out. */
export function discardAll(): void {
  const folder = root()
  if (folder.exists) folder.delete()
}

export async function read(file: FileItem): Promise<{ bytes: Uint8Array<ArrayBuffer>; sha256: string }> {
  const kept = new File(file.uri)
  if (!kept.exists) throw new Error(`${file.name} is no longer on this phone.`)
  return { bytes: await kept.bytes(), sha256: await kept.digest('SHA-256') }
}
