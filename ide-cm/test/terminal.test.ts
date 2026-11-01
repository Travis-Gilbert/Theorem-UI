// FIXTURE (evidence grade: fixture). OpenIDEA's `term_*` commands over the SDK TerminalChannel and
// the fake workspace host (test/fixtures/host.ts): output streamed into the view's Channel,
// input and resize reaching the shell, a gap or truncated log redrawn from the host's screen, the
// exit event, and the requests the host cannot honour. The shell itself is not exercised here;
// the live-local run in lanes/I02.md is the only thing that reached a real host terminal.

import { afterEach, describe, expect, test } from 'bun:test'
import { Channel } from '../src/host/tauri-core'
import { closeHarnesses, harness } from './fixtures/commands'
import { until } from './fixtures/host'

afterEach(closeHarnesses)

const options = (over: Record<string, unknown> = {}) => ({
  cwd: '/demo',
  shell: null,
  args: [],
  env: {},
  cols: 80,
  rows: 24,
  shellIntegration: true,
  ...over,
})

/** A terminal view's end of `term_spawn`: a Channel collecting what the shell printed. */
function view() {
  const channel = new Channel<string>()
  const printed: string[] = []
  channel.onmessage = (chunk) => void printed.push(chunk)
  return { channel, printed, text: () => printed.join('') }
}

describe('term_spawn', () => {
  test('opens a shell of the requested size and answers the terminal the view will address', async () => {
    const h = await harness()
    const v = view()
    const info = (await h.call('term_spawn', { options: options({ cols: 100, rows: 30 }), onOutput: v.channel })) as any
    expect(info).toMatchObject({ id: 1, title: 'Workspace', pid: null })
    expect(h.server.shell.sessions).toHaveLength(1)
    expect(h.server.shell.sessions[0]!.size).toEqual({ cols: 100, rows: 30 })
    const second = (await h.call('term_spawn', { options: options(), onOutput: view().channel })) as any
    expect(second.id).toBe(2)
  })

  test('output the shell printed before the page attached, and output after it, arrive once and in order', async () => {
    const h = await harness()
    const v = view()
    h.server.shell.banner = 'prompt$ '
    await h.call('term_spawn', { options: options(), onOutput: v.channel })
    const shell = h.server.shell.sessions[0]!
    expect(v.text()).toBe('prompt$ ')
    h.server.shell.write(shell, 'ls\r\n')
    h.server.shell.write(shell, 'a.txt\r\n')
    await until(() => v.text() === 'prompt$ ls\r\na.txt\r\n', 'the streamed output')
  })

  test('a character split across two chunks is printed whole', async () => {
    const h = await harness()
    const v = view()
    await h.call('term_spawn', { options: options(), onOutput: v.channel })
    const shell = h.server.shell.sessions[0]!
    const bytes = new TextEncoder().encode('é😀')
    h.server.shell.write(shell, bytes.subarray(0, 1))
    h.server.shell.write(shell, bytes.subarray(1, 4))
    h.server.shell.write(shell, bytes.subarray(4))
    await until(() => v.text() === 'é😀', 'the whole text')
    expect(v.printed.join('')).not.toContain('�')
  })

  test('a log the host no longer holds is replaced by its screen: the view clears, then draws it', async () => {
    const h = await harness()
    const v = view()
    await h.call('term_spawn', { options: options(), onOutput: v.channel })
    const shell = h.server.shell.sessions[0]!
    h.server.shell.write(shell, 'one\r\n')
    await until(() => v.text() === 'one\r\n', 'the first output')
    // The page misses 'two' (it was never announced) and the host drops the log up to it.
    h.server.shell.write(shell, 'two\r\n', false)
    h.server.shell.truncate(shell, 5 + 5)
    h.server.shell.write(shell, 'three\r\n')
    await until(() => v.text().endsWith('\x1bcSCREEN'), 'the screen redraw')
  })

  test('half a character left over from before a redraw does not corrupt what follows it', async () => {
    const h = await harness()
    const v = view()
    await h.call('term_spawn', { options: options(), onOutput: v.channel })
    const shell = h.server.shell.sessions[0]!
    h.server.shell.write(shell, new TextEncoder().encode('é').subarray(0, 1))
    h.server.shell.write(shell, 'lost', false)
    h.server.shell.truncate(shell, 1 + 4)
    h.server.shell.write(shell, 'x')
    await until(() => v.text().endsWith('\x1bcSCREEN'), 'the screen redraw')
    h.server.shell.write(shell, 'y')
    await until(() => v.text().endsWith('SCREENy'), 'output after the redraw')
    expect(v.text().split('\x1bc')[1]).toBe('SCREENy')
  })

  test('the shell and its arguments are the host\'s: a request to choose them is unavailable, the plain one is accepted', async () => {
    const h = await harness()
    for (const over of [{ shell: '/bin/fish' }, { args: ['-l'] }, { env: { A: '1' } }]) {
      await expect(h.call('term_spawn', { options: options(over), onOutput: view().channel })).rejects.toMatchObject({ kind: 'unavailable' })
    }
    await expect(h.call('term_spawn', { options: options({ cwd: '/demo/src' }), onOutput: view().channel })).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(h.call('term_spawn', { options: options({ cwd: '/elsewhere' }), onOutput: view().channel })).rejects.toMatchObject({ kind: 'unavailable' })
    expect(h.server.shell.sessions).toHaveLength(0)
    await expect(h.call('term_spawn', { options: options(), onOutput: view().channel })).resolves.toMatchObject({ id: 1 })
  })

  test('a malformed call is invalid input', async () => {
    const h = await harness()
    await expect(h.call('term_spawn', { options: options() })).rejects.toMatchObject({ kind: 'invalidInput' })
    await expect(h.call('term_spawn', { options: 'bash', onOutput: view().channel })).rejects.toMatchObject({ kind: 'invalidInput' })
  })
})

