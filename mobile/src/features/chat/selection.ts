// SOURCING: expo-router search params (selection that survives a resize lives in the URL)
//
// What the Chat tab has open: a Theorem thread, a Claude Code or Codex
// conversation on a computer, or the new-conversation composer. On a wide
// window it is a set of `/chat` params; on a narrow one, a pushed route.
import type { Agent } from '../agents/shell'

export type Selection =
  | { kind: 'theorem'; threadId: string }
  | { kind: 'agent'; computerId: string; agent: Agent; path: string }
  | { kind: 'new' }

export type SelectionParams = {
  thread?: string
  computer?: string
  agent?: string
  log?: string
  new?: string
}

const isAgent = (value: string | undefined): value is Agent => value === 'claude' || value === 'codex'

export function selectionOf(params: SelectionParams): Selection | undefined {
  if (params.thread) return { kind: 'theorem', threadId: params.thread }
  if (params.computer && isAgent(params.agent) && params.log)
    return { kind: 'agent', computerId: params.computer, agent: params.agent, path: params.log }
  if (params.new) return { kind: 'new' }
  return undefined
}

/** Every key is present, so setParams clears whatever the last selection set. */
export function paramsOf(selection: Selection | undefined): Record<keyof SelectionParams, string | undefined> {
  return {
    thread: selection?.kind === 'theorem' ? selection.threadId : undefined,
    computer: selection?.kind === 'agent' ? selection.computerId : undefined,
    agent: selection?.kind === 'agent' ? selection.agent : undefined,
    log: selection?.kind === 'agent' ? selection.path : undefined,
    new: selection?.kind === 'new' ? '1' : undefined,
  }
}

/** The pushed route for a narrow window. */
export function routeOf(selection: Selection) {
  switch (selection.kind) {
    case 'theorem':
      return { pathname: '/chat/[threadId]', params: { threadId: selection.threadId } } as const
    case 'agent':
      return {
        pathname: '/chat/agent',
        params: { computer: selection.computerId, agent: selection.agent, log: selection.path },
      } as const
    case 'new':
      return { pathname: '/chat/new' } as const
  }
}

export const sameSelection = (a: Selection | undefined, b: Selection | undefined) =>
  JSON.stringify(paramsOf(a)) === JSON.stringify(paramsOf(b))
