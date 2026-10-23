// SOURCING: React's useSyncExternalStore (a state collection as a hook) over
// the bridge in protocol.ts. Running one compiled cell, the body notebook-kit
// produced, with the builtins it names is this app's sandbox runtime (plan D9).
import { createElement, useSyncExternalStore } from 'react'
import { call } from './protocol'
import type { FileFormat, PageMethods, Rpc, RunOutcome, Trace } from './protocol'
import { blockValue, toClonable } from './values'

/** A compiled cell module, as compile.ts writes it. */
export interface CellModule {
  default: (...args: Array<unknown>) => unknown
  inputs: Array<string>
  outputs: Array<string>
  autodisplay: boolean
}

/** Where a cell's displayed values go. */
export interface Display {
  show: (value: unknown) => void
  clear: () => void
}

type Listener = () => void

/** A named shared-state collection: a map of keys to values, kept by the page. */
export class Collection {
  private value: Record<string, unknown>
  private readonly listeners = new Set<Listener>()

  constructor(
    readonly name: string,
    private readonly rpc: Rpc,
    initial: Record<string, unknown>,
  ) {
    this.value = initial
  }

  get = (key: string): unknown => this.value[key]
  has = (key: string): boolean => key in this.value
  keys = (): Array<string> => Object.keys(this.value)
  entries = (): Array<[string, unknown]> => Object.entries(this.value)
  /** The whole collection. It is a new object after every change. */
  snapshot = (): Record<string, unknown> => this.value
  toJSON = () => this.value

  set = async (key: string, value: unknown): Promise<void> => {
    this.replace({ ...this.value, [key]: value })
    await call<PageMethods, 'state.set'>(this.rpc, 'state.set', {
      name: this.name,
      key,
      value,
    })
  }

  delete = async (key: string): Promise<void> => {
    const { [key]: _removed, ...rest } = this.value
    this.replace(rest)
    await call<PageMethods, 'state.delete'>(this.rpc, 'state.delete', {
      name: this.name,
      key,
    })
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The collection as a React hook: re-renders on every change. */
  use = (): Record<string, unknown> =>
    // A hook by contract: call it from a component, as any hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSyncExternalStore(this.subscribe, this.snapshot, this.snapshot)

  /** The page's copy changed. */
  replace(value: Record<string, unknown>): void {
    this.value = value
    for (const listener of this.listeners) listener()
  }
}

/** The state of a sandbox document: its collections, kept across runs. */
export class CellContext {
  readonly collections = new Map<string, Promise<Collection>>()
  private disposeRun: (() => void) | null = null
  private runId = 0

  constructor(
    readonly rpc: Rpc,
    readonly display: Display,
  ) {}

  state = (name: string): Promise<Collection> => {
    let collection = this.collections.get(name)
    if (!collection) {
      collection = call<PageMethods, 'state.open'>(this.rpc, 'state.open', {
        name,
      }).then((initial) => new Collection(name, this.rpc, initial))
      this.collections.set(name, collection)
    }
    return collection
  }

  /** The page's copy of a collection changed. */
  async changed(name: string, value: Record<string, unknown>): Promise<void> {
    const collection = await this.collections.get(name)
    collection?.replace(value)
  }

  /** The `files` builtin: reads and writes the page checks against the declarations. */
  files() {
    const read = (path: string, as: FileFormat) =>
      call<PageMethods, 'files.read'>(this.rpc, 'files.read', { path, as })
    return {
      text: (path: string) => read(path, 'text') as Promise<string>,
      json: (path: string) => read(path, 'json'),
      csv: (path: string) =>
        read(path, 'csv') as Promise<Array<Record<string, unknown>>>,
      bytes: (path: string) => read(path, 'bytes') as Promise<Uint8Array>,
      list: (glob: string) =>
        call<PageMethods, 'files.list'>(this.rpc, 'files.list', { glob }),
      write: (path: string, text: string) =>
        call<PageMethods, 'files.write'>(this.rpc, 'files.write', {
          path,
          text,
        }),
    }
  }

  /** Runs the cell once with the other blocks' values it reads. */
  async run(
    module: CellModule,
    inputs: Record<string, unknown>,
  ): Promise<RunOutcome> {
    const started = performance.now()
    const traces: Array<Trace> = []
    this.disposeRun?.()
    const runId = ++this.runId
    const invalidation = new Promise<void>((resolve) => {
      this.disposeRun = resolve
    })
    this.display.clear()
    let displayed = 0
    const display = (value: unknown) => {
      if (runId !== this.runId) return value
      displayed++
      this.display.show(value)
      return value
    }
    const builtins: Record<string, unknown> = {
      display,
      files: this.files(),
      state: this.state,
      run: (target: string) =>
        call<PageMethods, 'run.request'>(this.rpc, 'run.request', { target }),
      invalidation,
      __trace: (
        line: number,
        variables: Record<string, unknown> | null,
        ...value: Array<unknown>
      ) => {
        traces.push({
          line,
          variables:
            variables &&
            (toClonable(variables) as Record<string, unknown> | null),
          ...(value.length ? { value: toClonable(value[0]) } : {}),
        })
        return value[0]
      },
      __render: (component: unknown) =>
        display(
          typeof component === 'function'
            ? createElement(component as () => null)
            : component,
        ),
    }
    // A free name is a builtin, another block's value, or one of this
    // document's globals (notebook-kit leaves some, such as structuredClone).
    const resolve = (name: string): unknown => {
      if (name in builtins) return builtins[name]
      if (name in inputs) return inputs[name]
      if (name in globalThis) return (globalThis as Record<string, unknown>)[name]
      throw new ReferenceError(`${name} is not defined`)
    }
    try {
      const result = await module.default(...module.inputs.map(resolve))
      if (module.autodisplay && result !== undefined) display(result)
      return {
        status: 'ok',
        value: module.autodisplay ? toClonable(result) : blockValue(result),
        traces,
        displayed,
        durationMs: performance.now() - started,
      }
    } catch (error) {
      const { message, name } =
        error instanceof Error ? error : new Error(String(error))
      return {
        status: 'error',
        error: { message, name },
        traces,
        displayed,
        durationMs: performance.now() - started,
      }
    }
  }
}