describe('term_write, term_resize, term_kill, term_is_busy', () => {
  test('keystrokes and the new size reach the shell they were addressed to', async () => {
    const h = await harness()
    const a = (await h.call('term_spawn', { options: options(), onOutput: view().channel })) as any
    const b = (await h.call('term_spawn', { options: options(), onOutput: view().channel })) as any
    expect(await h.call('term_write', { id: b.id, data: 'ls\r' })).toBeNull()
    expect(await h.call('term_resize', { id: a.id, cols: 120, rows: 40 })).toBeNull()
    const [first, second] = h.server.shell.sessions
    expect(first!.inputs).toEqual([])
    expect(second!.inputs).toEqual(['ls\r'])
    expect(first!.size).toEqual({ cols: 120, rows: 40 })
    expect(second!.size).toEqual({ cols: 80, rows: 24 })
  })

  test('an id that was never attached is not found', async () => {
    const h = await harness()
    await expect(h.call('term_write', { id: 9, data: 'x' })).rejects.toMatchObject({ kind: 'notFound' })
    await expect(h.call('term_resize', { id: 9, cols: 1, rows: 1 })).rejects.toMatchObject({ kind: 'notFound' })
  })

  test('closing a terminal detaches the page and leaves the shell running; later output no longer reaches the view', async () => {
    const h = await harness()
    const v = view()
    const info = (await h.call('term_spawn', { options: options(), onOutput: v.channel })) as any
    const shell = h.server.shell.sessions[0]!
    expect(await h.call('term_kill', { id: info.id })).toBeNull()
    expect(shell.closed).toBe(true)
    expect(shell.attachments).toBe(0)
    h.server.shell.write(shell, 'after\r\n')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(v.text()).toBe('')
    await expect(h.call('term_write', { id: info.id, data: 'x' })).rejects.toMatchObject({ kind: 'notFound' })
    expect(await h.call('term_kill', { id: info.id })).toBeNull()
  })

  test('closing never asks first: no terminal is reported busy', async () => {
    const h = await harness()
    const info = (await h.call('term_spawn', { options: options(), onOutput: view().channel })) as any
    expect(await h.call('term_is_busy', { id: info.id })).toBe(false)
  })

  test('the host chooses the shell and says neither which nor what else exists', async () => {
    const h = await harness()
    expect(await h.call('term_default_shell')).toBe('')
    expect(await h.call('term_available_shells')).toEqual([])
  })
})

describe('the shell exits', () => {
  test('terminalExited names the terminal and the code, once, and the terminal is gone', async () => {
    const h = await harness()
    const a = (await h.call('term_spawn', { options: options(), onOutput: view().channel })) as any
    const b = (await h.call('term_spawn', { options: options(), onOutput: view().channel })) as any
    h.server.shell.exit(h.server.shell.sessions[1]!, 3)
    await until(() => h.events.length === 1, 'the exit event')
    expect(h.events).toEqual([{ type: 'terminalExited', terminal: b.id, code: 3 }])
    await expect(h.call('term_write', { id: b.id, data: 'x' })).rejects.toMatchObject({ kind: 'notFound' })
    expect(await h.call('term_write', { id: a.id, data: 'x' })).toBeNull()
  })

  test('a shell that ends without a code reports null', async () => {
    const h = await harness()
    const info = (await h.call('term_spawn', { options: options(), onOutput: view().channel })) as any
    h.server.shell.exit(h.server.shell.sessions[0]!, null)
    await until(() => h.events.length === 1, 'the exit event')
    expect(h.events[0]).toEqual({ type: 'terminalExited', terminal: info.id, code: null })
  })
})
