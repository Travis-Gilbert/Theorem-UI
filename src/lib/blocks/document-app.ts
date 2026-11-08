// SOURCING: loro-crdt through StateReplica (state collections) and the existing sandbox bridge; no library models an App document's bridge host
// Adapt the existing sandbox bridge to one revisioned Documents SDK owner.
import type { AppDocument, AppSnapshot } from '../theorem/apps'
import { contentDigest } from '../theorem/note-canonical'
import { BridgeDenied } from './bridge'
import type { BridgeHost, StateCollections } from './bridge'
import type { Capabilities } from './declarations'
import { StateReplica } from './state'

/** An App's declared state collection lives in its document under this key. */
const stateKey = (name: string) => `app-state:${name}`

function collections(
  replica: StateReplica,
  saved: () => Promise<void>,
): StateCollections {
  return {
    snapshot: (name) => replica.snapshot(stateKey(name)),
    set: async (name, id, value) => {
      replica.set(stateKey(name), id, value)
      await saved()
    },
    delete: async (name, id) => {
      replica.delete(stateKey(name), id)
      await saved()
    },
    subscribe: (name, listener) => replica.subscribe(stateKey(name), listener),
  }
}

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
  return {
    state: collections(replica, () => app.flush()),
    ready: replica.ready,
    dispose: () => replica.dispose(),
  }
}

/**
 * State for a pinned revision shown outside its live document: it starts from
 * `seed` (the saved document, when the revision is still current) and keeps
 * changes in this frame only. Nothing reaches the App's document.
 */
export function pinnedAppState(seed: Uint8Array | null) {
  const replica = new StateReplica({
    load: async () => seed,
    push: async () => {},
    subscribe: () => () => {},
  })
  return {
    state: collections(replica, async () => {}),
    ready: replica.ready,
    dispose: () => replica.dispose(),
  }
}

/** The host for a pinned revision: its own source, no writes, no agent runs. */
export function pinnedAppHost(
  html: string,
  documentId: string,
  capabilities: Capabilities,
  state: StateCollections,
): BridgeHost {
  const source = new TextEncoder().encode(html)
  return {
    capabilities,
    state,
    client: {
      async read(path) {
        if (path !== 'index.html')
          throw new BridgeDenied('This App contains only index.html.')
        return { bytes: source, hash: await contentDigest(source) }
      },
      async tree() {
        return [
          {
            id: documentId,
            path: 'index.html',
            kind: 'file' as const,
            size: source.length,
            mtimeMs: 0,
          },
        ]
      },
      async write() {
        throw new BridgeDenied(
          'This is a saved revision of the App. Open the App to change its source.',
        )
      },
    },
    run: async () => {
      throw new BridgeDenied(
        'Agent blocks are not available inside a conversation App. Ask in the conversation to start work.',
      )
    },
  }
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
