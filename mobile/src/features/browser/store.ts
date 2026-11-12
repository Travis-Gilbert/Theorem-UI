// SOURCING: React useSyncExternalStore; tab navigation metadata kept in the device kv table
//
// The contextual browser is one retained presentation above every
// destination. Hiding it keeps its pages alive; after the app is terminated,
// tabs come back from their saved addresses (not their unsaved form state).
import { useSyncExternalStore } from 'react'
import * as Crypto from 'expo-crypto'
import { kv } from '@/lib/local-db'

export type Tab = { id: string; url: string; title: string }
export type BrowserState = {
  tabs: Tab[]
  activeId: string | undefined
  visible: boolean
  expanded: boolean
}

const KEY = 'browser.tabs'
const MAX_TABS = 12

function restore(): BrowserState {
  try {
    const saved = JSON.parse(kv.get(KEY) ?? 'null') as Pick<BrowserState, 'tabs' | 'activeId'> | null
    if (saved?.tabs?.length)
      return { tabs: saved.tabs, activeId: saved.activeId, visible: false, expanded: false }
  } catch {
    // Unreadable metadata starts an empty browser.
  }
  return { tabs: [], activeId: undefined, visible: false, expanded: false }
}

let state: BrowserState | undefined
const listeners = new Set<() => void>()
const get = () => (state ??= restore())

function set(next: BrowserState) {
  const previous = get()
  state = next
  if (previous.tabs !== next.tabs || previous.activeId !== next.activeId)
    kv.set(KEY, JSON.stringify({ tabs: next.tabs, activeId: next.activeId }))
  for (const listener of listeners) listener()
}

export function useBrowser(): BrowserState {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, get)
}

export const isWebUrl = (url: string) => /^https?:\/\//i.test(url)

/** Opens a link in the contextual browser, reusing a tab already on that address. */
export function openInBrowser(url: string): void {
  const current = get()
  const existing = current.tabs.find((tab) => tab.url === url)
  if (existing) {
    set({ ...current, activeId: existing.id, visible: true })
    return
  }
  const tab: Tab = { id: Crypto.randomUUID(), url, title: new URL(url).host }
  set({
    ...current,
    tabs: [...current.tabs, tab].slice(-MAX_TABS),
    activeId: tab.id,
    visible: true,
  })
}

export const showBrowser = () => set({ ...get(), visible: true })
export const hideBrowser = () => set({ ...get(), visible: false })
export const toggleExpanded = () => set({ ...get(), expanded: !get().expanded })
export const selectTab = (id: string) => set({ ...get(), activeId: id })

export function closeTab(id: string): void {
  const current = get()
  const tabs = current.tabs.filter((tab) => tab.id !== id)
  set({
    ...current,
    tabs,
    activeId: current.activeId === id ? tabs.at(-1)?.id : current.activeId,
    visible: tabs.length > 0 && current.visible,
  })
}

export function updateTab(id: string, patch: Partial<Omit<Tab, 'id'>>): void {
  const current = get()
  const tab = current.tabs.find((candidate) => candidate.id === id)
  if (!tab || (tab.url === (patch.url ?? tab.url) && tab.title === (patch.title ?? tab.title))) return
  set({ ...current, tabs: current.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
}

/** What an explicit capture records: never taken without the person asking. */
export type PageCapture = {
  url: string
  title: string
  capturedAt: string
  selectedText?: string
}

export function captureReference(capture: PageCapture): string {
  const quote = capture.selectedText?.trim()
    ? `\n> ${capture.selectedText.trim().slice(0, 2000).replace(/\n/g, '\n> ')}`
    : ''
  return `[${capture.title || capture.url}](${capture.url}) (captured ${capture.capturedAt})${quote}`
}
