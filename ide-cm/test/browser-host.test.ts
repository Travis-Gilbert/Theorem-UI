// FIXTURE (evidence grade: fixture). The browser host's contract: an unanswered command is a
// typed, counted `unavailable` failure; SDK-shaped errors become the `IdeError` kinds the frontend
// switches on; the window behaviours a tab has are real and the close veto works.

import { describe, expect, test } from 'bun:test'
import { BrowserHostImpl, IDE_EVENT, toFailure } from '../src/host/browser-host'
import { failure, type CommandHandler } from '../src/host/host'

function make(commands: Record<string, CommandHandler> = {}, extra: Partial<ConstructorParameters<typeof BrowserHostImpl>[0]> = {}) {
  const closed: string[] = []
  const listeners = new Map<string, Set<() => void>>()
  const page = {
    document,
    addEventListener: (name: string, fn: () => void) => void (listeners.get(name) ?? listeners.set(name, new Set()).get(name)!).add(fn),
    removeEventListener: (name: string, fn: () => void) => void listeners.get(name)?.delete(fn),
    open: () => null,
    close: () => void closed.push('closed'),
    focus: () => {},
  } as unknown as NonNullable<ConstructorParameters<typeof BrowserHostImpl>[0]['page']>
  const host = new BrowserHostImpl({
    description: 'test host',
    commands: new Map(Object.entries(commands)),
    pick: async () => null,
    save: async () => null,
    page,
    ...extra,
  })
  return { host, closed, listeners }
}

describe('browser host commands', () => {
  test('an answered command returns its value; an unanswered one is a counted unavailable failure', async () => {
    const { host } = make({ ping: async () => 'pong' })
    expect(await host.invoke('ping')).toBe('pong')
    await expect(host.invoke('vcs_status')).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(host.invoke('vcs_status')).rejects.toMatchObject({ kind: 'unavailable' })
    expect(host.refused.get('vcs_status')).toEqual({ count: 2, message: 'The command "vcs_status" is not available: this Theorem workspace host does not provide it' })
    expect(host.refused.has('ping')).toBe(false)
  })

  test('a handler failure keeps its kind; an Error becomes internal', async () => {
    const { host } = make({
      typed: () => {
        throw failure('notFound', 'no such file')
      },
      plain: () => {
        throw new Error('boom')
      },
    })
    await expect(host.invoke('typed')).rejects.toEqual({ kind: 'notFound', message: 'no such file' })
    await expect(host.invoke('plain')).rejects.toMatchObject({ kind: 'internal', message: 'boom' })
  })
})

