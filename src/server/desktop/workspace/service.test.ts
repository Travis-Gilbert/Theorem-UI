import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Database } from '@rustyreddb/node'
import type {
  WorkspaceEntry,
  WorkspaceEvent,
  WorkspaceGraph,
  WorkspaceLink,
  WorkspaceSummary,
} from '#/lib/workspace/types'
import { setGrants } from '../grants'
import { sha256 } from './files'
import { workspaceRoutes } from './http'
import {
  closeAllWorkspaces,
  getWorkspace,
  registryOptions,
  workspaceDataDir,
} from './registry'

type RouteKey = keyof typeof workspaceRoutes
type RouteHandler = (context: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

const saved = {
  desktop: process.env.THEOREM_DESKTOP,
  dataDir: process.env.THEOREM_DESKTOP_DATA_DIR,
}
const scratch: Array<string> = []
const trashed: Array<string> = []

beforeAll(async () => {
  process.env.THEOREM_DESKTOP = '1'
  process.env.THEOREM_DESKTOP_DATA_DIR = await temp('data-')
  // Tests never touch the person's real Trash.
  registryOptions.trash = async (absolute) => {
    trashed.push(absolute)
    await rm(absolute, { recursive: true })
  }
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

async function temp(prefix: string): Promise<string> {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), prefix)))
  scratch.push(dir)
  return dir
}

/** A folder holding `files`, granted and opened as a workspace. */
async function openFolder(files: Record<string, string>) {
  const root = await temp('ws-')
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), text)
  }
  setGrants([{ path: root, name: path.basename(root) }])
  const [summary] = (await (
    await call('list', 'GET', '')
  ).json()) as Array<WorkspaceSummary>
  const events: Array<WorkspaceEvent> = []
  ;(await getWorkspace(summary!.id)).subscribe((event) => events.push(event))
  return { root, id: summary!.id, summary: summary!, events }
}

async function call(
  key: RouteKey,
  method: string,
  workspaceId: string,
  init: {
    query?: Record<string, string>
    json?: unknown
    body?: string
    headers?: Record<string, string>
    signal?: AbortSignal
  } = {},
): Promise<Response> {
  const url = new URL(
    key === 'list'
      ? 'http://localhost/desktop/workspace'
      : `http://localhost/desktop/workspace/${workspaceId}/${key}`,
  )
  for (const [name, value] of Object.entries(init.query ?? {}))
    url.searchParams.set(name, value)
  const request = new Request(url, {
    method,
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
    headers: init.headers,
    signal: init.signal,
  })
  const handler = (workspaceRoutes[key] as Record<string, RouteHandler>)[
    method
  ]!
  return handler({ request, params: { workspaceId } })
}

const tree = async (id: string) =>
  (await (await call('tree', 'GET', id)).json()) as Array<WorkspaceEntry>

const text = async (root: string, file: string) =>
  readFile(path.join(root, file), 'utf8')

async function waitFor<T>(
  check: () => T | undefined | null | false,
  timeout = 5000,
): Promise<T> {
  const start = Date.now()
  for (;;) {
    const value = check()
    if (value) return value
    if (Date.now() - start > timeout) throw new Error('Timed out waiting')
    await Bun.sleep(20)
  }
}

/** Long enough for the watcher to have reported anything it was going to. */
const settle = () => Bun.sleep(800)

const external = (events: Array<WorkspaceEvent>) =>
  events.filter((e) => 'origin' in e && e.origin === 'external')

