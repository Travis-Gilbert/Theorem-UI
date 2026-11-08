import { threadId } from '../../film/state/thread.json'

/**
 * Where the embedded app lives: the demo account's thread that the film ends on,
 * so the still and the live app it turns into are the same conversation. The
 * capture writes that thread (film/state/thread.json). Without a demo the page
 * says so and offers Join; it never claims a demo it does not have.
 */
export const liveUrl: string | undefined = import.meta.env.VITE_DEMO_URL
  ? `${String(import.meta.env.VITE_DEMO_URL).replace(/\/+$/, '')}/c/${threadId}`
  : undefined