describe('unavailable features', () => {
  test('a handler that refuses a case it cannot serve is counted with its reason', async () => {
    const { host } = make({
      open_project: () => {
        throw failure('unavailable', 'Opening /other is not available: this tab is attached to /ws')
      },
    })
    const seen: string[] = []
    host.onRefused((feature, r) => seen.push(`${feature} ${r.count}`))
    await expect(host.invoke('open_project')).rejects.toMatchObject({ kind: 'unavailable' })
    expect(host.refused.get('open_project')).toEqual({ count: 1, message: 'Opening /other is not available: this tab is attached to /ws' })
    expect(seen).toEqual(['open_project 1'])
  })

  test('other failures are not counted as unavailable', async () => {
    const { host } = make({ read: () => { throw failure('notFound', 'gone') } })
    await expect(host.invoke('read')).rejects.toMatchObject({ kind: 'notFound' })
    expect(host.refused.size).toBe(0)
  })

  test('refuse names a platform feature, counts it and returns the typed failure', () => {
    const { host } = make()
    expect(host.refuse('window.minimize', 'Minimizing the window', 'a tab has the browser window')).toEqual({
      kind: 'unavailable',
      message: 'Minimizing the window is not available: a tab has the browser window',
    })
    host.refuse('window.minimize', 'Minimizing the window', 'a tab has the browser window')
    expect(host.refused.get('window.minimize')?.count).toBe(2)
  })

  test('only web and mail links leave the page; anything else is a counted refusal', () => {
    const opened: string[] = []
    const { host } = make()
    ;(host as unknown as { options: { page: { open: (u: string) => void } } }).options.page.open = (u) => void opened.push(u)
    host.openExternal('https://example.com/docs')
    host.openExternal('mailto:a@example.com')
    expect(() => host.openExternal('file:///etc/passwd')).toThrow()
    expect(opened).toEqual(['https://example.com/docs', 'mailto:a@example.com'])
    expect(host.refused.get('opener.openUrl')?.count).toBe(1)
  })

  test('files dropped from this computer are taken (the page is not replaced) and refused', () => {
    const { host, listeners } = make()
    const fire = (name: string, types: string[]) => {
      let prevented = false
      const event = { dataTransfer: { types }, preventDefault: () => void (prevented = true) }
      for (const fn of listeners.get(name) ?? []) (fn as (e: unknown) => void)(event)
      return prevented
    }
    expect(fire('dragover', ['Files'])).toBe(true)
    expect(fire('drop', ['Files'])).toBe(true)
    expect(host.refused.get('webview.dragDrop')?.count).toBe(1)
    // A drag inside the page (a tab, a tree node) is the frontend's own and is left alone.
    expect(fire('dragover', ['text/plain'])).toBe(false)
    expect(fire('drop', ['text/plain'])).toBe(false)
    expect(host.refused.get('webview.dragDrop')?.count).toBe(1)
  })

  test('the window and opener shims refuse through the host with an Error whose message says why', async () => {
    const { installHost } = await import('../src/host/host')
    const { getCurrentWindow } = await import('../src/host/tauri-window')
    const opener = await import('../src/host/plugin-opener')
    const core = await import('../src/host/tauri-core')
    const { host } = make()
    installHost(host)
    const minimized = await getCurrentWindow().minimize().catch((e: unknown) => e)
    expect(minimized).toBeInstanceOf(Error)
    expect(minimized).toMatchObject({ kind: 'unavailable', message: 'Minimizing the window is not available: a browser tab has the browser’s own window' })
    await expect(getCurrentWindow().startDragging()).rejects.toMatchObject({ kind: 'unavailable' })
    const revealed = await opener.revealItemInDir('/ws/a.txt').catch((e: unknown) => e)
    expect(revealed).toBeInstanceOf(Error)
    expect((revealed as Error).message).toBe('Showing a file in the file manager is not available: the files are on the workspace host, not this computer')
    await expect(opener.openPath('/ws/a.txt')).rejects.toMatchObject({ kind: 'unavailable' })
    expect(() => core.convertFileSrc('/ws/a.png')).toThrow('A URL for a workspace file is not available')
    expect([...host.refused.keys()].sort()).toEqual([
      'core.convertFileSrc',
      'opener.openPath',
      'opener.revealItemInDir',
      'window.minimize',
      'window.startDragging',
    ])
  })
})

