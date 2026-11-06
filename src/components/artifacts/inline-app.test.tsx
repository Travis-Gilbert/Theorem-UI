import { afterEach, expect, spyOn, test } from 'bun:test'
import * as esbuild from 'esbuild-wasm'
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { TheoremPartRenderers } from '@/components/chat/theorem-parts'
import * as hosted from '@/lib/blocks/hosted-app'
import { BLOCK_SANDBOX } from '@/lib/blocks/executor'
import { appDocumentFixture } from '../../../test/blocks/app-documents'
import {
  buttonNamed,
  cleanup,
  click,
  render,
  waitFor,
} from '../../../test/blocks/render'
import { useArtifactView } from './artifact-view'

const originalHosted = hosted.hostedAppDocument
function Message() {
  return <MessagePrimitive.Parts />
}
function Harness({
  kind = 'app',
  documentId = 'inline-app-test',
  running = false,
}: {
  kind?: string
  documentId?: string
  running?: boolean
}) {
  const messages: ThreadMessageLike[] = [
    {
      id: 'result',
      role: 'assistant',
      status: running
        ? { type: 'running' }
        : { type: 'complete', reason: 'stop' },
      content: [
        {
          type: 'data',
          name: 'theorem-artifact',
          data: {
            artifactId: 'inline-result',
            artifactRevision: '1',
            artifactKind: kind,
            rendererId: `theorem-${kind}`,
            lifecycle: 'ready',
            patchSequence: 1,
            payload: {
              title: 'Browser shortlist',
              documentId,
              revision: { position: 1 },
              content: '# Document',
            },
          },
        },
      ],
    },
  ]
  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: running,
    onNew: async () => {},
    convertMessage: (item: ThreadMessageLike) => item,
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TheoremPartRenderers />
      <ThreadPrimitive.Messages components={{ Message }} />
    </AssistantRuntimeProvider>
  )
}

afterEach(async () => {
  await cleanup()
  useArtifactView.getState().reset()
})

test('an App card starts its saved App inline only after a click, stops, and can open the larger view', async () => {
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  const store = await appDocumentFixture()
  const fetch = spyOn(window, 'fetch').mockImplementation(
    Object.assign(async () => Response.json(store.saved()), {
      preconnect: window.fetch.preconnect,
    }),
  )
  const compile = spyOn(hosted, 'hostedAppDocument').mockImplementation(
    (html) => originalHosted(html, esbuild),
  )
  try {
    const { container } = await render(<Harness />)
    const card = await waitFor(() =>
      container.querySelector('[aria-label="Open Browser shortlist"]'),
    )
    expect(container.querySelector('iframe')).toBeNull()
    expect(compile).not.toHaveBeenCalled()
    await click(card)
    const frame = await waitFor(() => container.querySelector('iframe'), 10_000)
    expect(frame.getAttribute('sandbox')).toBe(BLOCK_SANDBOX)
    expect(useArtifactView.getState().openId).toBeUndefined()
    await click(buttonNamed(container, 'Stop App')!)
    expect(container.querySelector('iframe')).toBeNull()
    await click(buttonNamed(container, 'Run App')!)
    await waitFor(() => container.querySelector('iframe'), 10_000)
    await click(container.querySelector('[aria-label="Open in larger view"]')!)
    expect(useArtifactView.getState().openId).toBe('inline-result')
    expect(container.querySelector('iframe')).toBeNull()
  } finally {
    compile.mockRestore()
    fetch.mockRestore()
    window.location.href = originalUrl
  }
}, 20_000)

test('a document card keeps opening the document panel', async () => {
  const { container } = await render(<Harness kind="document" />)
  await click(
    await waitFor(() =>
      container.querySelector('[aria-label="Open Browser shortlist"]'),
    ),
  )
  expect(useArtifactView.getState().openId).toBe('inline-result')
  expect(container.querySelector('iframe')).toBeNull()
})

for (const kind of ['app', 'document']) {
  test(`a newly arriving ${kind} preserves the intended follow behavior`, async () => {
    const { container } = await render(<Harness kind={kind} running />)
    await waitFor(() =>
      container.querySelector('[aria-label="Open Browser shortlist"]'),
    )
    expect(useArtifactView.getState().openId).toBe(
      kind === 'app' ? undefined : 'inline-result',
    )
    expect(container.querySelector('iframe')).toBeNull()
  })
}

test('an App without a saved document reports the missing reference inline', async () => {
  const { container } = await render(<Harness documentId="" />)
  await click(
    await waitFor(() =>
      container.querySelector('[aria-label="Open Browser shortlist"]'),
    ),
  )
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "This App couldn't be opened.",
  )
  expect(container.querySelector('iframe')).toBeNull()
  expect(useArtifactView.getState().openId).toBeUndefined()
})

test('a failed App load shows the actual failure inline and never starts a frame', async () => {
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  const fetch = spyOn(window, 'fetch').mockImplementation(
    Object.assign(
      async () =>
        Response.json({ detail: 'App source unavailable' }, { status: 503 }),
      { preconnect: window.fetch.preconnect },
    ),
  )
  try {
    const { container } = await render(
      <Harness documentId="inline-app-unavailable" />,
    )
    await click(
      await waitFor(() =>
        container.querySelector('[aria-label="Open Browser shortlist"]'),
      ),
    )
    await waitFor(() => container.querySelector('[role="alert"]'))
    expect(container.textContent).toContain('App source unavailable')
    expect(container.querySelector('iframe')).toBeNull()
    expect(useArtifactView.getState().openId).toBeUndefined()
  } finally {
    fetch.mockRestore()
    window.location.href = originalUrl
  }
})

test('replacing a card with another saved App requires a new click', async () => {
  const { container, rerender } = await render(<Harness documentId="" />)
  await click(
    await waitFor(() =>
      container.querySelector('[aria-label="Open Browser shortlist"]'),
    ),
  )
  expect(container.querySelector('[data-slot="inline-app"]')).not.toBeNull()
  await rerender(<Harness documentId="replacement-app" />)
  expect(container.querySelector('[data-slot="inline-app"]')).toBeNull()
  expect(container.querySelector('[aria-expanded="false"]')).not.toBeNull()
})
