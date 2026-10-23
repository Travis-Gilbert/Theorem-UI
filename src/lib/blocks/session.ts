// SOURCING: the modules beside it: format.ts finds a document's live blocks,
// runtime.ts (@observablehq/runtime) keeps them as a graph, compile.ts and
// executor.ts run code blocks in their sandbox, query.ts and embark.ts (QuickJS)
// evaluate queries and mentions, runs.ts takes agent runs. date-fns gives
// today's date. A session follows one file through the workspace's events;
// tying those together is this app's own (plan D9).
import { format } from 'date-fns'
import type { WorkspaceClient, WorkspaceEvent } from '@/lib/workspace/types'
import { agentInputs, agentReads, parseAgent } from './agent'
import type { AgentSpec } from './agent'
import type { BridgeHost, StateCollections } from './bridge'
import { isEffectful, noCapabilities } from './declarations'
import type { Capabilities } from './declarations'
import { parseEmbark } from './embark'
import type { EmbarkDocument } from './embark'
import type { CompiledCell } from './compile'
import type { Compiler } from './compiler'
import type { CellExecutor } from './executor'
import { liveBlocksIn } from './format'
import type { FenceInfo, LiveKind } from './format'
import type { FormulaEngine } from './formulas/engine'
import { announceLastRun, lastRunOf } from './last-run'
import type { LastRun } from './last-run'
import { parseQuery, queryInputs, queryReads, runQuery, sourceOf } from './query'
import type { QuerySpec } from './query'
import { requestAgentRun } from './runs'
import { BlockGraph } from './runtime'
import type { CellDefinition, CellHandle } from './runtime'
import type { RunRequestResult } from './sandbox/protocol'

/** One live block of a document, or a whole tool file. */
export interface SessionBlock {
  /** Its `#id`, or a stable name for an unnamed block (`block:2`). */
  key: string
  /** The name other blocks read it by, or null. */
  name: string | null
  /** Null for `.live` on a language nothing runs. */
  kind: LiveKind | null
  /** The code, or the YAML body. */
  source: string
  /** 1-based line of its opening fence; 1 for a tool file. */
  line: number
  info: FenceInfo | null
  /** Set when another block already took this block's `#id`. */
  duplicate: boolean
}

/** What a code block's view needs to show and run it. */
export interface CodeBlockState {
  compiled: CompiledCell | null
  compileError: string | null
}

export interface BlockSessionOptions {
  client: WorkspaceClient
  /** The document, or the tool file. */
  path: string
  kind: 'document' | 'tool'
  compile: Compiler
  engine: FormulaEngine
  state: StateCollections
  /**
   * Runs a compiled block without a frame (tests). Without it a code block
   * waits for its view to attach the frame that runs it.
   */
  executor?: (
    cell: CompiledCell,
    host: BridgeHost,
  ) => CellExecutor | Promise<CellExecutor>
  /** Keeps a run's values; the desktop routes by default. */
  saveLastRun?: (run: LastRun) => Promise<void>
  today?: () => string
}

/**
 * Names the blocks in document order: a block is its `#id`; an unnamed one
 * is `block:<n>`, counting unnamed blocks, so typing in one never renames
 * another. The node views name blocks with this same function.
 */
export function blockKeys(
  infos: Array<FenceInfo | null>,
): Array<{ key: string; duplicate: boolean }> {
  const taken = new Set<string>()
  let unnamed = 0
  return infos.map((info, index) => {
    const id = info?.id
    if (id && !taken.has(id)) {
      taken.add(id)
      return { key: id, duplicate: false }
    }
    if (id) return { key: `duplicate:${index}`, duplicate: true }
    return { key: `block:${unnamed++}`, duplicate: false }
  })
}

type Listener = () => void

const today = () => format(new Date(), 'yyyy-MM-dd')

/**
 * The live blocks of one file, kept current as the file and the files its
 * blocks read change. Nothing evaluates while the folder is untrusted.
 */
