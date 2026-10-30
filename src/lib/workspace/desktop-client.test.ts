import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setGrants } from '#/server/desktop/grants'
import { workspaceRoutes } from '#/server/desktop/workspace/http'
import {
  closeAllWorkspaces,
  getWorkspace,
  registryOptions,
} from '#/server/desktop/workspace/registry'
import {
  WorkspaceRequestError,
  createDesktopWorkspaceClient,
  listDesktopWorkspaces,
} from './desktop-client'
import { WorkspaceConflictError } from './types'
import type { WorkspaceEntry, WorkspaceEvent, WorkspaceSummary } from './types'
import { applyWorkspaceEvent } from './workspaces'

type Handler = (context: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

/** fetch over the route handlers, as the local server would serve them. */
const routesFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(new URL(String(input), 'http://localhost'), init)
  const [, , , workspaceId, route] = new URL(request.url).pathname.split('/')
  const key = !workspaceId ? 'list' : (route ?? 'summary')
  const handlers = workspaceRoutes[key as keyof typeof workspaceRoutes] as
    Record<string, Handler> | undefined
  const handler = handlers?.[request.method]
  if (!handler) return new Response(null, { status: 405 })
  return handler({ request, params: { workspaceId: workspaceId ?? '' } })
}) as typeof fetch

const saved = {
  desktop: process.env.THEOREM_DESKTOP,
  dataDir: process.env.THEOREM_DESKTOP_DATA_DIR,
}
const scratch: Array<string> = []

async function temp(prefix: string): Promise<string> {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), prefix)))
  scratch.push(dir)
  return dir
}

beforeAll(async () => {
  process.env.THEOREM_DESKTOP = '1'
  process.env.THEOREM_DESKTOP_DATA_DIR = await temp('data-')
  registryOptions.trash = (absolute) => rm(absolute, { recursive: true })
  registryOptions.watch = { debounceMs: 50, maxWaitMs: 300 }
})

afterEach(async () => {
  setGrants([])
  await closeAllWorkspaces()
})

afterAll(async () => {
  process.env.THEOREM_DESKTOP = saved.desktop
  process.env.THEOREM_DESKTOP_DATA_DIR = saved.dataDir
  if (saved.desktop === undefined) delete process.env.THEOREM_DESKTOP
  if (saved.dataDir === undefined) delete process.env.THEOREM_DESKTOP_DATA_DIR
  await Promise.all(
    scratch.map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function openClient(files: Record<string, string>) {
  const root = await temp('ws-')
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), text)
  }
  setGrants([{ path: root, name: path.basename(root) }])
  const [summary] = (await listDesktopWorkspaces(routesFetch))!
  return {
    root,
    client: createDesktopWorkspaceClient(summary!, { fetch: routesFetch }),
  }
}

const shape = (entries: Array<WorkspaceEntry>) =>
  entries
    .map(({ id, path: p, kind }) => ({ id, path: p, kind }))
    .sort((a, b) => a.path.localeCompare(b.path))

