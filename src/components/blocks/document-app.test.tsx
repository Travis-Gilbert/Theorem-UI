import { act } from 'react'
import * as esbuild from 'esbuild-wasm'
import { BLOCK_SANDBOX } from '@/lib/blocks/executor'
import * as hosted from '@/lib/blocks/hosted-app'
import { afterEach, expect, spyOn, test } from 'bun:test'
import { AppDocument } from '@/lib/theorem/apps'
import { useComposerReferences } from '@/components/chat/composer-references'
import { appDocumentFixture } from '../../../test/blocks/app-documents'
import {
  buttonNamed,
  cleanup,
  click,
  render,
  waitFor,
} from '../../../test/blocks/render'
import { DocumentAppView } from './document-app'

afterEach(cleanup)

test('the App view identifies its current revision and sends a precise durable reference', async () => {
  const store = await appDocumentFixture()
  await store.remote('<p>Updated</p>')
  const app = new AppDocument('app-document', store.api, store.change)
  const { container } = await render(
    <DocumentAppView app={app} pinnedPosition={1} />,
  )
  await waitFor(() => buttonNamed(container, 'Ask about this App'))
  expect(container.textContent).toContain('Current revision 2')
  expect(container.textContent).toContain('Result referenced revision 1')
  expect(container.querySelector('iframe')).toBeNull()
  await click(buttonNamed(container, 'Ask about this App')!)
  expect(useComposerReferences.getState().take()).toMatchObject([
    {
      location: {
        revision: '2',
        resource: {
          kind: 'graph-object',
          objectId: 'app-document',
          objectType: 'theorem.app',
        },
      },
    },
  ])
})

test('the App view exposes the actual failed save and retry recovers the same document', async () => {
  const store = await appDocumentFixture()
  const app = new AppDocument('app-document', store.api, store.change)
  const { container } = await render(<DocumentAppView app={app} />)
  await waitFor(() => buttonNamed(container, 'Edit source'))
  const snapshot = app.getSnapshot()!
  store.fail(true)
  await act(() =>
    app.saveSource('<p>Changed</p>', snapshot.revision).catch(() => {}),
  )
  await waitFor(() => container.querySelector('[role="alert"]'))
  expect(container.textContent).toContain('Document store unavailable')
  expect(container.textContent).not.toContain('Saved')
  store.fail(false)
  await act(() => app.saveSource('<p>Changed</p>', snapshot.revision))
  await waitFor(() => !container.querySelector('[role="alert"]'))
  expect(container.textContent).toContain('Current revision 2')
})

test('replacing App source unmounts its old sandbox before granting new capabilities', async () => {
  const store = await appDocumentFixture()
  const app = new AppDocument('app-document', store.api, store.change)
  const original = hosted.hostedAppDocument
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const compile = spyOn(hosted, 'hostedAppDocument').mockImplementation(
    async (html) => {
      if (html.includes('New source')) await gate
      return original(html, esbuild)
    },
  )
  try {
    const { container } = await render(<DocumentAppView app={app} />)
    await waitFor(() => buttonNamed(container, 'Run App'))
    await click(buttonNamed(container, 'Run App')!)
    const old = await waitFor(() => container.querySelector('iframe'), 10_000)
    expect(old.getAttribute('sandbox')).toBe(BLOCK_SANDBOX)
    await store.remote(
      `<meta name="theorem:uses" content='net("example.com")'><p>New source</p>`,
    )
    await act(() => app.load())
    expect(container.querySelector('iframe')).toBeNull()
    expect(old.isConnected).toBe(false)
    await act(async () => release())
    const next = await waitFor(() => container.querySelector('iframe'), 10_000)
    expect(next.src).not.toBe(old.src)
    await click(buttonNamed(container, 'Stop App')!)
    expect(container.querySelector('iframe')).toBeNull()
  } finally {
    release()
    compile.mockRestore()
  }
}, 20_000)
