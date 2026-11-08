import { expect, test } from 'bun:test'
import { appDocumentFixture } from '../../../test/blocks/app-documents'
import { AppDocument } from '../theorem/apps'
import {
  documentAppHost,
  documentAppState,
  pinnedAppHost,
  pinnedAppState,
} from './document-app'
import { serveBridge } from './bridge'
import { noCapabilities } from './declarations'
import { call, rpcOver } from './sandbox/protocol'
import type { PageMethods } from './sandbox/protocol'

test('a sandbox state edit persists through the document owner and a fresh replica', async () => {
  const store = await appDocumentFixture()
  const app = new AppDocument('app-document', store.api, store.change)
  const snapshot = await app.load()
  const replica = documentAppState(app)
  await replica.ready
  const host = documentAppHost(
    app,
    snapshot,
    { ...noCapabilities(), state: ['rows'] },
    replica.state,
  )
  const channel = new MessageChannel()
  const stop = serveBridge(rpcOver(channel.port1), host)
  const frame = rpcOver(channel.port2)
  try {
    await call<PageMethods, 'state.set'>(frame, 'state.set', {
      name: 'rows',
      key: 'firefox',
      value: { privacy: 'Edited' },
    })
    expect(store.saved().summary.revision.position).toBe(2)
    const reopened = documentAppState(
      new AppDocument('app-document', store.api, store.change),
    )
    try {
      await reopened.ready
      expect(reopened.state.snapshot('rows')).toEqual({
        firefox: { privacy: 'Edited' },
      })
    } finally {
      reopened.dispose()
    }
    const outside = await host.client.read('other-document.html').then(
      () => false,
      () => true,
    )
    expect(outside).toBe(true)
    expect(
      new TextDecoder().decode((await host.client.read('index.html')).bytes),
    ).toBe('<p>Original</p>')
  } finally {
    stop()
    replica.dispose()
    channel.port1.close()
    channel.port2.close()
  }
})

test('a pinned revision reads its saved state, keeps edits in the frame and refuses writes', async () => {
  const store = await appDocumentFixture()
  const app = new AppDocument('app-document', store.api, store.change)
  const saved = documentAppState(app)
  await saved.ready
  await saved.state.set('rows', 'firefox', { privacy: 'Saved' })
  saved.dispose()
  const before = store.saved().summary.revision.position

  const seed = (await app.load()).canonical
  const pinned = pinnedAppState(seed)
  await pinned.ready
  const host = pinnedAppHost(
    '<p>Pinned</p>',
    'app-document',
    { ...noCapabilities(), state: ['rows'], write: ['index.html'] },
    pinned.state,
  )
  const channel = new MessageChannel()
  const stop = serveBridge(rpcOver(channel.port1), host)
  const frame = rpcOver(channel.port2)
  try {
    expect(pinned.state.snapshot('rows')).toEqual({
      firefox: { privacy: 'Saved' },
    })
    await call<PageMethods, 'state.set'>(frame, 'state.set', {
      name: 'rows',
      key: 'firefox',
      value: { privacy: 'Tried' },
    })
    expect(pinned.state.snapshot('rows')).toEqual({
      firefox: { privacy: 'Tried' },
    })
    expect(store.saved().summary.revision.position).toBe(before)
    const write = await call<PageMethods, 'files.write'>(frame, 'files.write', {
      path: 'index.html',
      text: '<p>Replaced</p>',
    }).then(
      () => 'written',
      (error: Error) => error.message,
    )
    expect(write).toContain('saved revision')
    expect(
      new TextDecoder().decode((await host.client.read('index.html')).bytes),
    ).toBe('<p>Pinned</p>')
  } finally {
    stop()
    pinned.dispose()
    channel.port1.close()
    channel.port2.close()
  }
})
