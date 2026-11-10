// SOURCING: bun:test over an App's databases (app-db.ts) and the bridge that
// checks each call on them (bridge.ts), with the real engine in memory from
// test/blocks/memory-database.ts.
import { afterEach, describe, expect, test } from 'bun:test'
import { memoryDatabase } from '../../../test/blocks/memory-database'
import type { MemoryDatabase } from '../../../test/blocks/memory-database'
import { memoryWorkspace } from '../../../test/blocks/memory-workspace'
import { appDatabaseDirectory, documentAppDatabases } from './app-db'
import type { DocumentDatabases } from './app-db'
import { serveBridge } from './bridge'
import { noCapabilities, parseHtmlDeclarations } from './declarations'
import { DbError, Databases } from './sandbox/db'
import type { DbNode } from './sandbox/db'
import { rpcOver, serve } from './sandbox/protocol'
import type { SandboxMethods } from './sandbox/protocol'
import { StateReplica } from './state'

/** The directories "the browser" has, each opened at most once at a time. */
function storage() {
  const directories = new Map<string, MemoryDatabase>()
  const opens: Array<string> = []
  return {
    directories,
    opens,
    open: async (directory: string) => {
      const existing = directories.get(directory)
      if (existing && !existing.closed)
        throw Object.assign(new Error('already has a writer'), {
          code: 'chunk_store_browser_storage',
        })
      opens.push(directory)
      const database = memoryDatabase()
      directories.set(directory, database)
      return database
    },
  }
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

/** One frame of an App: the page's bridge on one port, the frame's handle on the other. */
function frame(
  databases: DocumentDatabases | undefined,
  declared: Array<string>,
) {
  const channel = new MessageChannel()
  const stop = serveBridge(rpcOver(channel.port1), {
    client: memoryWorkspace({}),
    capabilities: { ...noCapabilities(), db: declared },
    state: new StateReplica({
      load: async () => null,
      push: async () => {},
      subscribe: () => () => {},
    }),
    db: databases,
    run: () => Promise.reject(new Error('unused')),
  })
  const rpc = rpcOver(channel.port2)
  const inFrame = new Databases(rpc)
  serve<SandboxMethods, 'db.changed'>(rpc, 'db.changed', ({ id, outcome }) => {
    inFrame.changed(id, outcome)
    return null
  })
  cleanups.push(() => {
    stop()
    databases?.dispose()
    channel.port1.close()
    channel.port2.close()
  })
  return { db: (name: string) => inFrame.open(name), stop }
}

// The page keeps a database open for a moment after its last view goes, so
// each test names an App of its own.
let apps = 0
const nextApp = () => `doc-${++apps}`

const org = (id: string, name: string): DbNode => ({
  id,
  labels: ['Org'],
  properties: { name },
})
const names = (nodes: Array<DbNode>) =>
  nodes.map((node) => node.properties.name).sort()
const settled = () => new Promise((resolve) => setTimeout(resolve, 20))
const failure = (work: Promise<unknown>) =>
  work.then(
    () => undefined,
    (error: unknown) => error,
  )

describe('declaring a database', () => {
  test('an App declares it like any other capability', () => {
    const { capabilities, errors } = parseHtmlDeclarations([
      'db("records"), state("view")',
    ])
    expect(errors).toEqual([])
    expect(capabilities.db).toEqual(['records'])
    expect(capabilities.state).toEqual(['view'])
  })

  test('its name must be safe as a file name', () => {
    for (const name of ['../other', 'Has Space', '', 'a/b', 'UPPER'])
      expect(parseHtmlDeclarations([`db("${name}")`]).errors).toHaveLength(1)
  })

  test('it is stored under the document, not a revision', () => {
    expect(appDatabaseDirectory('doc:app/7', 'records')).toBe(
      'theorem-app.doc_app_7.records',
    )
  })
})

describe("an App's database over the bridge", () => {
  test('a declared database commits, reads back and answers Cypher', async () => {
    const app1 = nextApp()
    const store = storage()
    const records = frame(documentAppDatabases(app1, { open: store.open }), [
      'records',
    ]).db('records')
    const commit = await records.mutate({
      upsertNodes: [org('org:a', 'Alder'), org('org:b', 'Birch')],
      upsertEdges: [
        {
          id: 'e:1',
          from: 'org:a',
          to: 'org:b',
          type: 'FUNDS',
          properties: {},
        },
      ],
    })
    expect(commit.graphVersion).toBeGreaterThan(0)
    expect(names(await records.queryNodes({ label: 'Org' }))).toEqual([
      'Alder',
      'Birch',
    ])
    expect((await records.getNode('org:a'))?.properties.name).toBe('Alder')
    expect(
      (await records.neighbors({ nodeId: 'org:a', direction: 'out' }))[0]
        ?.nodeId,
    ).toBe('org:b')
    const result = await records.query(
      'MATCH (o:Org) WHERE o.name = $name RETURN o.name AS name',
      { name: 'Birch' },
    )
    expect(result.rows).toEqual([['Birch']])
  })

  test('a database that was not declared is not reached', async () => {
    const app1 = nextApp()
    const store = storage()
    const app = frame(documentAppDatabases(app1, { open: store.open }), [
      'records',
    ])
    const refused = await failure(app.db('other').queryNodes())
    expect((refused as Error).message).toContain('db("other") was not declared')
    expect(store.opens).toEqual([])
  })

  test('a block with no databases is told so', async () => {
    const refused = await failure(
      frame(undefined, ['records']).db('records').inspect(),
    )
    expect((refused as Error).message).toContain('not available')
  })

  test("the database's own error code reaches the App", async () => {
    const app1 = nextApp()
    const store = storage()
    const records = frame(documentAppDatabases(app1, { open: store.open }), [
      'records',
    ]).db('records')
    const refused = await failure(records.query("CREATE (o:Org {name: 'x'})"))
    expect(refused).toBeInstanceOf(DbError)
    expect((refused as DbError).code).toBe('cypher_write_unsupported')
  })

  test('a method that is not a database call is refused before the database', async () => {
    const app1 = nextApp()
    const store = storage()
    const app = frame(documentAppDatabases(app1, { open: store.open }), [
      'records',
    ])
    const records = app.db('records') as unknown as {
      mutate: (batch: unknown) => Promise<unknown>
    }
    // A batch is checked by the database, which names the mistake.
    const misspelt = await failure(records.mutate({ upsertNode: [] }))
    expect(misspelt).toBeInstanceOf(DbError)
  })

  test('two views of one App share its records, and a subscription follows the other', async () => {
    const app1 = nextApp()
    const store = storage()
    const first = frame(documentAppDatabases(app1, { open: store.open }), [
      'records',
    ]).db('records')
    const second = frame(documentAppDatabases(app1, { open: store.open }), [
      'records',
    ]).db('records')
    const seen: Array<Array<unknown>> = []
    const stop = second.subscribe<Array<DbNode>>(
      { method: 'queryNodes', args: { label: 'Org' } },
      (nodes) => seen.push(names(nodes)),
    )
    await settled()
    await first.mutate({ upsertNodes: [org('org:a', 'Alder')] })
    await first.mutate({
      upsertNodes: [{ id: 'note:1', labels: ['Note'], properties: {} }],
    })
    await settled()
    expect(seen).toEqual([[], ['Alder']])
    expect(store.opens).toEqual([appDatabaseDirectory(app1, 'records')])
    stop()
    await first.mutate({ upsertNodes: [org('org:b', 'Birch')] })
    await settled()
    expect(seen).toHaveLength(2)
  })

  test('the next revision of an App finds the records the last one wrote', async () => {
    const app1 = nextApp()
    const store = storage()
    const before = frame(documentAppDatabases(app1, { open: store.open }), [
      'records',
    ])
    await before.db('records').mutate({ upsertNodes: [org('org:a', 'Alder')] })
    // A new revision replaces the frame: the old view goes, a new one comes.
    cleanups.splice(0).forEach((cleanup) => cleanup())
    const after = frame(documentAppDatabases(app1, { open: store.open }), [
      'records',
    ])
    expect(
      names(await after.db('records').queryNodes({ label: 'Org' })),
    ).toEqual(['Alder'])
    expect(store.opens).toHaveLength(1)
  })

  test('another App does not see them', async () => {
    const app1 = nextApp()
    const app2 = nextApp()
    const store = storage()
    await frame(documentAppDatabases(app1, { open: store.open }), ['records'])
      .db('records')
      .mutate({ upsertNodes: [org('org:a', 'Alder')] })
    const other = frame(documentAppDatabases(app2, { open: store.open }), [
      'records',
    ])
    expect(await other.db('records').queryNodes({ label: 'Org' })).toEqual([])
  })

  test('a saved revision reads the records and changes none', async () => {
    const app1 = nextApp()
    const store = storage()
    await frame(documentAppDatabases(app1, { open: store.open }), ['records'])
      .db('records')
      .mutate({ upsertNodes: [org('org:a', 'Alder')] })
    const pinned = frame(
      documentAppDatabases(app1, { open: store.open, writable: false }),
      ['records'],
    ).db('records')
    expect(names(await pinned.queryNodes({ label: 'Org' }))).toEqual(['Alder'])
    const refused = await failure(
      pinned.mutate({ upsertNodes: [org('org:b', 'Birch')] }),
    )
    expect((refused as DbError).code).toBe('read_only')
    expect(names(await pinned.queryNodes({ label: 'Org' }))).toEqual(['Alder'])
  })

  test('a frame that goes away stops its subscriptions', async () => {
    const app1 = nextApp()
    const store = storage()
    const databases = documentAppDatabases(app1, { open: store.open })
    const app = frame(databases, ['records'])
    const seen: Array<unknown> = []
    app
      .db('records')
      .subscribe({ method: 'queryNodes', args: { label: 'Org' } }, (nodes) =>
        seen.push(nodes),
      )
    await settled()
    app.stop()
    await databases.call('records', 'mutate', {
      upsertNodes: [org('org:a', 'Alder')],
    })
    await settled()
    expect(seen).toHaveLength(1)
  })
})
