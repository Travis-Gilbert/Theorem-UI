// SOURCING: none. Which screen each system action opens; kept apart from the native module so it is tested without one.
//
// A system action (a Shortcut, the Action button, Siri, Spotlight) opens the
// app at the screen a person would reach by hand. The work is done there.

export type Invocation = { id: string; name: string; params: Record<string, unknown> }

export type Destination =
  | { pathname: '/intake'; params: { from?: 'camera'; text?: string } }
  | { pathname: '/chat/[threadId]'; params: { threadId: string } }
  | { pathname: '/chat' }

/** Undefined for a name this build does not know: it is dropped, not guessed at. */
export function destinationOf(invocation: Invocation, lastThreadId: string | undefined): Destination | undefined {
  switch (invocation.name) {
    case 'captureForConversation':
      return { pathname: '/intake', params: { from: 'camera' } }
    case 'shareIntoConversation': {
      const note = invocation.params.note
      return { pathname: '/intake', params: typeof note === 'string' && note.trim() ? { text: note } : {} }
    }
    case 'continueConversation':
      return lastThreadId
        ? { pathname: '/chat/[threadId]', params: { threadId: lastThreadId } }
        : { pathname: '/chat' }
    default:
      return undefined
  }
}

/**
 * The newest invocation wins the screen; every one is cleared. Opening three
 * screens for three stale taps would help nobody.
 */
export function settle(
  pending: Invocation[],
  lastThreadId: string | undefined,
): { open?: Destination; remove: string[] } {
  let open: Destination | undefined
  for (const invocation of pending) open = destinationOf(invocation, lastThreadId) ?? open
  return { open, remove: pending.map((invocation) => invocation.id) }
}
