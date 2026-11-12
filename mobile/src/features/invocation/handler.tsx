// SOURCING: expo-app-intents useAppIntents (pending invocations first, then live ones; each must be removed once handled) and removePendingInvocationAsync; expo-router
//
// Mounted only while signed in, so an action taken while signed out waits in
// the native queue and opens once the person is back.
import * as AppIntents from 'expo-app-intents'
import { router } from 'expo-router'
import { kv } from '@/lib/local-db'
import { settle } from './route'

const LAST_THREAD = 'chat.last-thread'

/** The Theorem conversation last opened on this phone, for "Continue the conversation". */
export const rememberLastThread = (threadId: string) => kv.set(LAST_THREAD, threadId)

export function SystemActions() {
  AppIntents.useAppIntents(async (pending) => {
    if (!pending.length) return
    const { open, remove } = settle(pending, kv.get(LAST_THREAD))
    for (const id of remove) await AppIntents.removePendingInvocationAsync(id).catch(() => {})
    if (open) router.push(open as never)
  })
  return null
}
