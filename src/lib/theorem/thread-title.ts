// SOURCING: SDK history projection; titles share its canonical text-part mapping.
import type { ThreadMessageLike } from '@assistant-ui/react'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import type { Theorem } from './client'

export function isUntitledTitle(title: string | undefined): boolean {
  return !title?.trim() || title.trim().toLowerCase() === 'new chat'
}

export function threadTitle(
  snapshot: Pick<Theorem.ThreadSnapshot, 'thread' | 'messages'>,
  fallback: readonly ThreadMessageLike[] = [],
): string {
  if (!isUntitledTitle(snapshot.thread.title)) return snapshot.thread.title
  const messages = snapshot.messages.some((message) => message.role === 'user')
    ? toAssistantMessages(snapshot.messages, snapshot.thread)
    : fallback
  const content = messages.find((message) => message.role === 'user')?.content
  const text =
    typeof content === 'string'
      ? content
      : (content
          ?.map((part) => (part.type === 'text' ? part.text : ''))
          .join(' ') ?? '')
  return titleFrom(text)
}

function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (line.length <= 60) return line || 'New chat'
  const cut = line.slice(0, 60)
  const space = cut.lastIndexOf(' ')
  return `${space > 30 ? cut.slice(0, space) : cut}...`
}
