// SOURCING: @theoremharness/sdk TerminalChannel — the byte log with absolute offsets, the
// resume-after-gap and screen reset, retried-keystroke ids and the exit event are all the SDK's.
// This module gives each channel the numeric id OpenIDEA's `term_*` commands use and feeds the
// output into the `Channel<string>` the terminal view handed in, which is what Tauri's `Channel`
// is for. The shell runs on the workspace host, in the checkout; the page only attaches to it.

import { TerminalChannel } from '@theoremharness/sdk'
import type { TerminalInfo, TerminalOptions } from '@/bindings'
import { failure, unavailable, type HostChannel } from '../host'
import { arg, isChannel, isNumber, isString, type CommandContext, type CommandTable } from './context'

const isOptions = (v: unknown): v is TerminalOptions =>
  typeof v === 'object' && v !== null && isNumber((v as TerminalOptions).cols) && isNumber((v as TerminalOptions).rows)

/** The reset a screen redraw starts with: clear the emulator, then draw. */
const RESET = '\x1bc'

export class Terminals {
  private nextId = 1
  private readonly attached = new Map<number, TerminalChannel>()

  constructor(private readonly context: CommandContext) {}

  async spawn(options: TerminalOptions, output: HostChannel<string>): Promise<TerminalInfo> {
    const { connection } = this.context
    // The host opens its own shell in the checkout root and takes a size and nothing else. A request
    // for anything more is refused instead of being answered with a different shell.
    if (options.shell || options.args.length > 0 || Object.keys(options.env).length > 0) {
      throw unavailable('Choosing a shell, its arguments or its environment', 'the workspace host opens its own shell')
    }
    if (connection.toRelative(options.cwd) !== '') {
      throw unavailable('A terminal in another directory', `the workspace host starts the shell in ${connection.root}`)
    }
    const terminal = await TerminalChannel.open({
      ...(await connection.channelOptions()),
      cols: options.cols,
      rows: options.rows,
    })
    const id = this.nextId++
    // A multi-byte character may be split across two chunks of the log.
    let decoder = new TextDecoder()
    terminal.onData((bytes) => output.send(decoder.decode(bytes, { stream: true })))
    terminal.onReset((screen) => {
      decoder = new TextDecoder()
      output.send(RESET + screen)
    })
    terminal.onExit((code) => {
      this.attached.delete(id)
      this.context.emit({ type: 'terminalExited', terminal: id, code })
    })
    this.attached.set(id, terminal)
    try {
      await terminal.attach()
    } catch (error) {
      this.attached.delete(id)
      await terminal.close().catch(() => undefined)
      throw error
    }
    return { id, title: 'Workspace', pid: null }
  }

  private get(id: number): TerminalChannel {
    const terminal = this.attached.get(id)
    if (!terminal) throw failure('notFound', `terminal ${id} is not attached`)
    return terminal
  }

  async write(id: number, data: string): Promise<null> {
    await this.get(id).input(data)
    return null
  }

  async resize(id: number, cols: number, rows: number): Promise<null> {
    await this.get(id).resize(cols, rows)
    return null
  }

  /** Detach. The host's `terminal.close` ends this page's attachment and leaves the shell running. */
  async detach(id: number): Promise<null> {
    const terminal = this.attached.get(id)
    if (!terminal) return null
    this.attached.delete(id)
    await terminal.close()
    return null
  }
}

export function terminalCommands(terminals: Terminals): CommandTable {
  return {
    term_spawn: (args) => {
      const options = arg(args, 'options', isOptions)
      return terminals.spawn(options, arg(args, 'onOutput', isChannel<string>))
    },
    term_write: (args) => terminals.write(arg(args, 'id', isNumber), arg(args, 'data', isString)),
    term_resize: (args) => terminals.resize(arg(args, 'id', isNumber), arg(args, 'cols', isNumber), arg(args, 'rows', isNumber)),
    // Closing a terminal tab detaches it; the host has no operation that ends a shell, so nothing
    // the user started is lost by closing, and nothing is asked first.
    term_kill: (args) => terminals.detach(arg(args, 'id', isNumber)),
    term_is_busy: async (args) => {
      arg(args, 'id', isNumber)
      return false
    },
    // The host picks the shell; it reports neither which one nor which others it has.
    term_default_shell: async () => '',
    term_available_shells: async () => [],
  }
}
