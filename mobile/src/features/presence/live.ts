// SOURCING: expo-widgets LiveActivityFactory (start with a URL and a stale date, update, end with a final state, getInstances after a relaunch); ./activity for which update wins; chat.threads.get to learn how a run ended while the app was away
//
// Keeps one Live Activity per ongoing activity. It follows the record: a
// newer record updates it, a stale one is ignored, an ended one ends it with
// the last real status. Nothing here stops work; closing or hiding the Live
// Activity only removes it from the phone's surfaces.
import { Platform } from 'react-native'
import { kv } from '@/lib/local-db'
import { theorem } from '@/lib/theorem'
import { eyeBoxes, poseFor } from '../theo/poses'
import { accept, isOngoing, livenessOf, type Activity } from './activity'
import type { TaskActivityProps } from './task-activity'

/** How long the phone vouches for a status it cannot refresh. After it the system marks the activity stale. */
const VOUCH_MS = 90_000
const KEY = 'presence.live'

type Kept = { instanceId: string; threadId?: string; activity: Activity }
type Instance = {
  getId(): string
  update(props: TaskActivityProps, staleDate?: Date): Promise<void>
  end(policy?: 'default' | 'immediate', props?: TaskActivityProps, contentDate?: Date): Promise<void>
}
type Factory = {
  start(props: TaskActivityProps, url?: string, staleDate?: Date): Instance
  getInstances(): Instance[]
}

let factory: Factory | null | undefined
const instances = new Map<string, Instance>()

/** The Live Activity module, or null where there is none (not iOS, or a build without the widget extension). */
function live(): Factory | null {
  if (factory !== undefined) return factory
  factory = null
  if (Platform.OS !== 'ios') return factory
  try {
    // Loaded on demand: importing the module registers the layout with the native side.
    factory = (require('./task-activity') as { default: Factory }).default
  } catch {
    factory = null
  }
  return factory
}

const read = (): Record<string, Kept> => {
  try {
    return JSON.parse(kv.get(KEY) ?? '{}') as Record<string, Kept>
  } catch {
    return {}
  }
}
const write = (kept: Record<string, Kept>) => kv.set(KEY, JSON.stringify(kept))

const where = (activity: Activity) =>
  activity.environment.kind === 'theorem'
    ? 'On Theorem'
    : activity.environment.kind === 'computer'
      ? `On ${activity.environment.name}`
      : 'On this iPhone'

export function propsOf(activity: Activity): TaskActivityProps {
  return {
    title: activity.title,
    status: activity.status,
    where: where(activity),
    needsYou: activity.standing === 'needs-you',
    eyes: eyeBoxes(poseFor(livenessOf(activity))),
  }
}

function adopt(): void {
  const module = live()
  if (!module || instances.size) return
  const kept = read()
  const alive = new Map(module.getInstances().map((instance) => [instance.getId(), instance]))
  for (const [activityId, entry] of Object.entries(kept)) {
    const instance = alive.get(entry.instanceId)
    if (instance) instances.set(activityId, instance)
    else delete kept[activityId]
  }
  write(kept)
}

export const liveActivities = {
  /**
   * Shows the activity, or brings what is shown up to date. `threadId` lets a
   * later launch ask Theorem how the run ended.
   */
  async show(activity: Activity, options: { url?: string; threadId?: string } = {}): Promise<void> {
    const module = live()
    if (!module) return
    adopt()
    const kept = read()
    const current = kept[activity.activityId]
    const instance = instances.get(activity.activityId)
    if (current && instance) {
      const verdict = accept(current.activity, activity)
      if (!verdict.accepted) return
      kept[activity.activityId] = { ...current, activity }
      write(kept)
      if (isOngoing(activity)) await instance.update(propsOf(activity), new Date(Date.now() + VOUCH_MS))
      else await this.finish(activity)
      return
    }
    if (!isOngoing(activity)) return
    try {
      const started = module.start(propsOf(activity), options.url, new Date(Date.now() + VOUCH_MS))
      instances.set(activity.activityId, started)
      kept[activity.activityId] = { instanceId: started.getId(), threadId: options.threadId, activity }
      write(kept)
    } catch {
      // Live Activities are off for this app, or the system refused one. The work is unaffected.
    }
  },

  /** The work ended: the Live Activity ends showing how. */
  async finish(activity: Activity): Promise<void> {
    const instance = instances.get(activity.activityId)
    const kept = read()
    delete kept[activity.activityId]
    write(kept)
    instances.delete(activity.activityId)
    await instance?.end('default', propsOf(activity), new Date()).catch(() => {})
  },

  /**
   * The app is in front again. A run may have ended while it was not looking:
   * ask Theorem about each thread still shown, and end what is over.
   */
  async reconcile(): Promise<void> {
    if (!live()) return
    adopt()
    for (const [activityId, entry] of Object.entries(read())) {
      if (!entry.threadId) continue
      try {
        const { thread } = await theorem().chat.threads.get({ threadId: entry.threadId })
        if (thread.activeRunId) {
          await instances.get(activityId)?.update(propsOf(entry.activity), new Date(Date.now() + VOUCH_MS))
          continue
        }
        // Theorem says the run is over; how it ended is read when the conversation is next opened.
        await this.finish({
          ...entry.activity,
          revision: entry.activity.revision + 1,
          phase: 'done',
          standing: 'settled',
          status: 'No longer running',
          actions: ['open'],
        })
      } catch {
        // Unreachable: leave it. The stale date already tells the person it is old.
      }
    }
  },
}
