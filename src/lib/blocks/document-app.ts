// Adapt the existing sandbox bridge to one revisioned Documents SDK owner.
import type { AppDocument, AppSnapshot } from '../theorem/apps'
import { contentDigest } from '../theorem/note-canonical'
import type { BridgeHost, StateCollections } from './bridge'
import type { Capabilities } from './declarations'
import { StateReplica } from './state'

export function documentAppState(app: AppDocument) {
  const replica = new StateReplica({
    load: async () => (await app.load()).canonical,
    push: (update) => app.pushState(update),
    subscribe: (onUpdate) =>
      app.subscribe(() => {
        const snapshot = app.getSnapshot()
        if (snapshot) onUpdate(snapshot.canonical)
      }),
  })
  const key = (name: string) => `app-state:${name}`
  const state: StateCollections = {
    snapshot: (name) => replica.snapshot(key(name)),
    set: async (name, id, value) => {
      replica.set(key(name), id, value)
      await app.flush()
    },
    delete: async (name, id) => {
      replica.delete(key(name), id)
      await app.flush()
    },
    subscribe: (name, listener) => replica.subscribe(key(name), listener),
  }
  return { state, ready: replica.ready, dispose: () => replica.dispose() }
}

export function documentAppHost(
  app: AppDocument,
  snapshot: AppSnapshot,
  capabilities: Capabilities,
  state: StateCollections,
): BridgeHost {
  const source = new TextEncoder().encode(snapshot.html)
  const onlySource = (path: string) => {
    if (path !== 'index.html')
      throw new Error(
        'This App contains only index.html; use declared state collections for saved data.',
      )
  }
  return {
    capabilities,
    state,
    client: {
      async read(path) {
        onlySource(path)
        return { bytes: source, hash: await contentDigest(source) }
      },
      async tree() {
        return [
          {
            id: app.documentId,
            path: 'index.html',
            kind: 'file' as const,
            size: source.length,
            mtimeMs: 0,
          },
        ]
      },
      async write(path, data) {
        onlySource(path)
        const html =
          typeof data === 'string' ? data : new TextDecoder().decode(data)
        const current = app.getSnapshot()
        await app.saveSource(
          html,
          current?.html === snapshot.html
            ? current.revision
            : snapshot.revision,
        )
        return { hash: await contentDigest(new TextEncoder().encode(html)) }
      },
    },
    run: async () => {
      throw new Error(
        'Agent blocks are not available inside a conversation App. Ask in the conversation to start work.',
      )
    },
  }
}
