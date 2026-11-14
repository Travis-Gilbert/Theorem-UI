// SOURCING: lib/kv-store.ts (useSyncExternalStore over the kv table)
//
// What the person opened in the Library, newest first, on this device. The
// Files API does not record views, so search says "Recently viewed on this
// device" and falls back to what changed last when nothing has been opened.
import { kvStore } from '@/lib/kv-store'
import { pushRecent } from './model'

const store = kvStore<string[]>(
  'library.recent',
  (raw) => {
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter((path): path is string => typeof path === 'string') : []
    } catch {
      return []
    }
  },
  (paths) => (paths.length ? JSON.stringify(paths) : undefined),
)

export const useRecents = store.use
export const markViewed = (path: string) => store.set(pushRecent(store.get(), path))
