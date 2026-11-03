// SOURCING: fetch over the local server's block routes. Where block frames
// load from: the block listener's origin, a compiled cell's document under
// it, and an HTML app's short-lived link.
import type { WorkspaceId } from '@/lib/workspace/types'

let origin: Promise<string> | null = null

/** The block listener's origin, `http://127.0.0.1:<port>`, asked for once. */
export function blockOrigin(): Promise<string> {
  origin ??= fetch('/desktop/blocks')
    .then(async (response) => {
      if (!response.ok)
        throw new Error(`The block listener answered ${response.status}`)
      return ((await response.json()) as { origin: string }).origin
    })
    .catch((error: unknown) => {
      origin = null
      throw error
    })
  return origin
}

/** The document a compiled cell runs in. */
export const cellUrl = (base: string, id: WorkspaceId, compiledKey: string) =>
  `${base}/cell/${encodeURIComponent(id)}/${compiledKey}`

/** A link to an HTML app (an `.html` file, or a folder with `index.html`). */
export async function appUrl(id: WorkspaceId, path: string): Promise<string> {
  const response = await fetch('/desktop/blocks/app-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceId: id, path }),
  })
  if (!response.ok)
    throw new Error(`Opening the app answered ${response.status}`)
  return ((await response.json()) as { url: string }).url
}
