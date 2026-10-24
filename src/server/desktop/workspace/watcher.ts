// SOURCING: @parcel/watcher (FSEvents on macOS, native recursive watching)
// and lodash-es debounce with maxWait, which batches a burst of events (a git
// checkout, a save that writes a temporary file and renames it) into one
// reconcile without letting a steady stream of events delay it forever.
import { subscribe } from '@parcel/watcher'
import { debounce } from 'lodash-es'
import { toRelative } from './paths'

export interface FolderWatcher {
  close: () => Promise<void>
}

export interface WatchOptions {
  /** Quiet time before a batch is handed over. */
  debounceMs?: number
  /** The longest a batch waits while events keep arriving. */
  maxWaitMs?: number
}

/**
 * Watches `root` and hands over the workspace-relative paths that changed, a
 * batch at a time. Git's and package managers' folders are not watched.
 */
export async function watchFolder(
  root: string,
  onChange: (paths: Set<string>) => void,
  { debounceMs = 150, maxWaitMs = 1000 }: WatchOptions = {},
): Promise<FolderWatcher> {
  let pending = new Set<string>()
  const flush = debounce(
    () => {
      const batch = pending
      pending = new Set()
      if (batch.size > 0) onChange(batch)
    },
    debounceMs,
    { maxWait: maxWaitMs },
  )
  const subscription = await subscribe(
    root,
    (error, events) => {
      if (error) {
        console.error(`[workspace] watching ${root} failed`, error)
        return
      }
      for (const event of events) {
        const relative = toRelative(root, event.path)
        if (relative && !relative.startsWith('..')) pending.add(relative)
      }
      flush()
    },
    { ignore: ['.git', 'node_modules', '**/.git', '**/node_modules'] },
  )
  return {
    async close() {
      flush.cancel()
      await subscription.unsubscribe()
    },
  }
}
