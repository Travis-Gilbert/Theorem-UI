// A WorkspaceClient over files held in memory, for live block tests. It
// emits the same events the desktop client does when a file is written.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type {
  WorkspaceClient,
  WorkspaceEntry,
  WorkspaceEvent,
  WorkspaceSummary,
} from '@/lib/workspace/types'

export interface MemoryWorkspace extends WorkspaceClient {
  files: Map<string, Uint8Array>
  /** Writes as if something outside the app changed the file. */
  edit: (path: string, text: string) => void
  reads: Array<string>
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}

export function memoryWorkspace(
  initial: Record<string, string> = {},
  { trusted = true }: { trusted?: boolean } = {},
): MemoryWorkspace {
  const encoder = new TextEncoder()
  const files = new Map<string, Uint8Array>(
    Object.entries(initial).map(([p, text]) => [p, encoder.encode(text)]),
  )
  const listeners = new Set<(event: WorkspaceEvent) => void>()
  const ids = new Map<string, string>()
  const reads: Array<string> = []
  let summary: WorkspaceSummary = {
    id: 'ws_test',
    name: 'Test',
    path: '/test',
    trusted,
    policy: 'LocalOnly',
  }
  const entry = (p: string): WorkspaceEntry => {
    if (!ids.has(p)) ids.set(p, `vf_${ids.size}`)
    return {
      id: ids.get(p)!,
      path: p,
      kind: 'file',
      size: files.get(p)?.length ?? 0,
      mtimeMs: 0,
    }
  }
  const emit = (event: WorkspaceEvent) => {
    for (const listener of listeners) listener(event)
  }
  const store = (p: string, bytes: Uint8Array, origin: 'app' | 'external') => {
    const existed = files.has(p)
    files.set(p, bytes)
    void sha256(bytes).then((hash) =>
      emit(
        existed
          ? { type: 'changed', entry: entry(p), hash, origin }
          : { type: 'created', entry: entry(p), origin },
      ),
    )
  }
  const read = async (p: string) => {
    reads.push(p)
    const bytes = files.get(p)
    if (!bytes) throw new Error(`${p} is not in this folder`)
    return { bytes, hash: await sha256(bytes) }
  }
  return {
    files,
    reads,
    get workspace() {
      return summary
    },
    edit: (p, text) => store(p, encoder.encode(text), 'external'),
    tree: async () => [...files.keys()].map(entry),
    read,
    readText: async (p) => {
      const { bytes, hash } = await read(p)
      return { text: new TextDecoder().decode(bytes), hash }
    },
    write: async (p, data) => {
      const bytes = typeof data === 'string' ? encoder.encode(data) : data
      store(p, bytes, 'app')
      return { hash: await sha256(bytes) }
    },
    mkdir: async () => {},
    rename: async (from, to) => {
      const bytes = files.get(from)
      if (!bytes) return
      files.delete(from)
      files.set(to, bytes)
      emit({ type: 'renamed', id: entry(to).id, from, to, origin: 'app' })
    },
    remove: async (p) => {
      files.delete(p)
      emit({ type: 'deleted', id: entry(p).id, path: p, origin: 'app' })
    },
    resolve: async (target, from) => {
      const candidates = [
        target,
        `${target}.md`,
        path.posix.join(path.posix.dirname(from), target),
      ]
      return candidates.find((c) => files.has(c)) ?? null
    },
    links: async () => [],
    backlinks: async () => [],
    search: async () => [],
    tags: async () => [],
    properties: async (p) => {
      const text = new TextDecoder().decode(files.get(p) ?? new Uint8Array())
      const match = /^---\n([\s\S]*?)\n---/.exec(text)
      return match ? (parseYaml(match[1] ?? '') as Record<string, unknown>) : {}
    },
    settings: async () => ({
      attachments: './',
      dailyNotes: { folder: '', template: '' },
    }),
    setSettings: async (settings) => settings,
    setTrusted: async (value) => {
      summary = { ...summary, trusted: value }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** Every file under a fixtures folder, by its path relative to the folder. */
export async function loadFixtures(
  folder: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const name of await readdir(folder, {
    recursive: true,
    withFileTypes: true,
  }))
    if (name.isFile()) {
      const absolute = path.join(name.parentPath, name.name)
      out[path.relative(folder, absolute).split(path.sep).join('/')] =
        await readFile(absolute, 'utf8')
    }
  return out
}
