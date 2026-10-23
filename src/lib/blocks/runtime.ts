// SOURCING: @observablehq/runtime (the dependency graph: a variable recomputes
// when, and only when, something it reads changes; Observable Framework and
// Notebook Kit run on it), picomatch (which file changes reach which blocks).
// Holding effectful blocks back until Run is pressed is this app's rule (plan
// D9), layered on top as a trigger variable.
import { Runtime, RuntimeError } from '@observablehq/runtime'
import type { Variable } from '@observablehq/runtime'
import picomatch from 'picomatch'

/** How far a block has got. */
export type CellStatus =
  /** Computing, or waiting for what it reads. */
  | 'pending'
  | 'ok'
  | 'error'
  /** Waiting for Run: an effectful block that has not run, or a block reading one. */
  | 'idle'
  /** An effectful block whose source or inputs changed since it last ran. */
  | 'stale'

export interface CellState {
  status: CellStatus
  value?: unknown
  error?: string
  /** How many times the block has been evaluated. */
  runs: number
}

/** A block as the graph sees it: its name, what it reads, how to evaluate it. */
export interface CellDefinition {
  /** The name other blocks read it by (its `#id`), or null. */
  name: string | null
  /** Other blocks it reads, by name. */
  inputs: Array<string>
  /** Workspace paths or globs whose changes recompute it. */
  reads: Array<string>
  /** Runs only when triggered: it writes files, reaches the network or starts agents. */
  effectful: boolean
  evaluate: (inputs: Record<string, unknown>) => Promise<unknown>
}

type Listener = (state: CellState) => void

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const NOT_RUN = ' has not run yet'

/**
 * What an effectful block that never ran gives what reads it. The runtime
 * passes the message on (as a RuntimeError), so readers wait rather than fail.
 */
const notRun = (name: string | null) =>
  new Error(`#${name ?? 'block'}${NOT_RUN}`)

const isNotRun = (error: unknown) => message(error).endsWith(NOT_RUN)

/** One block in the graph. */
export class CellHandle {
  private state: CellState = { status: 'pending', runs: 0 }
  private readonly listeners = new Set<Listener>()
  private readonly variable: Variable
  private readonly trigger: Variable
  private triggered = 0
  private lastTriggered = 0
  /** An effectful block's inputs, gathered apart so its dependents wait for Run. */
  private inputs: Variable | null = null
  private effectful = false
  private lastRun:
    { ok: true; value: unknown } | { ok: false; error: unknown } | null = null

  constructor(
    private readonly graph: BlockGraph,
    readonly key: string,
  ) {
    this.variable = graph.module.variable({
      pending: () => {
        if (!this.held()) this.set({ status: 'pending' })
      },
      fulfilled: (value) => {
        if (!this.held()) this.set({ status: 'ok', value, error: undefined })
      },
      rejected: (error) => {
        if (this.held()) return
        this.set({
          status: isNotRun(error) ? 'idle' : 'error',
          error: message(error),
        })
      },
    })
    this.trigger = graph.module.define(this.triggerName, [], () => 0)
  }

  private get triggerName() {
    return `run:${this.key}`
  }

  private get inputsName() {
    return `inputs:${this.key}`
  }

  /** An effectful block waiting for Run: the value shown is the last run's. */
  private held() {
    return (
      this.effectful &&
      (this.state.status === 'idle' || this.state.status === 'stale')
    )
  }

  getState = (): CellState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(state: Partial<CellState>): void {
    this.state = { ...this.state, ...state }
    for (const listener of this.listeners) listener(this.state)
  }

