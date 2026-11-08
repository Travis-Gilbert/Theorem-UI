// SOURCING: expo-sqlite via local-db.ts
//
// A draft is the composer text for one thread, saved as the person types so a
// browser trip, a rotation or a terminated app returns it unchanged.
import { db } from './local-db'

export function readDraft(key: string): string {
  return db().getFirstSync<{ text: string }>('SELECT text FROM draft WHERE key = ?', [key])?.text ?? ''
}

export function writeDraft(key: string, text: string): void {
  if (text) {
    db().runSync('INSERT OR REPLACE INTO draft (key, text, updated_at) VALUES (?, ?, ?)', [
      key,
      text,
      Date.now(),
    ])
  } else {
    db().runSync('DELETE FROM draft WHERE key = ?', [key])
  }
}

const listeners = new Set<(key: string) => void>()

/** A change made outside the composer (an attached page reference) reaches an open composer. */
export function onDraftChanged(listener: (key: string) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function appendToDraft(key: string, text: string): void {
  const current = readDraft(key)
  writeDraft(key, current ? `${current.trimEnd()}\n\n${text}` : text)
  for (const listener of listeners) listener(key)
}

/** The conversation the person last had open: where browser captures go. */
let current: string | undefined
export const setCurrentThread = (threadId: string | undefined) => {
  current = threadId
}
export const currentThread = () => current
