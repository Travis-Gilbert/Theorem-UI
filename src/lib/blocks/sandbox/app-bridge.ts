// SOURCING: the modules beside it; the script the block listener adds to an
// HTML app's pages (served at /__runtime/app-bridge). It gives the app
// `window.theorem`: the same declared files, state and run calls a cell has.
// On a page, an app placed as a module also gets `theorem.module`: the values
// it is handed, the actions routes reach, and the outputs and events it
// declared.
import { CellContext } from './cell'
import { connectToPage } from './connect'
import { observeHeight, observeSnapshots } from './display'
import { call, rpcOver, serve } from './protocol'
import type { ModuleValues, PageMethods, SandboxMethods } from './protocol'
import { THEME_EVENT, applyTheme } from './theme'

type ModuleListener = (values: ModuleValues) => void
let moduleValues: ModuleValues | undefined
const moduleListeners = new Set<ModuleListener>()
type ActionListener = (payload: unknown) => void
const actionListeners = new Map<string, Set<ActionListener>>()

const context = connectToPage().then((port) => {
  const rpc = rpcOver(port)
  const cells = new CellContext(rpc, { show: () => {}, clear: () => {} })
  serve<SandboxMethods, 'state.changed'>(
    rpc,
    'state.changed',
    async ({ name, value }) => {
      await cells.changed(name, value)
      return null
    },
  )
  // Served before the first message is read, so the first values are seen.
  serve<SandboxMethods, 'module.inputs'>(rpc, 'module.inputs', (values) => {
    moduleValues = values
    for (const listener of moduleListeners) listener(values)
    return null
  })
  serve<SandboxMethods, 'module.action'>(rpc, 'module.action', ({ name, payload }) => {
    for (const listener of actionListeners.get(name) ?? []) listener(payload)
    return null
  })
  // The page's tokens on this document's root; CSS and cells that read them follow.
  serve<SandboxMethods, 'theme.changed'>(rpc, 'theme.changed', (theme) => {
    applyTheme(theme)
    window.dispatchEvent(new Event(THEME_EVENT))
    return null
  })
  observeHeight((height) => {
    void call<PageMethods, 'frame.resize'>(rpc, 'frame.resize', { height })
  })
  observeSnapshots((html) => {
    void call<PageMethods, 'frame.snapshot'>(rpc, 'frame.snapshot', { html })
  })
  const selection = (event?: Event) => {
    const selected = window.getSelection()
    const node = selected?.anchorNode
    const element = node instanceof Element ? node : node?.parentElement
    const active = document.activeElement
    const input = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null
    const text = input && input.selectionStart !== null
      ? input.value.slice(input.selectionStart,input.selectionEnd ?? input.selectionStart)
      : selected?.toString() ?? ''
    // A click on a lane or a bar selects it even when no text is selected.
    const pointed = event?.type === 'pointerup' && event.target instanceof Element ? event.target : null
    const target = input ?? pointed ?? element
    const entity = target?.closest('[data-entity-id]')
    const entityId = entity?.getAttribute('data-entity-id') ?? undefined
    const entityLabel = entity?.getAttribute('data-entity-label') ?? entity?.getAttribute('aria-label') ?? undefined
    const rowId = target?.closest('[data-row-id]')?.getAttribute('data-row-id') ?? undefined
    const field = target?.closest('[data-field]')?.getAttribute('data-field') ?? undefined
    // A notebook's cells are sections with an id; the one used is marked selected.
    const cell = target?.closest('[data-cell-id]')
    if (cell && event?.type === 'pointerup') {
      for (const other of document.querySelectorAll('[data-cell-id][data-selected]'))
        if (other !== cell) other.removeAttribute('data-selected')
      cell.setAttribute('data-selected', '')
    }
    const cellId = cell?.getAttribute('data-cell-id') ?? undefined
    void call<PageMethods,'frame.selection'>(rpc,'frame.selection',{
      text:text.slice(0,4096),rowId:rowId?.slice(0,200),field:field?.slice(0,200),
      entityId:entityId?.slice(0,200),entityLabel:entityLabel?.slice(0,200),
      cellId:cellId?.slice(0,200),
    }).catch(() => {})
  }
  // A person's input inside the frame never reaches the page; say so, so a
  // module's next event starts its own chain.
  const used = () => {
    void call<PageMethods, 'module.used'>(rpc, 'module.used', {}).catch(() => {})
  }
  document.addEventListener('pointerdown', used, true)
  document.addEventListener('keydown', used, true)
  // A click collapses the text selection after pointerup has reported what it
  // pointed at; only a selection with text in it is news.
  document.addEventListener('selectionchange',() => {
    if (window.getSelection()?.isCollapsed === false) selection()
  })
  document.addEventListener('pointerup',selection)
  document.addEventListener('keyup',selection)
  return cells
})

type Files = ReturnType<CellContext['files']>
const files =
  (name: keyof Files) =>
  async (...args: Array<string>) =>
    ((await context).files()[name] as (...a: Array<string>) => unknown)(...args)

const theorem = {
  /** Resolves once the page has connected this app. */
  ready: context.then(() => undefined),
  files: {
    text: files('text'),
    json: files('json'),
    csv: files('csv'),
    bytes: files('bytes'),
    list: files('list'),
    write: files('write'),
  },
  state: async (name: string) => (await context).state(name),
  run: async (target: string) =>
    call<PageMethods, 'run.request'>((await context).rpc, 'run.request', {
      target,
    }),
  module: {
    /** Calls `listener` with the current values, and again when they change. */
    onInputs(listener: ModuleListener): () => void {
      moduleListeners.add(listener)
      if (moduleValues) listener(moduleValues)
      return () => moduleListeners.delete(listener)
    },
    /** Calls `listener` each time a route reaches the declared action `name`. */
    onAction(name: string, listener: ActionListener): () => void {
      const listeners = actionListeners.get(name) ?? new Set<ActionListener>()
      actionListeners.set(name, listeners)
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    output: async (name: string, value: unknown) =>
      call<PageMethods, 'module.output'>((await context).rpc, 'module.output', {
        name,
        value,
      }),
    emit: async (name: string, payload: unknown) =>
      call<PageMethods, 'module.emit'>((await context).rpc, 'module.emit', {
        name,
        payload,
      }),
  },
}

Object.defineProperty(window, 'theorem', { value: theorem })
