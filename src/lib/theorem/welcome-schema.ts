// SOURCING: none needed (types only). The wire shape of Theorem's planned welcome endpoint, until @theoremharness/sdk carries it: docs/plans/welcome-endpoint.md

/**
 * What the new-chat view sends when it asks Theorem for its headline and
 * suggestions. Theorem reads the project and recent conversations itself.
 */
export interface WelcomeRequest {
  /** The person's local date and time, written out, so the model can place "this morning". */
  localTime: string
  /** Folders open in the desktop app, with their most recently changed files. */
  folders: Array<{ name: string; recentFiles: Array<string> }>
}

export interface WelcomeSuggestion {
  /** A short verb phrase, such as "Pick up". */
  title: string
  /** What it acts on, in a few words. */
  label: string
  /** The message sent when the suggestion is chosen, in the person's voice. */
  prompt: string
}

export interface Welcome {
  headline: string
  suggestions: Array<WelcomeSuggestion>
}
