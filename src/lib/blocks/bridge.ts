// SOURCING: zod (every parameter a sandbox sends is parsed before use),
// picomatch (a path is allowed when one of the declared globs matches it),
// d3-dsv (CSV rows, with autoType for numbers and dates). The checks are this
// app's capability model (plan D9): a block reaches exactly what it declared.
import { autoType, csvParse } from 'd3-dsv'
import picomatch from 'picomatch'
import { z } from 'zod'
import type { WorkspaceClient } from '@/lib/workspace/types'
import type { Capabilities } from './declarations'
import { MAX_SNAPSHOT, call, serve } from './sandbox/protocol'
import type {
  FileFormat,
  ListedFile,
  PageMethods,
  Rpc,
  RunRequestResult,
  SandboxMethods,
} from './sandbox/protocol'

/** Shared state collections, as the page keeps them for a workspace. */
export interface StateCollections {
  snapshot: (name: string) => Record<string, unknown>
  set: (name: string, key: string, value: unknown) => void
  delete: (name: string, key: string) => void
  subscribe: (
    name: string,
    listener: (value: Record<string, unknown>) => void,
  ) => () => void
}

/** What the page lends one sandboxed block. */
export interface BridgeHost {
  client: WorkspaceClient
  capabilities: Capabilities
  state: StateCollections
  /** Starts an agent block; the bridge has already checked the declaration. */
  run: (target: string) => Promise<RunRequestResult>
  onResize?: (height: number) => void
  /** A static copy of the frame, unsanitized: snapshots.ts cleans it before showing it. */
  onSnapshot?: (html: string) => void
}

/** A call a block made that its declarations do not allow. */
export class BridgeDenied extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BridgeDenied'
  }
}

/**
 * A workspace path a block may name: relative, forward slashes, no `.` or
 * `..` segments, nothing hidden (the folder's `.theorem` and dotfiles).
 */
export function checkPath(path: string): string {
  const segments = path.split('/')
  if (
    !path ||
    path.includes('\\') ||
    path.includes('\0') ||
    segments.some((segment) => !segment || segment.startsWith('.'))
  )
    throw new BridgeDenied(`"${path}" is not a path inside the folder`)
  return path
}

const name = z.string().min(1).max(200)
const params = {
  read: z.object({
    path: z.string(),
    as: z.enum(['text', 'json', 'csv', 'bytes']),
  }),
  list: z.object({ glob: z.string().min(1) }),
  write: z.object({ path: z.string(), text: z.string() }),
  open: z.object({ name }),
  set: z.object({ name, key: z.string().min(1), value: z.json() }),
  remove: z.object({ name, key: z.string().min(1) }),
  run: z.object({ target: z.string() }),
  resize: z.object({ height: z.number().finite().nonnegative() }),
  snapshot: z.object({ html: z.string().max(MAX_SNAPSHOT) }),
}

/** The tallest a block frame may ask to be, in CSS pixels. */
const MAX_HEIGHT = 20_000

function matcher(globs: Array<string>): (path: string) => boolean {
  if (!globs.length) return () => false
  const test = picomatch(globs, { dot: false })
  return (path) => test(path)
}

/** A file's bytes as a block asked for them: text, JSON, CSV rows or bytes. */
export function decodeFile(bytes: Uint8Array, as: FileFormat): unknown {
  if (as === 'bytes') return bytes
  const text = new TextDecoder().decode(bytes)
  if (as === 'text') return text
  if (as === 'json') return JSON.parse(text) as unknown
  // A plain array: d3-dsv's `columns` property does not survive cloning.
  return [...csvParse(text, autoType)]
}

/**
 * Serves the page side of one block's bridge. Every call is parsed and
 * checked against the block's declarations before it touches the folder.
 * Returns a function that stops the state subscriptions it opened.
 */
export function serveBridge(rpc: Rpc, host: BridgeHost): () => void {
  const { capabilities } = host
  const mayRead = matcher(capabilities.read)
  const mayWrite = matcher(capabilities.write)
  const subscriptions = new Map<string, () => void>()

  const collection = (value: string) => {
    if (!capabilities.state.includes(value))
      throw new BridgeDenied(
        `state("${value}") was not declared; add // uses: state("${value}")`,
      )
    return value
  }

  serve<PageMethods, 'files.read'>(rpc, 'files.read', async (raw) => {
    const { path, as } = params.read.parse(raw)
    if (!mayRead(checkPath(path)))
      throw new BridgeDenied(
        `files.read("${path}") was not declared; add // uses: files.read("${path}")`,
      )
    const { bytes } = await host.client.read(path)
    return decodeFile(bytes, as)
  })

  serve<PageMethods, 'files.list'>(rpc, 'files.list', async (raw) => {
    const { glob } = params.list.parse(raw)
    const requested = picomatch(glob, { dot: false })
    const entries = await host.client.tree()
    return entries
      .filter(
        (entry) =>
          entry.kind === 'file' && requested(entry.path) && mayRead(entry.path),
      )
      .map(
        ({ path, size, mtimeMs }): ListedFile => ({ path, size, mtimeMs }),
      )
  })

  serve<PageMethods, 'files.write'>(rpc, 'files.write', async (raw) => {
    const { path, text } = params.write.parse(raw)
    if (!mayWrite(checkPath(path)))
      throw new BridgeDenied(
        `files.write("${path}") was not declared; add // uses: files.write("${path}")`,
      )
    return host.client.write(path, text)
  })

  serve<PageMethods, 'state.open'>(rpc, 'state.open', (raw) => {
    const value = collection(params.open.parse(raw).name)
    if (!subscriptions.has(value))
      subscriptions.set(
        value,
        host.state.subscribe(value, (snapshot) => {
          void call<SandboxMethods, 'state.changed'>(rpc, 'state.changed', {
            name: value,
            value: snapshot,
          }).catch(() => {})
        }),
      )
    return host.state.snapshot(value)
  })

  serve<PageMethods, 'state.set'>(rpc, 'state.set', (raw) => {
    const { name: value, key, value: item } = params.set.parse(raw)
    host.state.set(collection(value), key, item)
    return null
  })

  serve<PageMethods, 'state.delete'>(rpc, 'state.delete', (raw) => {
    const { name: value, key } = params.remove.parse(raw)
    host.state.delete(collection(value), key)
    return null
  })

  serve<PageMethods, 'run.request'>(rpc, 'run.request', (raw) => {
    const { target } = params.run.parse(raw)
    if (!capabilities.run.includes(target))
      throw new BridgeDenied(
        `run("${target}") was not declared; add // uses: run("${target}")`,
      )
    return host.run(target)
  })

  serve<PageMethods, 'frame.resize'>(rpc, 'frame.resize', (raw) => {
    host.onResize?.(Math.min(params.resize.parse(raw).height, MAX_HEIGHT))
    return null
  })

  serve<PageMethods, 'frame.snapshot'>(rpc, 'frame.snapshot', (raw) => {
    host.onSnapshot?.(params.snapshot.parse(raw).html)
    return null
  })

  return () => {
    for (const unsubscribe of subscriptions.values()) unsubscribe()
    subscriptions.clear()
  }
}