describe('folder workspace service', () => {
  test('an existing folder opens and indexes', async () => {
    const { root, id, summary } = await openFolder({
      'notes/Plan.md':
        '---\ntitle: The plan\nstatus: draft\n---\n# Plan\n\nSee [[Ideas#Later]] and [spec](../specs/My%20Spec.md). #project\n\n- [ ] write it\n',
      'Ideas.md': '# Ideas\n\n## Later\n\nA paragraph ^b1\n',
      'specs/My Spec.md': 'The spec #project/alpha\n',
      'img/diagram.png': 'not really a png',
      '.obsidian/app.json': '{}',
    })

    expect(summary).toMatchObject({
      name: path.basename(root),
      path: root,
      trusted: false,
      policy: 'LocalOnly',
    })
    expect(id).toMatch(/^ws_[0-9A-Z]{26}$/)
    expect(JSON.parse(await text(root, '.theorem/workspace.json'))).toEqual({
      id,
    })

    // Every entry has an id in .theorem/ids.json, sorted by path; hidden
    // entries are not part of the workspace.
    const ids = JSON.parse(await text(root, '.theorem/ids.json')) as Record<
      string,
      string
    >
    const paths = [
      'Ideas.md',
      'img',
      'img/diagram.png',
      'notes',
      'notes/Plan.md',
      'specs',
      'specs/My Spec.md',
    ]
    expect(Object.keys(ids)).toEqual(paths)
    for (const value of Object.values(ids)) expect(value).toMatch(/^vf_/)
    const entries = await tree(id)
    expect(entries.map((e) => e.path)).toEqual(paths)
    for (const entry of entries) expect(entry.id).toBe(ids[entry.path]!)
    // Ids never go into the person's files.
    expect(await text(root, 'Ideas.md')).not.toContain('vf_')

    const links = (await (
      await call('links', 'GET', id, { query: { path: 'notes/Plan.md' } })
    ).json()) as Array<WorkspaceLink>
    expect(links).toEqual([
      {
        from: 'notes/Plan.md',
        target: 'Ideas',
        resolved: 'Ideas.md',
        kind: 'wikilink',
        heading: 'Later',
        line: 7,
      },
      {
        from: 'notes/Plan.md',
        target: '../specs/My Spec.md',
        resolved: 'specs/My Spec.md',
        kind: 'markdown',
        line: 7,
      },
    ])
    const backlinks = (await (
      await call('backlinks', 'GET', id, { query: { path: 'Ideas.md' } })
    ).json()) as Array<WorkspaceLink>
    expect(backlinks.map((l) => l.from)).toEqual(['notes/Plan.md'])

    expect(
      await (
        await call('properties', 'GET', id, {
          query: { path: 'notes/Plan.md' },
        })
      ).json(),
    ).toEqual({ title: 'The plan', status: 'draft' })
    expect(await (await call('tags', 'GET', id)).json()).toEqual([
      { tag: 'project', count: 1 },
      { tag: 'project/alpha', count: 1 },
    ])
    const hits = (await (
      await call('search', 'GET', id, { query: { q: 'parag' } })
    ).json()) as Array<{ path: string; title: string; snippet: string }>
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ path: 'Ideas.md', title: 'Ideas' })
    expect(hits[0]!.snippet).toContain('<mark>paragraph</mark>')
    expect(
      await (
        await call('resolve', 'GET', id, {
          query: { target: 'ideas', from: 'notes/Plan.md' },
        })
      ).json(),
    ).toEqual({ resolved: 'Ideas.md' })

    const file = await call('file', 'GET', id, { query: { path: 'Ideas.md' } })
    const body = await file.text()
    expect(body).toStartWith('# Ideas')
    expect(file.headers.get('etag')).toBe(`"${sha256(Buffer.from(body))}"`)
    expect(file.headers.get('content-type')).toStartWith('text/markdown')
    const again = await call('file', 'GET', id, {
      query: { path: 'Ideas.md' },
      headers: { 'if-none-match': file.headers.get('etag')! },
    })
    expect(again.status).toBe(304)
  })

  test('the graph holds every note with its tags and its links, each once', async () => {
    const { id } = await openFolder({
      'Hub.md':
        '# Hub\n\n[[Ideas]] and [[Ideas#Later]], [[Missing]] [[missing]] #map\n\n[[a/Gone]] [[b/Gone]]\n\n![[img/diagram.png]]\n',
      'Ideas.md': '---\ntags: [map, Map]\n---\n## Later\n\nBack to [[Hub]]\n',
      'Lonely.md': 'Nothing links here\n',
      'img/diagram.png': 'not really a png',
    })
    const graph = (await (
      await call('graph', 'GET', id)
    ).json()) as WorkspaceGraph
    expect(graph.notes).toEqual([
      { path: 'Hub.md', title: 'Hub', tags: ['map'] },
      { path: 'Ideas.md', title: 'Later', tags: ['map', 'Map'] },
      { path: 'Lonely.md', title: 'Lonely', tags: [] },
    ])
    expect(graph.links).toEqual([
      { from: 'Hub.md', to: 'Ideas.md', target: 'Ideas' },
      { from: 'Hub.md', to: null, target: 'Missing' },
      { from: 'Hub.md', to: null, target: 'a/Gone' },
      { from: 'Hub.md', to: null, target: 'b/Gone' },
      { from: 'Hub.md', to: 'img/diagram.png', target: 'img/diagram.png' },
      { from: 'Ideas.md', to: 'Hub.md', target: 'Hub' },
    ])
  })

  test('search takes tag: terms as Obsidian does, nested tags included', async () => {
    const { id } = await openFolder({
      'Alpha.md': '# Alpha\n\nA meeting about the launch #project/alpha\n',
      'Beta.md': '# Beta\n\nNotes from a meeting #Project\n',
      'Gamma.md': '---\ntags: [projects]\n---\n# Gamma\n\nA meeting\n',
      'Delta.md': '# Delta\n\nA_b #a_b\n',
    })
    const search = async (q: string) =>
      (
        (await (
          await call('search', 'GET', id, { query: { q } })
        ).json()) as Array<{ path: string; snippet: string }>
      ).map((hit) => hit.path)

    // A tag alone lists its notes by title, with its nested tags and any case.
    expect(await search('tag:#project')).toEqual(['Alpha.md', 'Beta.md'])
    expect(await search('tag:project/alpha')).toEqual(['Alpha.md'])
    // With words, the tag narrows the full-text matches.
    expect((await search('meeting')).toSorted()).toEqual([
      'Alpha.md',
      'Beta.md',
      'Gamma.md',
    ])
    expect((await search('tag:#project meeting')).toSorted()).toEqual([
      'Alpha.md',
      'Beta.md',
    ])
    expect(await search('tag:#projects meet')).toEqual(['Gamma.md'])
    // LIKE's wildcards in a tag are taken literally.
    expect(await search('tag:#a_b')).toEqual(['Delta.md'])
    expect(await search('tag:#a%')).toEqual([])
  })

  test("a folder's settings are kept in .theorem/settings.json, with defaults", async () => {
    const { root, id } = await openFolder({ 'a.md': 'a\n' })
    expect(await (await call('settings', 'GET', id)).json()).toEqual({
      attachments: './',
      dailyNotes: { folder: '', template: '' },
    })

    const response = await call('settings', 'PUT', id, {
      json: { attachments: 'Attachments', dailyNotes: { folder: 'Daily' } },
    })
    const stored = {
      attachments: 'Attachments',
      dailyNotes: { folder: 'Daily', template: '' },
    }
    expect(await response.json()).toEqual(stored)
    expect(JSON.parse(await text(root, '.theorem/settings.json'))).toEqual(
      stored,
    )
    expect(await (await call('settings', 'GET', id)).json()).toEqual(stored)

    const invalid = await call('settings', 'PUT', id, {
      json: { attachments: 3 },
    })
    expect(invalid.status).toBe(400)
    // .theorem/ is not part of the workspace.
    expect((await tree(id)).map((e) => e.path)).toEqual(['a.md'])
  })

  test('an edit made outside Theorem appears after the debounce as external', async () => {
    const { root, id, events } = await openFolder({ 'a.md': 'one\n' })
    const before = (await tree(id)).find((e) => e.path === 'a.md')!

    await writeFile(path.join(root, 'a.md'), 'two #fresh\n')
    const changed = await waitFor(() =>
      events.find((e) => e.type === 'changed'),
    )
    expect(changed).toMatchObject({
      type: 'changed',
      entry: { id: before.id, path: 'a.md' },
      hash: sha256(Buffer.from('two #fresh\n')),
      origin: 'external',
    })
    await waitFor(() => events.find((e) => e.type === 'indexed'))
    expect(await (await call('tags', 'GET', id)).json()).toEqual([
      { tag: 'fresh', count: 1 },
    ])

    await writeFile(path.join(root, 'b.md'), 'new file\n')
    const created = await waitFor(() =>
      events.find((e) => e.type === 'created'),
    )
    expect(created).toMatchObject({
      entry: { path: 'b.md', kind: 'file' },
      origin: 'external',
    })

    // Only the line endings changed: not an edit.
    events.length = 0
    await writeFile(path.join(root, 'b.md'), 'new file\r\n')
    await settle()
    expect(external(events)).toEqual([])
  })

  test('changes made through the service are not echoed as external', async () => {
    const { id, events } = await openFolder({ 'a.md': 'one\n' })
    const stream = new AbortController()
    const response = await call('events', 'GET', id, { signal: stream.signal })
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const reader = response.body!.getReader()

    const put = await call('file', 'PUT', id, {
      query: { path: 'notes/new.md' },
      body: '# New\n',
      headers: { 'if-none-match': '*' },
    })
    expect(put.status).toBe(200)
    const { hash } = (await put.json()) as { hash: string }
    expect(hash).toBe(sha256(Buffer.from('# New\n')))
    expect(
      (
        await call('file', 'PUT', id, {
          query: { path: 'a.md' },
          body: 'two\n',
          headers: { 'if-match': `"${sha256(Buffer.from('one\n'))}"` },
        })
      ).status,
    ).toBe(200)
    expect(
      (await call('mkdir', 'POST', id, { json: { path: 'empty' } })).status,
    ).toBe(201)
    await settle()

    expect(events.filter((e) => e.type !== 'indexed')).toEqual([
      {
        type: 'created',
        entry: expect.objectContaining({ path: 'notes', kind: 'directory' }),
        origin: 'app',
      },
      {
        type: 'created',
        entry: expect.objectContaining({ path: 'notes/new.md' }),
        origin: 'app',
      },
      {
        type: 'changed',
        entry: expect.objectContaining({ path: 'a.md' }),
        hash: sha256(Buffer.from('two\n')),
        origin: 'app',
      },
      {
        type: 'created',
        entry: expect.objectContaining({ path: 'empty', kind: 'directory' }),
        origin: 'app',
      },
    ])

    // The same events went out over Server-Sent Events.
    let received = ''
    while (!received.includes('"path":"empty"')) {
      const { value } = await reader.read()
      received += new TextDecoder().decode(value)
    }
    expect(received).toContain('"type":"created"')
    expect(received).not.toContain('"origin":"external"')
    stream.abort()
  })

  test('a rename keeps the id and rewrites the links to it', async () => {
    const plan = [
      '# Plan',
      '',
      'See [[Ideas]], [[Ideas#Later|later]], [[Ideas#^b1]] and ![[Ideas]].',
      'Also [ideas](../Ideas.md#Later) and [spec](../specs/My%20Spec.md).',
      'Code stays: `[[Ideas]]`',
      '',
    ].join('\n')
    const { root, id, events } = await openFolder({
      'Ideas.md': '# Ideas\n',
      'notes/Plan.md': plan,
      'specs/My Spec.md': 'Spec, linking [[Plan]]\n',
      'other.md': 'Unrelated [[Elsewhere]]\n',
    })
    const ideasId = (await tree(id)).find((e) => e.path === 'Ideas.md')!.id

    const renamed = await call('rename', 'POST', id, {
      json: { from: 'Ideas.md', to: 'archive/Thoughts.md' },
    })
    expect(renamed.status).toBe(204)
    expect(
      (await tree(id)).find((e) => e.path === 'archive/Thoughts.md')?.id,
    ).toBe(ideasId)
    expect(await text(root, 'notes/Plan.md')).toBe(
      [
        '# Plan',
        '',
        'See [[Thoughts]], [[Thoughts#Later|later]], [[Thoughts#^b1]] and ![[Thoughts]].',
        'Also [ideas](../archive/Thoughts.md#Later) and [spec](../specs/My%20Spec.md).',
        'Code stays: `[[Ideas]]`',
        '',
      ].join('\n'),
    )
    expect(await text(root, 'other.md')).toBe('Unrelated [[Elsewhere]]\n')

    // Moving the folder that holds the note rewrites its relative links.
    const planId = (await tree(id)).find((e) => e.path === 'notes/Plan.md')!.id
    await call('rename', 'POST', id, {
      json: { from: 'notes', to: 'docs/notes' },
    })
    expect(
      (await tree(id)).find((e) => e.path === 'docs/notes/Plan.md')?.id,
    ).toBe(planId)
    expect(await text(root, 'docs/notes/Plan.md')).toContain(
      'Also [ideas](../../archive/Thoughts.md#Later) and [spec](../../specs/My%20Spec.md).',
    )
    // A bare wikilink still resolves by name, so it is left alone.
    expect(await text(root, 'specs/My Spec.md')).toBe(
      'Spec, linking [[Plan]]\n',
    )
    const backlinks = (await (
      await call('backlinks', 'GET', id, {
        query: { path: 'archive/Thoughts.md' },
      })
    ).json()) as Array<WorkspaceLink>
    expect(backlinks).toHaveLength(5)

    await settle()
    expect(external(events)).toEqual([])
    expect(
      events.filter((e) => e.type === 'renamed').map((e) => [e.from, e.to]),
    ).toEqual([
      ['Ideas.md', 'archive/Thoughts.md'],
      ['notes', 'docs/notes'],
      ['notes/Plan.md', 'docs/notes/Plan.md'],
    ])
    expect(
      events
        .filter((e) => e.type === 'changed')
        .map((e) => [e.entry.path, e.origin]),
    ).toEqual([
      ['notes/Plan.md', 'app'],
      ['docs/notes/Plan.md', 'app'],
    ])
    const ids = JSON.parse(await text(root, '.theorem/ids.json')) as Record<
      string,
      string
    >
    expect(ids['archive/Thoughts.md']).toBe(ideasId)
    expect(ids['Ideas.md']).toBeUndefined()

    // A note titled by its name takes the new name.
    await call('rename', 'POST', id, {
      json: { from: 'other.md', to: 'Renamed.md' },
    })
    expect(
      await (
        await call('search', 'GET', id, { query: { q: 'unrelated' } })
      ).json(),
    ).toMatchObject([{ path: 'Renamed.md', title: 'Renamed' }])
  })

  test('a rename made outside Theorem keeps the id', async () => {
    const { root, id, events } = await openFolder({
      'a.md': 'content\n',
      'dir/inner.md': 'inner\n',
    })
    const before = await tree(id)
    const idOf = (p: string) => before.find((e) => e.path === p)!.id

    await rename(path.join(root, 'a.md'), path.join(root, 'b.md'))
    await rename(path.join(root, 'dir'), path.join(root, 'moved'))
    await waitFor(() => events.filter((e) => e.type === 'renamed').length >= 3)
    const after = await tree(id)
    expect(after.find((e) => e.path === 'b.md')?.id).toBe(idOf('a.md'))
    expect(after.find((e) => e.path === 'moved')?.id).toBe(idOf('dir'))
    expect(after.find((e) => e.path === 'moved/inner.md')?.id).toBe(
      idOf('dir/inner.md'),
    )
    expect(events.filter((e) => e.type === 'deleted')).toEqual([])
    expect(events.filter((e) => e.type === 'created')).toEqual([])
  })

  test('a file arriving with a theorem-id keeps that id', async () => {
    const { root, id, events } = await openFolder({ 'a.md': 'a\n' })
    const carried = 'vf_01JAAAAAAAAAAAAAAAAAAAAAAA'
    await writeFile(
      path.join(root, 'moved-in.md'),
      `---\ntheorem-id: ${carried}\n---\nFrom another workspace\n`,
    )
    await waitFor(() => events.find((e) => e.type === 'created'))
    expect((await tree(id)).find((e) => e.path === 'moved-in.md')?.id).toBe(
      carried,
    )
  })

  test('the index rebuilds from nothing to the same rows', async () => {
    const { id } = await openFolder({
      'notes/Plan.md':
        '---\ntags: [a, b]\nrating: 3\n---\n# Plan\n\n[[Ideas#Later]] #c\n\n- [x] done ^blk\n',
      'Ideas.md': '# Ideas\n\n## Later\n',
      'Old.md': '[[Gone]] #gone\n',
      'img/x.png': 'bytes',
    })
    // A tag and a link key whose last use goes are deleted with it.
    await call('file', 'PUT', id, {
      query: { path: 'Old.md' },
      body: 'Nothing here\n',
    })
    const file = path.join(workspaceDataDir(id), 'index.rr')
    const snapshot = () => {
      const db = Database.openReadOnly(file)
      const graph: Record<string, Array<string>> = {}
      for (const label of ['Entry', 'Note', 'Tag', 'LinkKey', 'Meta'])
        graph[label] = db
          .queryNodes({ label })
          .map((node) => JSON.stringify(node))
          .sort()
      graph.edges = db
        .queryNodes({ label: 'Note' })
        .flatMap((note) =>
          db
            .neighbors({ nodeId: note.id, direction: 'out' })
            .map((hit) => JSON.stringify({ from: note.id, ...hit })),
        )
        .sort()
      graph.search = db
        .fulltextSearch('Note', 'later', 10)
        .map((hit) => JSON.stringify([hit.id, hit.snippet]))
      db.close()
      return graph
    }
    const first = snapshot()
    expect(first.Note).toHaveLength(3)
    expect(first.Tag).toHaveLength(3)
    expect(first.LinkKey).toHaveLength(1)
    expect(first.edges?.filter((e) => e.includes('"LINKS_TO"'))).toHaveLength(1)
    expect(first.search).toHaveLength(2)

    await (await getWorkspace(id)).rebuild()
    expect(snapshot()).toEqual(first)

    // Delete the index outright and open the folder again.
    await closeAllWorkspaces()
    await rm(workspaceDataDir(id), { recursive: true })
    await getWorkspace(id)
    expect(snapshot()).toEqual(first)
  })

  test('a write against a stale hash is a conflict', async () => {
    const { root, id } = await openFolder({ 'a.md': 'one\n' })
    const stale = sha256(Buffer.from('one\n'))
    await writeFile(path.join(root, 'a.md'), 'changed elsewhere\n')

    const conflict = await call('file', 'PUT', id, {
      query: { path: 'a.md' },
      body: 'mine\n',
      headers: { 'if-match': `"${stale}"` },
    })
    expect(conflict.status).toBe(412)
    expect(await conflict.json()).toMatchObject({
      code: 'precondition_failed',
      currentHash: sha256(Buffer.from('changed elsewhere\n')),
    })
    expect(await text(root, 'a.md')).toBe('changed elsewhere\n')

    const exists = await call('file', 'PUT', id, {
      query: { path: 'a.md' },
      body: 'mine\n',
      headers: { 'if-none-match': '*' },
    })
    expect(exists.status).toBe(412)
  })

  test('paths that leave the workspace are refused', async () => {
    const outside = await temp('outside-')
    await writeFile(path.join(outside, 'secret.txt'), 'secret')
    const { root, id } = await openFolder({ 'a.md': 'a\n' })
    await symlink(outside, path.join(root, 'escape'))
    await symlink(path.join(outside, 'secret.txt'), path.join(root, 'link.txt'))

    for (const bad of [
      '../outside.md',
      'a/../../outside.md',
      '/etc/passwd',
      'escape/secret.txt',
      'link.txt',
    ]) {
      const read = await call('file', 'GET', id, { query: { path: bad } })
      expect(read.status).toBe(403)
      const write = await call('file', 'PUT', id, {
        query: { path: bad },
        body: 'x',
      })
      expect(write.status).toBe(403)
    }
    expect(
      (
        await call('rename', 'POST', id, {
          json: { from: 'a.md', to: '../a.md' },
        })
      ).status,
    ).toBe(403)
    // .theorem is the service's own; hidden entries are not changed.
    expect(
      (
        await call('file', 'PUT', id, {
          query: { path: '.theorem/ids.json' },
          body: '{}',
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await call('rename', 'POST', id, {
          json: { from: 'a.md', to: '.git/a.md' },
        })
      ).status,
    ).toBe(403)
    expect(await readFile(path.join(outside, 'secret.txt'), 'utf8')).toBe(
      'secret',
    )
    expect((await tree(id)).map((e) => e.path)).toEqual(['a.md'])
  })

  test('remove sends an entry to the trash', async () => {
    const { root, id, events } = await openFolder({
      'dir/a.md': 'a\n',
      'b.md': 'b\n',
    })
    const response = await call('file', 'DELETE', id, {
      query: { path: 'dir' },
    })
    expect(response.status).toBe(204)
    expect(trashed).toContain(path.join(root, 'dir'))
    expect((await tree(id)).map((e) => e.path)).toEqual(['b.md'])
    expect(
      events.filter((e) => e.type === 'deleted').map((e) => e.path),
    ).toEqual(['dir/a.md', 'dir'])
    await settle()
    expect(external(events)).toEqual([])
    expect(
      (await call('file', 'DELETE', id, { query: { path: 'dir' } })).status,
    ).toBe(404)
  })

  test('routes answer 404 outside desktop mode', async () => {
    process.env.THEOREM_DESKTOP = '0'
    try {
      expect((await call('list', 'GET', '')).status).toBe(404)
      expect((await call('tree', 'GET', 'ws_x')).status).toBe(404)
    } finally {
      process.env.THEOREM_DESKTOP = '1'
    }
  })

  test('a withdrawn grant closes the workspace', async () => {
    const { id } = await openFolder({ 'a.md': 'a\n' })
    setGrants([])
    await Bun.sleep(50)
    const response = await call('tree', 'GET', id)
    expect(response.status).toBe(404)
  })
})