  /** (Re)defines the block. */
  define(definition: CellDefinition): void {
    const names = definition.inputs
    const dependencies = [
      ...names,
      ...definition.reads.map((glob) => this.graph.globVariable(glob)),
    ]
    const gather = (values: Array<unknown>) =>
      Object.fromEntries(names.map((name, i) => [name, values[i]]))
    const evaluate = (inputs: Record<string, unknown>) => {
      this.set({ status: 'pending', runs: this.state.runs + 1 })
      return definition.evaluate(inputs)
    }

    if (!definition.effectful) {
      this.effectful = false
      this.inputs?.delete()
      this.inputs = null
      this.variable.define(
        definition.name,
        [...dependencies, this.triggerName],
        (...values: Array<unknown>) => evaluate(gather(values)),
      )
      return
    }

    // The inputs recompute as usual and mark a block that has run as stale;
    // the block itself reads only its trigger, so nothing downstream moves
    // until someone presses Run.
    this.effectful = true
    this.inputs ??= this.graph.module.variable(true)
    this.inputs.define(this.inputsName, dependencies, (...values) => {
      if (this.state.runs > 0 && this.state.status !== 'pending')
        this.set({ status: 'stale' })
      return gather(values)
    })
    if (!this.state.runs) this.set({ status: 'idle' })
    else if (this.state.status !== 'pending') this.set({ status: 'stale' })
    this.variable.define(
      definition.name,
      [this.triggerName],
      async (triggered: number) => {
        // Not run since it was last defined: what reads it sees the last
        // run again, or waits for a block that never ran.
        if (triggered === this.lastTriggered) {
          if (!this.lastRun) throw notRun(definition.name)
          if (this.lastRun.ok) return this.lastRun.value
          throw this.lastRun.error
        }
        this.lastTriggered = triggered
        try {
          const inputs = (await this.graph.module.value(
            this.inputsName,
          )) as Record<string, unknown>
          const value = await evaluate(inputs)
          this.lastRun = { ok: true, value }
          return value
        } catch (error) {
          this.lastRun = { ok: false, error }
          throw error
        }
      },
    )
  }

  /** Runs the block now: an effectful block's only way to run, a pure one's way to run again. */
  run(): void {
    const triggered = ++this.triggered
    if (this.held()) this.set({ status: 'pending' })
    this.trigger.define(this.triggerName, [], () => triggered)
  }

  delete(): void {
    this.variable.delete()
    this.trigger.delete()
    this.inputs?.delete()
    this.listeners.clear()
    this.graph.forget(this.key)
  }
}

/**
 * The blocks of one document (or one tool file) as an Observable Runtime
 * module. Blocks read one another by name; a file change recomputes exactly
 * the blocks that declared reading it, and what reads those.
 */
export class BlockGraph {
  // Names that are not blocks are errors, never the page's globals.
  private readonly runtime = new Runtime(undefined, (name: string) => {
    throw new RuntimeError(`#${name} is not defined`)
  })
  readonly module = this.runtime.module()
  private readonly globs = new Map<
    string,
    { variable: Variable; version: number; matches: (path: string) => boolean }
  >()
  private readonly cells = new Map<string, CellHandle>()

  /** The block under `key`, created on first use. */
  cell(key: string): CellHandle {
    let cell = this.cells.get(key)
    if (!cell) {
      cell = new CellHandle(this, key)
      this.cells.set(key, cell)
    }
    return cell
  }

  has(key: string): boolean {
    return this.cells.has(key)
  }

  keys(): Array<string> {
    return [...this.cells.keys()]
  }

  /** The variable that changes whenever a file matching `glob` changes. */
  globVariable(glob: string): string {
    const name = `files:${glob}`
    if (!this.globs.has(glob))
      this.globs.set(glob, {
        version: 0,
        variable: this.module.define(name, [], () => 0),
        matches: picomatch(glob, { dot: false }),
      })
    return name
  }

  /** A workspace file changed: recompute what declared reading it. */
  fileChanged(path: string): void {
    for (const [glob, entry] of this.globs)
      if (entry.matches(path)) {
        const version = ++entry.version
        entry.variable.define(`files:${glob}`, [], () => version)
      }
  }

  forget(key: string): void {
    this.cells.delete(key)
  }

  dispose(): void {
    this.runtime.dispose()
    this.cells.clear()
    this.globs.clear()
  }
}
