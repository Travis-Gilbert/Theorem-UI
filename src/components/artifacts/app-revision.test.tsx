import { act } from 'react'
import { afterEach, expect, spyOn, test } from 'bun:test'
import { EditorView } from '@codemirror/view'
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { appDocumentFixture } from '../../../test/blocks/app-documents'
import {
  buttonNamed,
  cleanup,
  click,
  render,
  waitFor,
} from '../../../test/blocks/render'
import { ArtifactPanel } from './artifact-panel'
import { useArtifactView } from './artifact-view'

function Harness({ messages }: { messages: ThreadMessageLike[] }) {
  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: false,
    onNew: async () => {},
    convertMessage: (item: ThreadMessageLike) => item,
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ArtifactPanel artifactId="app-draft-result" onClose={() => {}} />
    </AssistantRuntimeProvider>
  )
}

function message(revision: number): ThreadMessageLike {
  return {
    id: `result-${revision}`,
    role: 'assistant',
    content: [
      {
        type: 'data',
        name: 'theorem-artifact',
        data: {
          artifactId: 'app-draft-result',
          artifactRevision: String(revision),
          artifactKind: 'app',
          rendererId: 'theorem-app',
          patchSequence: revision,
          lifecycle: 'ready',
          payload: {
            documentId: 'app-draft-document',
            title: 'App',
            revision: { position: revision },
          },
        },
      },
    ],
  }
}

afterEach(async () => {
  await cleanup()
  useArtifactView.getState().reset()
})

test('a newly published App revision refreshes source without discarding the open editor draft', async () => {
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  const store = await appDocumentFixture()
  const get = spyOn(window, 'fetch').mockImplementation(
    Object.assign(async () => Response.json(store.saved()), {
      preconnect: window.fetch.preconnect,
    }),
  )
  try {
    const { container, rerender } = await render(
      <Harness messages={[message(1)]} />,
    )
    await waitFor(() => buttonNamed(container, 'Edit source'))
    await click(buttonNamed(container, 'Edit source')!)
    const content = await waitFor(() =>
      container.querySelector<HTMLElement>('.cm-content'),
    )
    const editor = EditorView.findFromDOM(content)!
    await act(() =>
      editor.dispatch({
        changes: {
          from: 0,
          to: editor.state.doc.length,
          insert: '<p>My unsaved draft</p>',
        },
      }),
    )
    expect(content.textContent).toContain('My unsaved draft')
    await store.remote('<p>Worker published source</p>')
    await rerender(<Harness messages={[message(1), message(2)]} />)
    await waitFor(() => container.textContent.includes('Current revision 2'))
    expect(container.querySelector('.cm-content') === content).toBe(true)
    expect(content.textContent).toContain('My unsaved draft')
    await click(container.querySelector('[aria-label="Previous version"]')!)
    expect(container.textContent).toContain('v1 of 2')
    expect(container.querySelector('.cm-content') === content).toBe(true)
    await click(container.querySelector('[aria-label="Next version"]')!)
    expect(container.textContent).toContain('v2 of 2')
    await click(buttonNamed(container, 'Save source')!)
    await waitFor(() => container.querySelector('[role="alert"]'))
    expect(container.textContent).toContain('changed since you started editing')
    expect(content.textContent).toContain('My unsaved draft')
    expect(store.writes).toHaveLength(0)
    await click(buttonNamed(container, 'Cancel edit')!)
    await click(buttonNamed(container, 'Edit source')!)
    expect(container.querySelector('.cm-content')?.textContent).toContain(
      'Worker published source',
    )
  } finally {
    get.mockRestore()
    window.location.href = originalUrl
  }
}, 20_000)