export class BlockSession {
  readonly graph = new BlockGraph()
  private blocks: Array<SessionBlock> = []
  private signatures = new Map<string, string>()
  private code = new Map<string, CodeBlockState>()
  private executors = new Map<
    string,
    { cellKey: string; executor: Promise<CellExecutor> }
  >()
  private parked = new Map<
    string,
    Array<{
      cellKey: string | null
      resolve: (executor: CellExecutor) => void
      reject: (error: Error) => void
    }>
  >()
  /** Who asked an agent block to run, while it runs. */
  private readonly requestedBy = new Map<string, string>()
  private embark: EmbarkDocument | null = null
  private markdown = ''
  private readonly listeners = new Set<Listener>()
  private readonly stop: () => void
  private version = 0
  private loading: Promise<void> | null = null
  path: string

  constructor(private readonly options: BlockSessionOptions) {
    this.path = options.path
    this.stop = options.client.subscribe(this.onEvent)
  }

  get client(): WorkspaceClient {
    return this.options.client
  }

  get trusted(): boolean {
    return this.options.client.workspace.trusted
  }

  /** Reads the file and defines its blocks. */
  load(): Promise<void> {
    this.loading = this.options.client
      .readText(this.path)
      .then(({ text }) => this.update(text))
    return this.loading
  }

  /** Settles once the current file has been read. */
  ready(): Promise<void> {
    return this.loading ?? this.load()
  }

  private onEvent = (event: WorkspaceEvent) => {
    switch (event.type) {
      case 'created':
      case 'changed':
        if (event.entry.path === this.path) void this.load()
        else this.graph.fileChanged(event.entry.path)
        return
      case 'deleted':
        this.graph.fileChanged(event.path)
        return
      case 'renamed':
        if (event.from === this.path) this.path = event.to
        this.graph.fileChanged(event.from)
        this.graph.fileChanged(event.to)
        return
      case 'resync':
        void this.load()
        this.graph.everyFileChanged()
        return
      case 'indexed':
        return
    }
  }

  /** The blocks, in document order. */
  list(): Array<SessionBlock> {
    return this.blocks
  }

  block(key: string): SessionBlock | undefined {
    return this.blocks.find((block) => block.key === key)
  }

  /** The block's place in the graph, or undefined while untrusted. */
  cell(key: string): CellHandle | undefined {
    return this.graph.has(key) ? this.graph.cell(key) : undefined
  }

  codeState(key: string): CodeBlockState {
    return this.code.get(key) ?? { compiled: null, compileError: null }
  }

  /** Changes whenever the blocks or their compiled code change. */
  getVersion = (): number => this.version

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private changed() {
    this.version++
    for (const listener of this.listeners) listener()
  }

  /** Re-reads the blocks from the file's text and (re)defines what changed. */
  update(text: string): void {
    this.markdown = text
    this.embark = null
    if (this.options.kind === 'tool') {
      this.blocks = [
        {
          key: 'tool',
          name: null,
          kind: 'code',
          source: text,
          line: 1,
          info: null,
          duplicate: false,
        },
      ]
    } else {
      const found = liveBlocksIn(text)
      const keys = blockKeys(found.map((block) => block.info))
      this.blocks = found.map((block, i) => ({
        key: keys[i]!.key,
        name: keys[i]!.duplicate ? null : block.info.id,
        kind: block.info.kind,
        source: block.code,
        line: block.position?.start.line ?? 1,
        info: block.info,
        duplicate: keys[i]!.duplicate,
      }))
    }
    this.define()
    this.changed()
  }

  /** Trust changed: define every block, or take them all down. */
  refreshTrust(): void {
    this.define()
    this.changed()
  }

  private embarkDocument(): EmbarkDocument {
    this.embark ??= parseEmbark(this.markdown)
    return this.embark
  }

  private define(): void {
    const keep = new Set<string>()
    if (this.trusted)
      for (const block of this.blocks) {
        if (block.kind === null) continue
        keep.add(block.key)
        const signature = this.signature(block)
        if (this.signatures.get(block.key) === signature) continue
        this.signatures.set(block.key, signature)
        this.defineBlock(block)
      }
    for (const key of this.graph.keys())
      if (!keep.has(key)) {
        this.release(key)
        this.graph.cell(key).delete()
        this.signatures.delete(key)
        this.code.delete(key)
        this.dropExecutor(key)
      }
  }