describe('desktop workspace client over the routes', () => {
  test('lists nothing outside desktop mode', async () => {
    process.env.THEOREM_DESKTOP = '0'
    try {
      expect(await listDesktopWorkspaces(routesFetch)).toBeNull()
    } finally {
      process.env.THEOREM_DESKTOP = '1'
    }
  })

  test('reads, writes and guards writes with hashes', async () => {
    const { client } = await openClient({ 'a.md': '# A\n\n[[b]] #tag\n' })
    const { text, hash } = await client.readText('a.md')
    expect(text).toBe('# A\n\n[[b]] #tag\n')

    const written = await client.write('a.md', '# A\n\nmore\n', {
      expectedHash: hash,
    })
    expect(written.hash).not.toBe(hash)
    expect((await client.read('a.md')).hash).toBe(written.hash)

    const stale = await client
      .write('a.md', 'lost\n', { expectedHash: hash })
      .catch((error: unknown) => error)
    expect(stale).toBeInstanceOf(WorkspaceConflictError)
    expect((stale as WorkspaceConflictError).currentHash).toBe(written.hash)

    const exists = await client
      .write('a.md', 'lost\n', { expectedHash: null })
      .catch((error: unknown) => error)
    expect(exists).toBeInstanceOf(WorkspaceConflictError)

    await client.write('new/b.md', new TextEncoder().encode('# B\n'), {
      expectedHash: null,
    })
    expect((await client.readText('new/b.md')).text).toBe('# B\n')
  })

  test('route errors carry their code', async () => {
    const { client } = await openClient({ 'a.md': 'a\n' })
    const error = await client.read('../outside.md').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(WorkspaceRequestError)
    expect((error as WorkspaceRequestError).status).toBe(403)
    expect((error as WorkspaceRequestError).code).toBe('path_outside_workspace')
  })

  test('answers link, search, tag and property queries', async () => {
    const { client } = await openClient({
      'a.md': '---\nstatus: draft\n---\n# Alpha\n\nSee [[b]]. #topic\n',
      'notes/b.md': '# Beta\n\nbanana bread\n',
    })
    expect(await client.resolve('b', 'a.md')).toBe('notes/b.md')
    expect(await client.links('a.md')).toEqual([
      expect.objectContaining({ target: 'b', resolved: 'notes/b.md' }),
    ])
    expect(await client.backlinks('notes/b.md')).toEqual([
      expect.objectContaining({ from: 'a.md' }),
    ])
    expect(
      (await client.search('banana', { limit: 5 })).map((hit) => hit.path),
    ).toEqual(['notes/b.md'])
    expect(await client.tags()).toEqual([{ tag: 'topic', count: 1 }])
    expect(await client.properties('a.md')).toEqual({ status: 'draft' })

    expect(client.workspace.trusted).toBe(false)
    await client.setTrusted(true)
    expect(client.workspace.trusted).toBe(true)
  })

  test('the tree kept from events matches the tree the routes serve', async () => {
    const { root, client } = await openClient({
      'a.md': 'a\n',
      'docs/b.md': 'see [a](../a.md)\n',
      'docs/deep/c.md': 'c\n',
    })
    let kept = await client.tree()
    const events: Array<WorkspaceEvent> = []
    ;(await getWorkspace(client.workspace.id)).subscribe((event) =>
      events.push(event),
    )

    await client.write('docs/new.md', 'new\n', { expectedHash: null })
    await client.mkdir('empty/inner')
    await client.rename('docs', 'archive/docs')
    await client.rename('a.md', 'other/a.md')
    await client.remove('archive/docs/deep')
    await writeFile(path.join(root, 'outside.md'), 'from another editor\n')
    const start = Date.now()
    while (!events.some((e) => e.type === 'created' && e.origin === 'external'))
      if (Date.now() - start > 5000) throw new Error('No external event')
      else await Bun.sleep(20)

    for (const event of events) kept = applyWorkspaceEvent(kept, event)
    expect(shape(kept)).toEqual(shape(await client.tree()))
    // The moved note's link followed both moves.
    expect((await client.readText('archive/docs/b.md')).text).toBe(
      'see [a](../../other/a.md)\n',
    )
  })
})

/** An EventSource stand-in the test drives by hand. */
class FakeEventSource {
  static opened: Array<FakeEventSource> = []
  onopen: (() => void) | null = null
  onmessage: ((message: MessageEvent<string>) => void) | null = null
  closed = false
  constructor(readonly url: string) {
    FakeEventSource.opened.push(this)
  }
  close() {
    this.closed = true
  }
  send(event: WorkspaceEvent) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(event) }),
    )
  }
}

describe('desktop workspace client events', () => {
  const summary: WorkspaceSummary = {
    id: 'ws_1',
    name: 'Notes',
    path: '/tmp/notes',
    trusted: false,
    policy: 'LocalOnly',
  }

  test('views share one stream, which closes with the last of them', () => {
    FakeEventSource.opened = []
    const client = createDesktopWorkspaceClient(summary, {
      fetch: routesFetch,
      eventSource: (url) => new FakeEventSource(url) as unknown as EventSource,
    })
    const first: Array<WorkspaceEvent> = []
    const second: Array<WorkspaceEvent> = []
    const stopFirst = client.subscribe((event) => first.push(event))
    const stopSecond = client.subscribe((event) => second.push(event))
    expect(FakeEventSource.opened.map((s) => s.url)).toEqual([
      '/desktop/workspace/ws_1/events',
    ])
    const stream = FakeEventSource.opened[0]!

    // Opening, and opening again after a drop, both mean events were missed.
    stream.onopen?.()
    stream.send({ type: 'indexed' })
    stream.onopen?.()
    expect(first).toEqual([
      { type: 'resync' },
      { type: 'indexed' },
      { type: 'resync' },
    ])
    expect(second).toEqual(first)

    stopFirst()
    expect(stream.closed).toBe(false)
    stopSecond()
    expect(stream.closed).toBe(true)

    // A later view opens a new stream.
    client.subscribe(() => {})
    expect(FakeEventSource.opened).toHaveLength(2)
  })
})
