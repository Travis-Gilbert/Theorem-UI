// SOURCING: none. The state of files the person added to a project from this screen, each named by what Theorem answered to its upload.
//
// "stored" is Theorem's 201 with an upload id; nothing says the file was read or
// indexed, so the row does not either.

export type Added = {
  /** Also the upload's idempotency key: the same file always sends the same one. */
  id: string
  name: string
  state: 'uploading' | 'stored' | 'failed'
  error?: string
}

export type AddedChange =
  | { type: 'start'; id: string; name: string }
  | { type: 'stored'; id: string }
  | { type: 'failed'; id: string; error: string }

export function reduceAdded(list: readonly Added[], change: AddedChange): Added[] {
  if (change.type === 'start') {
    const rest = list.filter((entry) => entry.id !== change.id)
    return [{ id: change.id, name: change.name, state: 'uploading' }, ...rest]
  }
  return list.map((entry) =>
    entry.id !== change.id
      ? entry
      : change.type === 'stored'
        ? { id: entry.id, name: entry.name, state: 'stored' }
        : { id: entry.id, name: entry.name, state: 'failed', error: change.error },
  )
}

export function addedDetail(entry: Added): string {
  if (entry.state === 'uploading') return 'Uploading'
  if (entry.state === 'stored') return 'Stored by Theorem'
  return entry.error ?? 'The upload failed.'
}