  /** What a block's definition depends on: when it is unchanged, nothing recomputes. */
  private signature(block: SessionBlock): string {
    const base = `${block.kind}\n${block.name}\n${block.duplicate}\n${block.source}`
    if (block.kind !== 'query') return base
    // A query over mentions also depends on the mentions in its section.
    try {
      const source = sourceOf(parseQuery(block.source))
      if (source.kind !== 'mentions') return base
      const document = this.embarkDocument()
      return `${base}\n${block.line}\n${JSON.stringify(document.records)}`
    } catch {
      return base
    }
  }

  /** (Re)defines a block, ending any wait its last definition left. */
  private put(block: SessionBlock, definition: CellDefinition): void {
    this.release(block.key)
    this.graph.cell(block.key).define(definition)
  }

  /**
   * An evaluation waiting for something a later definition replaces: the
   * block's compile (`cellKey` null) or a frame running `cellKey`. The runtime
   * lets a variable's last evaluation settle before it starts the next, so a
   * wait nothing ended would hold the block for good.
   */
  private park(key: string, cellKey: string | null): Promise<CellExecutor> {
    return new Promise((resolve, reject) => {
      const parked = this.parked.get(key) ?? []
      parked.push({ cellKey, resolve, reject })
      this.parked.set(key, parked)
    })
  }

  private release(key: string): void {
    for (const wait of this.parked.get(key) ?? [])
      wait.reject(new Error('The block changed before it ran'))
    this.parked.delete(key)
  }

  private fail(block: SessionBlock, message: string): void {
    this.put(block, {
      name: block.name,
      inputs: [],
      reads: [],
      effectful: false,
      evaluate: () => Promise.reject(new Error(message)),
    })
  }

  private defineBlock(block: SessionBlock): void {
    if (block.duplicate)
      return this.fail(
        block,
        `Another block is already named #${block.info?.id}; rename one of them`,
      )
    if (block.kind === 'code') return this.defineCode(block)
    if (block.kind === 'query') return this.defineQuery(block)
    return this.defineAgent(block)
  }

  private defineCode(block: SessionBlock): void {
    this.code.set(block.key, { compiled: null, compileError: null })
    // Until it compiles, what reads it waits.
    this.put(block, {
      name: block.name,
      inputs: [],
      reads: [],
      effectful: false,
      evaluate: () => this.park(block.key, null),
    })
    const source = block.source
    this.options
      .compile(source)
      .then((compiled) => {
        if (this.block(block.key)?.source !== source) return
        this.code.set(block.key, { compiled, compileError: null })
        if (compiled.declarationErrors.length) {
          this.fail(block, compiled.declarationErrors.join('; '))
          return
        }
        this.put(block, {
          name: block.name,
          inputs: compiled.inputs,
          reads: compiled.capabilities.read,
          effectful: isEffectful(compiled.capabilities),
          evaluate: (inputs) => this.runCode(block.key, compiled, inputs),
        })
      })
      .catch((error: unknown) => {
        if (this.block(block.key)?.source !== source) return
        const message = (error as Error).message
        this.code.set(block.key, { compiled: null, compileError: message })
        this.fail(block, message)
      })
      .finally(() => this.changed())
  }

  /** What the page lends a block: its declared capabilities, and nothing else. */
  hostFor(key: string, capabilities: Capabilities = noCapabilities()): BridgeHost {
    return {
      client: this.options.client,
      capabilities,
      state: this.options.state,
      run: (target) => this.runAgent(target, key),
    }
  }

  /** A view's frame for the block: evaluations of this compiled code go to it. */
  attach(key: string, cellKey: string, executor: CellExecutor): () => void {
    const entry = { cellKey, executor: Promise.resolve(executor) }
    this.executors.set(key, entry)
    const parked = this.parked.get(key) ?? []
    this.parked.set(
      key,
      parked.filter((wait) => {
        if (wait.cellKey !== cellKey) return true
        wait.resolve(executor)
        return false
      }),
    )
    return () => {
      if (this.executors.get(key) === entry) this.executors.delete(key)
    }
  }

  private dropExecutor(key: string) {
    const entry = this.executors.get(key)
    this.executors.delete(key)
    if (entry && this.options.executor)
      void entry.executor.then((executor) => executor.dispose())
  }

