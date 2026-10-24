// SOURCING: zod (the welcome route's request and answer, shared by the client and the server route)
import { z } from 'zod'

/** What the new-chat view knows when it asks for its headline and suggestions. */
export const WelcomeContext = z.object({
  /** The person's local date and time, written out, so the model can place "this morning". */
  localTime: z.string().max(80),
  project: z.string().max(200).optional(),
  /** Recent conversations, newest first. */
  threads: z
    .array(
      z.object({
        title: z.string().max(200),
        lastMessageAt: z.string().max(40).optional(),
        /** The last thing the person said in it, for the newest few. */
        lastAsk: z.string().max(600).optional(),
      }),
    )
    .max(8),
  /** Folders open in the desktop app, with their most recently changed files. */
  folders: z
    .array(
      z.object({
        name: z.string().max(200),
        recentFiles: z.array(z.string().max(300)).max(10),
      }),
    )
    .max(3),
})
export type WelcomeContext = z.infer<typeof WelcomeContext>

export const WelcomeSuggestion = z.object({
  /** A short verb phrase, such as "Pick up". */
  title: z.string(),
  /** What it acts on, in a few words. */
  label: z.string(),
  /** The message sent when the suggestion is chosen, in the person's voice. */
  prompt: z.string(),
})
export type WelcomeSuggestion = z.infer<typeof WelcomeSuggestion>

export const Welcome = z.object({
  headline: z.string(),
  suggestions: z.array(WelcomeSuggestion),
})
export type Welcome = z.infer<typeof Welcome>
