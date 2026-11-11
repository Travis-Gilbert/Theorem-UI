// SOURCING: @tanstack/react-query (the work tracker's persisted switches at /api/work/v1/settings, through ./api), following lib/theorem/credentials
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { hasStatus, isSignedOut } from '@/lib/theorem/client'
import { isNotServed } from '@/lib/theorem/passthrough'
import * as api from './api'
import { SETTINGS_KEY } from './cache'
import type { WorkSettings } from './contract'

const retry = (failures: number, error: unknown) =>
  !isSignedOut(error) && !isNotServed(error) && failures < 1

export const settingsQuery = queryOptions({
  queryKey: SETTINGS_KEY,
  queryFn: api.readSettings,
  staleTime: 30_000,
  retry,
})

export type WorkTracker =
  | { state: 'loading' }
  /** Switched off, or this Theorem does not serve the tracker. */
  | { state: 'off'; served: boolean }
  | { state: 'error'; error: unknown }
  | { state: 'on'; settings: WorkSettings; github: boolean }

/** Whether the tracker is on, and whether its GitHub source is. */
export function useWorkTracker(): WorkTracker {
  const { data, error, isPending } = useQuery(settingsQuery)
  if (data)
    return data.enabled
      ? { state: 'on', settings: data, github: data.github.enabled }
      : { state: 'off', served: true }
  if (isPending) return { state: 'loading' }
  return isNotServed(error)
    ? { state: 'off', served: false }
    : { state: 'error', error }
}

/** True once the tracker is known to be on; false while it loads, is off, or is not served. */
export const useWorkAvailable = () => useWorkTracker().state === 'on'

/** The two switches this UI owns; anything else in the settings is left as read. */
export type SettingsChange = Partial<{ enabled: boolean; github: boolean }>

export const withChange = (
  settings: WorkSettings,
  change: SettingsChange,
): WorkSettings => ({
  ...settings,
  enabled: change.enabled ?? settings.enabled,
  github: {
    ...settings.github,
    enabled: change.github ?? settings.github.enabled,
  },
})

/**
 * Reads the settings fresh, changes the switches and writes the whole object
 * back with the revision it was read at, so the fields another screen owns
 * (the consequences) are written as they were. A write that lost the race is
 * read and made again once.
 */
export async function saveSettings(change: SettingsChange) {
  for (let attempt = 0; ; attempt++)
    try {
      return await api.writeSettings(withChange(await api.readSettings(), change))
    } catch (error) {
      if (attempt > 0 || !hasStatus(error, 409, 412)) throw error
    }
}

export function useSaveWorkSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: saveSettings,
    onSuccess: (settings) => client.setQueryData(SETTINGS_KEY, settings),
    onSettled: () => void client.invalidateQueries({ queryKey: SETTINGS_KEY }),
  })
}
