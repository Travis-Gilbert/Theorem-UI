import { expect, test } from 'bun:test'
import { appDocumentFixture } from '../../../test/blocks/app-documents'
import { AppDocument } from '../theorem/apps'
import { documentAppHost, documentAppState } from './document-app'
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
