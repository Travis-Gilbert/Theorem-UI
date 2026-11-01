// SOURCING: OpenIDEA's own `main.tsx` is the model for the boot order (activate the workbench,
// then the features, then the keyboard dispatcher, then render); this file replaces it because
// the page attaches to one Theorem workspace instead of a Tauri window. React, zustand and the
// CodeMirror registration points are the frontend's own. The workspace host is the SDK's
// (`@theoremharness/sdk`) through `src/host`.

import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/styles/global.css'
import { registerEditorContribution, isExternalChange } from '@/editor/api'
import { setDocBackend } from '@/editor/core/backend'
import { activateFeatures } from '@/features'
import { installKeyboardDispatcher } from '@/platform/keymap'
import { usePlatform } from '@/platform/platformInfo'
import { hideSplash } from '@/platform/splash'
import { prefetchLazyComponents } from '@/ui'
import { Workbench } from '@/workbench/Workbench'
import { activateWorkbench } from '@/workbench/activate'
import { registerStatusItem } from '@/workbench/contributions'
import { BrowserHostImpl } from './host/browser-host'
import { buildCommands } from './host/commands'
import type { EmittedEvent } from './host/commands/context'
import { sessionBackend } from './host/commands/doc'
import { WorkspaceConnection } from './host/connection'
import { installHost } from './host/host'
import { sessionEditing } from './host/session-extensions'
import { hostState } from './host/store'
import { ConflictBar } from './host/ui/ConflictBar'
import { PathPicker, requestPath } from './host/ui/PathPicker'
import { SessionStatus } from './host/ui/SessionStatus'

interface PageConfig {
  workspaceId: string
  name: string
  files: string[]
}

/** Which workspace this tab shows: `?workspace=<id>&name=<name>&file=<path>`. */
function readConfig(search: string): PageConfig | { error: string } {
  const params = new URLSearchParams(search)
  const workspaceId = params.get('workspace') ?? import.meta.env.VITE_THEOREM_WORKSPACE_ID ?? ''
  if (!workspaceId) {
    return { error: 'No workspace named. Open this page as ?workspace=<workspace id>[&name=<project name>][&file=<path>].' }
  }
  return { workspaceId, name: params.get('name') || workspaceId, files: params.getAll('file') }
}

function showError(title: string, detail: string): void {
  document.getElementById('splash')?.remove()
  const root = document.getElementById('root')
  if (!root) return
  const box = document.createElement('div')
  box.setAttribute('role', 'alert')
  box.setAttribute('data-testid', 'boot-error')
  box.style.cssText = 'font: 14px/1.5 system-ui, sans-serif; max-width: 640px; margin: 15vh auto; padding: 0 16px;'
  const heading = document.createElement('h1')
  heading.style.cssText = 'font-size: 18px; margin: 0 0 8px;'
  heading.textContent = title
  const body = document.createElement('p')
  body.textContent = detail
  box.append(heading, body)
  root.replaceChildren(box)
}

function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const held = new Map<string, string>()
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
    removeItem: (key) => void held.delete(key),
  }
}

async function main(): Promise<void> {
  const config = readConfig(window.location.search)
  if ('error' in config) return showError('Theorem IDE', config.error)

  const store = storage() ?? memoryStorage()
  const connection = new WorkspaceConnection({
    baseUrl: window.location.origin,
    workspaceId: config.workspaceId,
    name: config.name,
    storage: store,
  })

  // The host is installed before the first frontend module calls `invoke`; its events reach the
  // frontend's bus through the handle below.
  const emitter: { current: ((event: EmittedEvent) => void) | undefined } = { current: undefined }
  const { table, registry } = buildCommands(
    { connection, storage: store, emit: (event) => emitter.current?.(event) },
    { files: config.files },
  )
  const host = new BrowserHostImpl({
    description: `Theorem workspace ${config.workspaceId} over @theoremharness/sdk, served at ${window.location.origin}`,
    commands: table,
    pick: (options) => requestPath('open', options),
    save: async (options) => {
      const picked = await requestPath('save', options)
      return typeof picked === 'string' ? picked : null
    },
  })
  emitter.current = (event) => host.emit(event)
  installHost(host)

  try {
    await connection.ready
  } catch (error) {
    return showError(
      'Could not open the workspace',
      `${error instanceof Error ? error.message : String(error)} (workspace ${config.workspaceId} at ${window.location.origin})`,
    )
  }

  // Documents are shared sessions, not OpenIDEA's own operation-transform client (fork patch P3).
  setDocBackend(sessionBackend(registry))
  registerEditorContribution({
    id: 'theorem.session',
    order: 0,
    extensions: (ctx) => {
      // A document with no session (nothing from the workspace) is edited like any other.
      const history = registry.history(ctx.doc)
      return history ? sessionEditing(history, { external: isExternalChange }) : []
    },
  })
  registerStatusItem({ id: 'theorem.session', align: 'right', priority: 10, component: SessionStatus })

  // A tab has the browser's own window chrome.
  const forceBrowserChrome = () => {
    const { overlayTitleBar, framelessTitleBar } = usePlatform.getState()
    if (overlayTitleBar || framelessTitleBar) usePlatform.setState({ overlayTitleBar: false, framelessTitleBar: false })
  }
  forceBrowserChrome()
  usePlatform.subscribe(forceBrowserChrome)

  // The live stream's state, cursor and resyncs, shown in the status bar and kept across reloads.
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const saveSoon = () => {
    hostState.setCursor(connection.live.cursor)
    saveTimer ??= setTimeout(() => {
      saveTimer = undefined
      connection.saveCursor()
    }, 500)
  }
  connection.live.onState((state) => hostState.setLive(state))
  connection.live.onAny(saveSoon)
  connection.live.onResync((resync) => {
    hostState.addResync(resync.reason)
    hostState.setCursor(connection.live.cursor)
    connection.saveCursor()
  })
  window.addEventListener('pagehide', () => connection.saveCursor())
  window.addEventListener('beforeunload', (event) => {
    if (registry.hasUnsavedWork()) event.preventDefault()
  })

  activateWorkbench()
  // Order matters: features (e.g. the terminal) install capture-phase key handlers that must run
  // before the global dispatcher.
  activateFeatures()
  installKeyboardDispatcher()

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <Workbench />
      <ConflictBar />
      <PathPicker root={connection.root} />
    </React.StrictMode>,
  )
  hideSplash()
  prefetchLazyComponents()
}

void main()
