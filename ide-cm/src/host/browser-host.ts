// SOURCING: none — this is the browser end of the `BrowserHost` interface in host.ts: a command
// table answered over @theoremharness/sdk, one event bus, window behaviours a tab really has,
// external links, and a path picker over the workspace. A command nobody answers is a typed
// `unavailable` failure and is counted, so a missing feature is visible rather than silent.

import {
  failure,
  type BrowserHost,
  type CommandArgs,
  type CommandHandler,
  type ErrorKind,
  type HostFailure,
  type PickOptions,
  type WindowBehaviours,
  unavailable,
} from './host'

/** OpenIDEA's event bus: every `IdeEvent` travels on this named event. */
export const IDE_EVENT = 'ide://event'

export interface BrowserHostOptions {
  description: string
  commands: ReadonlyMap<string, CommandHandler>
  /** Choose one or more workspace paths (the workspace is the only file system a page can reach). */
  pick(options: PickOptions): Promise<string | string[] | null>
  /** Choose a workspace path to write to. */
  save(options: PickOptions): Promise<string | null>
  /** Where the page lives; tests pass a stand-in. */
  page?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'open' | 'close' | 'focus'> & { document: Document }
}

const isFailure = (e: unknown): e is HostFailure =>
  typeof e === 'object' &&
  e !== null &&
  !(e instanceof Error) &&
  typeof (e as HostFailure).kind === 'string' &&
  typeof (e as HostFailure).message === 'string'

const KINDS_BY_STATUS: Record<number, ErrorKind> = {
  400: 'invalidInput',
  401: 'permissionDenied',
  403: 'permissionDenied',
  404: 'notFound',
  409: 'alreadyExists',
  412: 'outOfSync',
  422: 'invalidInput',
  501: 'unavailable',
  503: 'unavailable',
}

/**
 * The workspace host's typed refusals. Every one arrives as HTTP 409 `{code, message, detail}`, so
 * the status alone would call each of them `alreadyExists`; the code says what the frontend should
 * do. A code not listed falls back to the status.
 */
const KINDS_BY_CODE: Record<string, ErrorKind> = {
  stale_revision: 'outOfSync',
  not_found: 'notFound',
  already_exists: 'alreadyExists',
  not_a_directory: 'invalidInput',
  not_a_file: 'invalidInput',
  copy_into_itself: 'invalidInput',
  invalid_range: 'invalidInput',
  invalid_mode: 'invalidInput',
  invalid_contents: 'invalidInput',
  unknown_encoding: 'invalidInput',
  unknown_root: 'invalidInput',
  invalid_pattern: 'invalidInput',
  invalid_glob: 'invalidInput',
  unknown_search: 'notFound',
  io_error: 'io',
  withheld: 'permissionDenied',
  actor_required: 'permissionDenied',
  state_unavailable: 'unavailable',
  mode_unsupported: 'unavailable',
  unsupported_root: 'unavailable',
  // The host's untyped failures (a missing argument): the operation failed, which is not a name
  // already taken.
  ide_operation_failed: 'io',
  host_operation_failed: 'io',
}

/**
 * What a handler threw, as the `IdeError` the frontend shows. SDK errors carry `statusCode` and a
 * coded body; the body's own `message` (the host's sentence, such as the regex engine's reason) is
 * shown in preference to the SDK's status line. The code travels in its own field and names the
 * failure's kind; the message is the sentence alone.
 */
export function toFailure(error: unknown): HostFailure {
  if (isFailure(error)) return error
  const status = (error as { statusCode?: number } | null)?.statusCode
  const body = (error as { body?: { code?: unknown; message?: unknown } } | null)?.body
  const code = typeof body?.code === 'string' ? body.code : undefined
  const message = typeof body?.message === 'string' ? body.message : error instanceof Error ? error.message : String(error)
  const coded = code !== undefined && Object.hasOwn(KINDS_BY_CODE, code) ? KINDS_BY_CODE[code] : undefined
  if (coded) return failure(coded, message)
  if (status !== undefined) return failure(KINDS_BY_STATUS[status] ?? 'io', message)
  if (error instanceof RangeError || error instanceof TypeError) return failure('invalidInput', message)
  return failure('internal', message)
}

export class BrowserHostImpl implements BrowserHost {
  readonly description: string
  readonly window: WindowBehaviours
  readonly refused = new Map<string, number>()

  private readonly named = new Map<string, Set<(payload: unknown) => void>>()
  private readonly closeHandlers = new Set<(event: { preventDefault(): void }) => void | Promise<void>>()

  constructor(private readonly options: BrowserHostOptions) {
    this.description = options.description
    const page = options.page ?? (globalThis as unknown as NonNullable<BrowserHostOptions['page']>)
    const doc = page.document
    this.window = {
      label: 'main',
      setTitle: (title) => {
        doc.title = title
      },
      // Tauri's close() raises CloseRequested first; any handler may veto. A tab not opened by a
      // script cannot close itself, so after the handlers agree the page asks the browser to.
      close: async () => {
        let prevented = false
        const event = {
          preventDefault: () => {
            prevented = true
          },
        }
        for (const handler of [...this.closeHandlers]) await handler(event)
        if (!prevented) page.close()
      },
      isFocused: () => doc.hasFocus(),
      onCloseRequested: (handler) => {
        this.closeHandlers.add(handler)
        return () => this.closeHandlers.delete(handler)
      },
      onResized: (handler) => {
        page.addEventListener('resize', handler)
        return () => page.removeEventListener('resize', handler)
      },
      // CSS zoom on the root keeps the user's browser zoom untouched.
      setZoom: (factor) => {
        doc.documentElement.style.setProperty('zoom', String(factor))
      },
    }
  }

  async invoke(command: string, args: CommandArgs = {}): Promise<unknown> {
    const handler = this.options.commands.get(command)
    if (!handler) {
      this.refused.set(command, (this.refused.get(command) ?? 0) + 1)
      throw unavailable(`The command "${command}"`)
    }
    try {
      return await handler(args)
    } catch (error) {
      throw toFailure(error)
    }
  }

  subscribe(handler: (payload: unknown) => void): () => void {
    return this.listen(IDE_EVENT, handler)
  }

  emit(payload: unknown): void {
    this.emitTo(IDE_EVENT, payload)
  }

  listen(event: string, handler: (payload: unknown) => void): () => void {
    let handlers = this.named.get(event)
    if (!handlers) this.named.set(event, (handlers = new Set()))
    handlers.add(handler)
    return () => handlers.delete(handler)
  }

  emitTo(event: string, payload: unknown): void {
    for (const handler of [...(this.named.get(event) ?? [])]) handler(payload)
  }

  openExternal(url: string): void {
    // Only web and mail links leave the page; `noopener` keeps the new tab from reaching this one.
    if (!/^(https?:|mailto:)/i.test(url)) throw unavailable('Opening a non-web address', `"${url}" is not a web or mail link`)
    const page = this.options.page ?? (globalThis as unknown as NonNullable<BrowserHostOptions['page']>)
    page.open(url, '_blank', 'noopener,noreferrer')
  }

  pick(options: PickOptions): Promise<string | string[] | null> {
    return this.options.pick(options)
  }

  save(options: PickOptions): Promise<string | null> {
    return this.options.save(options)
  }
}