  private executorFor(key: string, compiled: CompiledCell): Promise<CellExecutor> {
    const current = this.executors.get(key)
    if (current?.cellKey === compiled.key) return current.executor
    if (this.options.executor) {
      this.dropExecutor(key)
      const executor = Promise.resolve(
        this.options.executor(compiled, this.hostFor(key, compiled.capabilities)),
      )
      this.executors.set(key, { cellKey: compiled.key, executor })
      return executor
    }
    return this.park(key, compiled.key)
  }

  private async runCode(
    key: string,
    compiled: CompiledCell,
    inputs: Record<string, unknown>,
  ): Promise<unknown> {
    const executor = await this.executorFor(key, compiled)
    const outcome = await executor.run(inputs)
    const run = lastRunOf(compiled.sourceHash, outcome)
    announceLastRun(run)
    const save =
      this.options.saveLastRun ??
      ((value: LastRun) =>
        import('./last-run').then(({ saveLastRun }) =>
          saveLastRun(this.options.client.workspace.id, value),
        ))
    save(run).catch((error: unknown) => {
      console.error('[blocks] saving last-run values failed', error)
    })
    if (outcome.status === 'error')
      throw new Error(outcome.error?.message ?? 'The block failed')
    return outcome.value
  }

  private defineQuery(block: SessionBlock): void {
    let spec: QuerySpec
    try {
      spec = parseQuery(block.source)
    } catch (error) {
      return this.fail(block, (error as Error).message)
    }
    const inputs = queryInputs(spec)
    this.put(block, {
      name: block.name,
      inputs,
      reads: queryReads(spec),
      effectful: false,
      evaluate: (values) =>
        runQuery(spec, {
          client: this.options.client,
          engine: this.options.engine,
          documentPath: this.path,
          line: block.line,
          embark: () => this.embarkDocument(),
          inputs: values,
          today: (this.options.today ?? today)(),
        }),
    })
  }

  private defineAgent(block: SessionBlock): void {
    let spec: AgentSpec
    try {
      spec = parseAgent(block.source)
    } catch (error) {
      return this.fail(block, (error as Error).message)
    }
    if (!block.name)
      return this.fail(block, 'An agent block needs a name: add #id to its fence')
    const name = block.name
    this.put(block, {
      name,
      inputs: agentInputs(spec),
      reads: agentReads(spec),
      // An agent runs only when someone, or a block's run(), asks it to.
      effectful: true,
      evaluate: (values) =>
        requestAgentRun({
          target: `agent:#${name}`,
          documentPath: this.path,
          requestedBy: this.requestedBy.get(block.key) ?? 'Run button',
          requestedAt: new Date().toISOString(),
          agent: {
            prompt: spec.prompt,
            inputs: values,
            trigger: spec.trigger,
            output: spec.output ?? null,
          },
        }),
    })
  }

  /** A block's code called `run("agent:#id")`: runs that agent block of this document. */
  private async runAgent(target: string, from: string): Promise<RunRequestResult> {
    const name = target.replace(/^agent:#/, '')
    const block = this.blocks.find((b) => b.kind === 'agent' && b.name === name)
    if (!block) throw new Error(`No agent block #${name} in ${this.path}`)
    this.requestedBy.set(block.key, `#${this.block(from)?.name ?? from}`)
    const cell = this.cell(block.key)
    if (!cell) throw new Error('This folder is not trusted')
    const result = new Promise<RunRequestResult>((resolve, reject) => {
      let started = false
      const stop = cell.subscribe((state) => {
        if (state.status === 'pending') started = true
        else if (started && state.status === 'ok') {
          stop()
          resolve(state.value as RunRequestResult)
        } else if (started && state.status === 'error') {
          stop()
          reject(new Error(state.error))
        }
      })
    })
    cell.run()
    try {
      return await result
    } finally {
      this.requestedBy.delete(block.key)
    }
  }

  dispose(): void {
    this.stop()
    for (const key of [...this.executors.keys()]) this.dropExecutor(key)
    for (const key of [...this.parked.keys()]) this.release(key)
    this.graph.dispose()
    this.listeners.clear()
  }
}
