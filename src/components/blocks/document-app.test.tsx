import { act } from 'react'
import { Window } from 'happy-dom'
import * as esbuild from 'esbuild-wasm'
import {
  call,
  READY_MESSAGE,
  rpcOver,
  serve,
} from '@/lib/blocks/sandbox/protocol'
import type { PageMethods, SandboxMethods } from '@/lib/blocks/sandbox/protocol'
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

const originalHosted = hosted.hostedAppDocument

afterEach(cleanup)

const revision = (container: HTMLElement) =>
  container.querySelector('[data-revision]')?.getAttribute('data-revision')

test('the App view identifies its current revision and sends a precise durable reference', async () => {
  const store = await appDocumentFixture()
  await store.remote('<p>Updated</p>')
  const app = new AppDocument('app-document', store.api, store.change)
  const { container } = await render(
    <DocumentAppView app={app} pinnedPosition={1} />,
  )
  await waitFor(() => buttonNamed(container, 'Ask about this App'))
  expect(revision(container)).toBe('2')
  expect(container.textContent).toContain('Changed since this result')
  expect(container.textContent).not.toMatch(/revision \d/i)
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
  expect(revision(container)).toBe('2')
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

// Happy DOM does not execute iframe scripts; use its real window and the
// production MessageChannel handshake to drive exactly the App bridge API.
async function connectAppFrame(container: HTMLElement) {
  const frame = await waitFor(() => container.querySelector('iframe'), 10_000)
  // Page loading is disabled by the test browser; supply its window only.
  const child = new Window()
  Object.defineProperty(frame, 'contentWindow', { value: child })
  let port: MessagePort | undefined
  const post = spyOn(frame.contentWindow!, 'postMessage').mockImplementation(
    (
      _message: unknown,
      _origin?: string | WindowPostMessageOptions,
      transfer?: Transferable[],
    ) => {
      port = transfer?.[0] as MessagePort
    },
  )
  window.dispatchEvent(
    new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: READY_MESSAGE },
    }),
  )
  post.mockRestore()
  const rpc = rpcOver(port!)
  serve<SandboxMethods, 'state.changed'>(rpc, 'state.changed', async () => null)
  return { rpc, close: () => port!.close() }
}

for (const failed of [false, true]) {
  test(`App Ask refuses ${failed ? 'failed' : 'in-flight'} state and drops dirty selection after save`, async () => {
    useComposerReferences.getState().take()
    const store = await appDocumentFixture()
    await store.remote(
      `<meta name="theorem:uses" content='state("rows")'><p>Stateful</p>`,
    )
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const revise = store.api.revise
    store.api.revise = async (request) => {
      await gate
      return revise(request)
    }
    store.fail(failed)
    const app = new AppDocument('app-document', store.api, store.change)
    const compile = spyOn(hosted, 'hostedAppDocument').mockImplementation(
      (html) => originalHosted(html, esbuild),
    )
    let close = () => {}
    try {
      const { container } = await render(<DocumentAppView app={app} />)
      await waitFor(() => buttonNamed(container, 'Run App'))
      await click(buttonNamed(container, 'Run App')!)
      const connected = await connectAppFrame(container)
      close = connected.close
      const select = (text: string) =>
        act(() =>
          call<PageMethods, 'frame.selection'>(
            connected.rpc,
            'frame.selection',
            { text, rowId: 'row' },
          ),
        )
      await select('Saved row')
      expect(buttonNamed(container, 'Ask about selection')).toBeDefined()
      let saving!: Promise<unknown>
      await act(async () => {
        saving = call<PageMethods, 'state.set'>(connected.rpc, 'state.set', {
          name: 'rows',
          key: 'row',
          value: 'Unsaved row',
        }).catch(() => undefined)
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
      expect(buttonNamed(container, 'Ask about selection')).toBeUndefined()
      await select('Unsaved row')
      if (failed) {
        await act(async () => {
          release()
          await saving
        })
        await waitFor(() => buttonNamed(container, 'Retry save'))
      }
      const ask = buttonNamed(container, /Ask about/)!
      expect(ask.disabled).toBe(true)
      expect(container.textContent).toContain(
        'Save the App changes before asking',
      )
      await click(ask)
      expect(useComposerReferences.getState().take()).toEqual([])
      if (failed) {
        store.fail(false)
        await click(buttonNamed(container, 'Retry save')!)
      } else {
        await act(async () => {
          release()
          await saving
        })
      }
      await waitFor(() => !buttonNamed(container, /Ask about/)!.disabled)
      expect(buttonNamed(container, 'Ask about selection')).toBeUndefined()
      await click(buttonNamed(container, 'Ask about this App')!)
      const [reference] = useComposerReferences.getState().take()
      expect(reference).toMatchObject({ location: { revision: '3' } })
      expect(reference?.excerpt).toBeUndefined()
      await select('Saved updated row')
      await click(buttonNamed(container, 'Ask about selection')!)
      expect(useComposerReferences.getState().take()[0]).toMatchObject({
        location: { revision: '3' },
        excerpt: JSON.stringify({
          selection: { text: 'Saved updated row', rowId: 'row' },
        }),
      })
    } finally {
      release()
      close()
      compile.mockRestore()
    }
  }, 20_000)
}