describe('toFailure', () => {
  const sdk = (statusCode: number, code?: string) => Object.assign(new Error(`status ${statusCode}`), { statusCode, body: code ? { code } : {} })

  test('SDK status codes map to the kinds the frontend switches on', () => {
    expect(toFailure(sdk(404)).kind).toBe('notFound')
    expect(toFailure(sdk(409)).kind).toBe('alreadyExists')
    expect(toFailure(sdk(403)).kind).toBe('permissionDenied')
    expect(toFailure(sdk(422)).kind).toBe('invalidInput')
    expect(toFailure(sdk(503)).kind).toBe('unavailable')
    expect(toFailure(sdk(500)).kind).toBe('io')
  })

  test('a stale revision is outOfSync even though it arrives as a 409', () => {
    expect(toFailure(sdk(409, 'stale_revision')).kind).toBe('outOfSync')
    expect(toFailure(sdk(409)).kind).toBe('alreadyExists')
  })

  test('the host\'s typed refusals, all 409s, map by their code, with the host\'s own sentence', () => {
    const said = (code: string, message: string) =>
      Object.assign(new Error('workspace.files.copy: HTTP 409'), { statusCode: 409, body: { code, message, detail: null } })
    expect(toFailure(said('not_found', 'a.txt does not exist'))).toEqual({ kind: 'notFound', message: 'a.txt does not exist' })
    // The code travels in its own field, so the message is the host's sentence and is shown as sent.
    expect(toFailure(said('not_found', 'refused [not_found]: a.txt')).message).toBe('refused [not_found]: a.txt')
    expect(toFailure(said('already_exists', 'b already exists')).kind).toBe('alreadyExists')
    expect(toFailure(said('copy_into_itself', 'd/x is inside d')).kind).toBe('invalidInput')
    expect(toFailure(said('not_a_directory', 'a.txt is not a directory')).kind).toBe('invalidInput')
    expect(toFailure(said('not_a_file', 'src is not a file'))).toEqual({ kind: 'invalidInput', message: 'src is not a file' })
    expect(toFailure(said('invalid_mode', 'setMode takes exactly one of mode or writable')).kind).toBe('invalidInput')
    expect(toFailure(said('invalid_pattern', 'Invalid regular expression: unclosed group'))).toEqual({
      kind: 'invalidInput',
      message: 'Invalid regular expression: unclosed group',
    })
    expect(toFailure(said('invalid_glob', 'invalid glob src/[a: unclosed character class')).kind).toBe('invalidInput')
    expect(toFailure(said('io_error', 'locked/a.txt could not be read: Permission denied (os error 13)')).kind).toBe('io')
    expect(toFailure(said('unknown_search', 'search:4 is not a running search')).kind).toBe('notFound')
    expect(toFailure(said('withheld', 'withheld')).kind).toBe('permissionDenied')
    expect(toFailure(said('state_unavailable', 'no per-user state store is bound')).kind).toBe('unavailable')
    expect(toFailure(said('mode_unsupported', 'unsupported')).kind).toBe('unavailable')
    // The host's untyped failure is a failed operation, not a taken name.
    expect(toFailure(said('ide_operation_failed', 'query required'))).toEqual({ kind: 'io', message: 'query required' })
    expect(toFailure(said('host_operation_failed', 'pty session not found')).kind).toBe('io')
    // A code this client does not know, and an inherited property name, fall back to the status.
    expect(toFailure(said('brand_new_code', 'x')).kind).toBe('alreadyExists')
    expect(toFailure(said('toString', 'x')).kind).toBe('alreadyExists')
  })

  test('a range error from the SDK offset helpers is invalid input', () => {
    expect(toFailure(new RangeError('UTF-16 offset 3 splits a surrogate pair')).kind).toBe('invalidInput')
  })
})

describe('browser host events and window', () => {
  test('events reach subscribers on the IDE bus and on named channels', () => {
    const { host } = make()
    const bus: unknown[] = []
    const menu: unknown[] = []
    const off = host.subscribe((p) => bus.push(p))
    host.listen('menu', (p) => menu.push(p))
    host.emit({ type: 'docDirty', doc: 1, dirty: true })
    host.emitTo('menu', 'x')
    host.emitTo(IDE_EVENT, { type: 'settingsChanged', key: 'a' })
    off()
    host.emit({ type: 'ignored' })
    expect(bus).toEqual([{ type: 'docDirty', doc: 1, dirty: true }, { type: 'settingsChanged', key: 'a' }])
    expect(menu).toEqual(['x'])
  })

  test('close runs the handlers and closes the page unless one vetoes', async () => {
    const { host, closed } = make()
    host.window.onCloseRequested((event) => event.preventDefault())
    await host.window.close()
    expect(closed).toEqual([])

    const second = make()
    await second.host.window.close()
    expect(second.closed).toEqual(['closed'])
  })

  test('setTitle and setZoom change the document', () => {
    const { host } = make()
    host.window.setTitle('Theorem IDE: demo')
    expect(document.title).toBe('Theorem IDE: demo')
    host.window.setZoom(1.25)
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('1.25')
  })

  test('onResized hears the page resize until it is unlistened', () => {
    const { host, listeners } = make()
    let heard = 0
    const off = host.window.onResized(() => void (heard += 1))
    for (const fn of [...(listeners.get('resize') ?? [])]) fn()
    off()
    for (const fn of [...(listeners.get('resize') ?? [])]) fn()
    expect(heard).toBe(1)
    expect(listeners.get('resize')?.size).toBe(0)
  })
})
