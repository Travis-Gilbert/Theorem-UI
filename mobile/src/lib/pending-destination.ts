// SOURCING: expo-linking (the URL that launched the app, and url events while signed out)
//
// A link that arrives while signed out is kept, not dropped, and opened after
// sign-in. The destination route resolves the object itself and shows a
// specific recovery screen when it is gone or belongs to another workspace.
import * as Linking from 'expo-linking'

let pending: string | undefined

/** Only in-app paths are kept; anything else is not a destination. */
export function rememberDestination(url: string | null): void {
  if (!url) return
  const { path, queryParams } = Linking.parse(url)
  if (!path || path === 'sign-in') return
  const query = new URLSearchParams(
    Object.entries(queryParams ?? {}).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : [],
    ),
  ).toString()
  pending = `/${path.replace(/^\/+/, '')}${query ? `?${query}` : ''}`
}

export function takeDestination(): string | undefined {
  const destination = pending
  pending = undefined
  return destination
}
