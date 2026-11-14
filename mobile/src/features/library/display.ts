// SOURCING: lib/kv-store.ts (useSyncExternalStore over the kv table)
//
// The display options the person chose for the Library list. On this device
// only: the Files API has no per-person view settings.
import { kvStore } from '@/lib/kv-store'
import { isDefaultDisplay, parseDisplay } from './display-model'

const store = kvStore('library.display', parseDisplay, (display) => (isDefaultDisplay(display) ? undefined : JSON.stringify(display)))

export const useDisplay = store.use
export const setDisplay = store.set
