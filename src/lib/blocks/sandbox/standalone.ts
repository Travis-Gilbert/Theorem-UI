// SOURCING: the modules beside it, the platform's MessageChannel and
// localStorage. The entry of an exported tool (export.ts bundles it with
// esbuild-wasm): the tool runs as it does in its frame, against the files and
// state it declared, as they were when it was exported. Serving the page's
// methods from that snapshot is this app's own (plan D9's bridge, offline).
import { CellContext } from './cell'
import type { CellModule } from './cell'
import { createDisplay } from './display'
import { rpcOver, serve } from './protocol'
import type { ListedFile, PageMethods } from './protocol'

/** What an export carries besides the tool: its declared files and state. */
export interface ExportedData {
  name: string
  /** Each declared file: its bytes in base64, and its CSV rows when it has them. */
  files: Record<string, { base64: string; csv: string | null }>
  /** Each declared `files.read` glob's listing. */
  lists: Record<string, Array<ListedFile>>
  /** Each declared state collection, as it was. */
  state: Record<string, Record<string, unknown>>
}

/** CSV rows hold Dates; JSON carries them tagged. */
export const DATE_TAG = '$date'

export const encodeRows = (rows: unknown): string =>
  JSON.stringify(rows, function (key, value: unknown) {
    const raw = (this as Record<string, unknown>)[key]
    return raw instanceof Date ? { [DATE_TAG]: raw.toISOString() } : value
  })

const decodeRows = (text: string): unknown =>
  JSON.parse(text, (_key, value: unknown) =>
    value && typeof value === 'object' && DATE_TAG in value
      ? new Date(String((value as Record<string, unknown>)[DATE_TAG]))
      : value,
  )

const bytesOf = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Runs an exported tool in this page. */
export async function startStandalone(
  module: CellModule,
  data: ExportedData,
): Promise<void> {
  const root = document.getElementById('root')
  if (!root) throw new Error('The export has no #root')
  const channel = new MessageChannel()
  const page = rpcOver(channel.port1)
  const store = storage()
  const stored = (name: string) => `theorem-export:${data.name}:${name}`
  const collections = new Map<string, Record<string, unknown>>()

  const file = (path: string) => {
    const found = data.files[path]
    if (!found)
      throw new Error(
        `${path} was not part of this export: it reads only what the tool declared`,
      )
    return found
  }
  const collection = (name: string) => {
    let value = collections.get(name)
    if (!value) {
      if (!(name in data.state))
        throw new Error(`state("${name}") was not declared`)
      const saved = store?.getItem(stored(name))
      value = saved
        ? (JSON.parse(saved) as Record<string, unknown>)
        : { ...data.state[name] }
      collections.set(name, value)
    }
    return value
  }
  const save = (name: string, value: Record<string, unknown>) => {
    collections.set(name, value)
    store?.setItem(stored(name), JSON.stringify(value))
  }

  serve<PageMethods, 'files.read'>(page, 'files.read', ({ path, as }) => {
    const { base64, csv } = file(path)
    const bytes = bytesOf(base64)
    if (as === 'bytes') return bytes
    if (as === 'csv') {
      if (csv === null) throw new Error(`${path} has no CSV rows`)
      return decodeRows(csv)
    }
    const text = new TextDecoder().decode(bytes)
    return as === 'json' ? (JSON.parse(text) as unknown) : text
  })
  serve<PageMethods, 'files.list'>(page, 'files.list', ({ glob }) => {
    const listed = data.lists[glob]
    if (!listed)
      throw new Error(
        `files.list("${glob}") was not declared, so the export has no listing for it`,
      )
    return listed
  })
  serve<PageMethods, 'files.write'>(page, 'files.write', () => {
    throw new Error('An exported tool cannot write files')
  })
  serve<PageMethods, 'state.open'>(page, 'state.open', ({ name }) =>
    collection(name),
  )
  serve<PageMethods, 'state.set'>(page, 'state.set', ({ name, key, value }) => {
    save(name, { ...collection(name), [key]: value })
    return null
  })
  serve<PageMethods, 'state.delete'>(page, 'state.delete', ({ name, key }) => {
    const { [key]: _removed, ...rest } = collection(name)
    save(name, rest)
    return null
  })
  serve<PageMethods, 'run.request'>(page, 'run.request', ({ target }) => ({
    status: 'not-wired',
    target,
    message: `An exported tool cannot start ${target}.`,
  }))
  serve<PageMethods, 'frame.resize'>(page, 'frame.resize', () => null)

  const context = new CellContext(rpcOver(channel.port2), createDisplay(root))
  const outcome = await context.run(module, {})
  if (outcome.status === 'error') {
    const message = document.createElement('pre')
    message.textContent = outcome.error?.message ?? 'The tool failed'
    root.append(message)
  }
}
