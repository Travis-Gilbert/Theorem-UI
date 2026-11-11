import { act } from 'react'
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import * as esbuild from 'esbuild-wasm'
import { EditorView } from '@codemirror/view'
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { TheoremPartRenderers } from '@/components/chat/theorem-parts'
import { BLOCK_SANDBOX } from '@/lib/blocks/executor'
import * as hosted from '@/lib/blocks/hosted-app'
import { appDocumentFixture } from '../../../test/blocks/app-documents'
import {
  buttonNamed,
  cleanup,
  click,
  render,
  waitFor,
} from '../../../test/blocks/render'
import { ArtifactPanel, download } from './artifact-panel'
import { ArtifactActions } from './artifact-actions'
import { readArtifact } from './artifact-model'
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

function message(revision: number, content?: string): ThreadMessageLike {
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
            ...(content && { content, language: 'html' }),
          },
        },
      },
    ],
  }
}

function appArtifact() {
  const content = message(1).content
  if (typeof content === 'string' || content[0]?.type !== 'data')
    throw new Error('Expected artifact fixture')
  return readArtifact(content[0].data)!
}

// Opening an App in the workspace runs it; tests compile its page with the
// Node build of esbuild instead of the browser's wasm one.
const originalHosted = hosted.hostedAppDocument
let compile:
  ReturnType<typeof spyOn<typeof hosted, 'hostedAppDocument'>> | undefined
beforeEach(() => {
  compile = spyOn(hosted, 'hostedAppDocument').mockImplementation(
    (html, _esbuild, options) => originalHosted(html, esbuild, options),
  )
})

afterEach(async () => {
  await cleanup()
  compile?.mockRestore()
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
    await waitFor(() => container.querySelector('[data-revision="2"]'))
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

test('an older revision opens its pinned source, labeled, while the live App stays mounted', async () => {
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  const store = await appDocumentFixture()
  const get = spyOn(window, 'fetch').mockImplementation(
    Object.assign(async () => Response.json(store.saved()), {
      preconnect: window.fetch.preconnect,
    }),
  )
  try {
    const { container } = await render(
      <Harness
        messages={[message(1, '<p>Original revision</p>'), message(2)]}
      />,
    )
    await waitFor(() => buttonNamed(container, 'Edit source'))
    await click(container.querySelector('[aria-label="Previous version"]')!)
    const revision = await waitFor(() =>
      container.querySelector('[data-slot="app-revision"]'),
    )
    expect(revision.textContent).toContain('Saved revision 1')
    expect(revision.textContent).toContain('not saved')
    await waitFor(() => revision.querySelector('iframe'), 10_000)
    expect(revision.querySelector('iframe')?.getAttribute('sandbox')).toBe(
      BLOCK_SANDBOX,
    )
    expect(compile?.mock.calls.map((call) => call[0])).toContain(
      '<p>Original revision</p>',
    )
    // The live App is still there, behind the revision.
    expect(buttonNamed(container, 'Edit source')).toBeDefined()
    await click(buttonNamed(container, 'Open latest')!)
    expect(container.querySelector('[data-slot="app-revision"]')).toBeNull()
    expect(container.textContent).toContain('v2 of 2')
  } finally {
    get.mockRestore()
    window.location.href = originalUrl
  }
}, 20_000)

test("an older revision's frame keeps the page's look as it changes", async () => {
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  const store = await appDocumentFixture()
  const get = spyOn(window, 'fetch').mockImplementation(
    Object.assign(async () => Response.json(store.saved()), {
      preconnect: window.fetch.preconnect,
    }),
  )
  const followed: Array<HTMLIFrameElement> = []
  const follow = spyOn(hosted, 'followTheme').mockImplementation(
    (connection) => {
      followed.push(
        (connection as unknown as { frame: HTMLIFrameElement }).frame,
      )
      return () => {}
    },
  )
  try {
    const { container } = await render(
      <Harness
        messages={[message(1, '<p>Original revision</p>'), message(2)]}
      />,
    )
    await waitFor(() => buttonNamed(container, 'Edit source'))
    await click(container.querySelector('[aria-label="Previous version"]')!)
    const revision = await waitFor(() =>
      container.querySelector('[data-slot="app-revision"]'),
    )
    const frame = await waitFor(() => revision.querySelector('iframe'), 10_000)
    expect(followed).toContain(frame)
  } finally {
    follow.mockRestore()
    get.mockRestore()
    window.location.href = originalUrl
  }
}, 20_000)

test('App copy and shared download resolve canonical source rather than the empty artifact placeholder', async () => {
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  const store = await appDocumentFixture()
  await store.remote('<!doctype html><h1>Saved App source</h1>')
  const get = spyOn(window, 'fetch').mockImplementation(
    Object.assign(async () => Response.json(store.saved()), {
      preconnect: window.fetch.preconnect,
    }),
  )
  const copied: string[] = []
  const clipboard = spyOn(navigator.clipboard, 'writeText').mockImplementation(
    async (text) => {
      copied.push(text)
    },
  )
  const blobs: Blob[] = []
  const urls = spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob)
    return 'blob:test-export'
  })
  const anchor = spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    () => {},
  )
  try {
    const { container } = await render(<Harness messages={[message(1)]} />)
    await waitFor(() => buttonNamed(container, 'Edit source'))
    await click(container.querySelector('[aria-label^="Copy"]')!)
    await waitFor(() => copied.length > 0, 500)
    expect(copied).toEqual(['<!doctype html><h1>Saved App source</h1>'])
    const artifact = appArtifact()
    await act(() => download(artifact))
    expect(await blobs[0]!.text()).toBe(copied[0]!)
    expect(blobs[0]!.type).toStartWith('text/html')
    expect(
      container.querySelector('[aria-label="Download App source"]'),
    ).not.toBeNull()
  } finally {
    anchor.mockRestore()
    urls.mockRestore()
    clipboard.mockRestore()
    get.mockRestore()
    window.location.href = originalUrl
  }
})

test('App download refuses failed canonical loading instead of saving an empty placeholder', async () => {
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  const get = spyOn(window, 'fetch').mockImplementation(
    Object.assign(
      async () =>
        Response.json(
          { detail: 'Document source unavailable' },
          { status: 503 },
        ),
      { preconnect: window.fetch.preconnect },
    ),
  )
  const urls = spyOn(URL, 'createObjectURL')
  const anchor = spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    () => {},
  )
  try {
    const artifact = appArtifact()
    await expect(download(artifact)).rejects.toThrow(
      'Document source unavailable',
    )
    expect(urls).not.toHaveBeenCalled()
  } finally {
    anchor.mockRestore()
    urls.mockRestore()
    get.mockRestore()
    window.location.href = originalUrl
  }
})

for (const status of [401, 403]) {
  test(`App actions refuse cached source after fresh authorization returns ${status}`, async () => {
    const originalUrl = window.location.href
    window.location.href = 'https://theorem.test/'
    const store = await appDocumentFixture()
    let denied = false
    const get = spyOn(window, 'fetch').mockImplementation(
      Object.assign(
        async () =>
          denied
            ? Response.json({ detail: 'App source access denied' }, { status })
            : Response.json(store.saved()),
        { preconnect: window.fetch.preconnect },
      ),
    )
    const copied: string[] = []
    const clipboard = spyOn(
      navigator.clipboard,
      'writeText',
    ).mockImplementation(async (text) => {
      copied.push(text)
    })
    const urls = spyOn(URL, 'createObjectURL')
    try {
      const { container } = await render(<Harness messages={[message(1)]} />)
      await waitFor(() => buttonNamed(container, 'Edit source'))
      await click(container.querySelector('[aria-label="Copy App source"]')!)
      await waitFor(() =>
        container.querySelector<HTMLButtonElement>('[aria-label="Copied"]'),
      )
      expect(copied).toEqual(['<p>Original</p>'])
      denied = true
      await click(
        container.querySelector<HTMLButtonElement>('[aria-label="Copied"]')!,
      )
      await waitFor(() => container.querySelector('[role="alert"]'))
      expect(container.textContent).toContain('App source access denied')
      expect(
        container.querySelector<HTMLButtonElement>('[aria-label="Copied"]'),
      ).toBeNull()
      expect(copied).toHaveLength(1)
      const artifact = appArtifact()
      await expect(download(artifact)).rejects.toThrow(
        'App source access denied',
      )
      expect(urls).not.toHaveBeenCalled()
    } finally {
      urls.mockRestore()
      clipboard.mockRestore()
      get.mockRestore()
      window.location.href = originalUrl
    }
  })
}

test('shared card download reports source failure and clipboard failure never reports Copied', async () => {
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  const store = await appDocumentFixture()
  let denied = false
  const get = spyOn(window, 'fetch').mockImplementation(
    Object.assign(
      async () =>
        denied
          ? Response.json(
              { detail: 'App source access denied' },
              { status: 403 },
            )
          : Response.json(store.saved()),
      { preconnect: window.fetch.preconnect },
    ),
  )
  const clipboard = spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
    new Error('Clipboard permission denied'),
  )
  const artifact = appArtifact()
  try {
    const { container, rerender } = await render(
      <ArtifactActions artifact={artifact} copy />,
    )
    await click(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Copy App source"]',
      )!,
    )
    await waitFor(() => container.querySelector('[role="alert"]'))
    expect(container.textContent).toContain('Clipboard permission denied')
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Copied"]'),
    ).toBeNull()
    denied = true
    await rerender(<ArtifactActions artifact={artifact} />)
    expect(container.querySelector('[aria-label="Copy App source"]')).toBeNull()
    await click(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Download App source"]',
      )!,
    )
    await waitFor(() =>
      container.textContent.includes('App source access denied'),
    )
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  } finally {
    clipboard.mockRestore()
    get.mockRestore()
    window.location.href = originalUrl
  }
})

test('source actions reject missing references and empty content while inline exports keep their formats', async () => {
  const artifact = appArtifact()
  const blobs: Blob[] = []
  const names: string[] = []
  const urls = spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob)
    return 'blob:source-format'
  })
  const anchor = spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    function (this: HTMLAnchorElement) {
      names.push(this.download)
    },
  )
  try {
    await expect(
      download({ ...artifact, documentId: undefined }),
    ).rejects.toThrow('saved document reference')
    await expect(
      download({ ...artifact, kind: 'document', content: '' }),
    ).rejects.toThrow('no saved content')
    expect(blobs).toHaveLength(0)
    for (const [kind, content, type, name] of [
      ['document', '# Saved document', 'text/markdown', 'app.md'],
      ['code', 'const value = 1', 'text/plain', 'app.txt'],
    ]) {
      await download({
        ...artifact,
        kind: kind!,
        rendererId: kind!,
        content: content!,
      })
      const saved = blobs.at(-1)!
      expect(await saved.text()).toBe(content!)
      expect(saved.type).toStartWith(type!)
      expect(names.at(-1)).toBe(name)
    }
    const { container } = await render(
      <ArtifactActions
        artifact={{ ...artifact, kind: 'document', content: '# Inline' }}
        copy
      />,
    )
    expect(container.querySelector('[aria-label="Copy"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Download"]')).not.toBeNull()
  } finally {
    anchor.mockRestore()
    urls.mockRestore()
  }
})

test('source actions stay disabled until the fresh document read and clipboard write finish', async () => {
  const originalUrl = window.location.href
  window.location.href = 'https://theorem.test/'
  const store = await appDocumentFixture()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const get = spyOn(window, 'fetch').mockImplementation(
    Object.assign(
      async () => {
        await gate
        return Response.json(store.saved())
      },
      { preconnect: window.fetch.preconnect },
    ),
  )
  const clipboard = spyOn(navigator.clipboard, 'writeText').mockResolvedValue(
    undefined,
  )
  try {
    const { container } = await render(
      <ArtifactActions artifact={appArtifact()} copy />,
    )
    const copy = container.querySelector<HTMLButtonElement>(
      '[aria-label="Copy App source"]',
    )!
    const downloadButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Download App source"]',
    )!
    expect(copy.disabled).toBe(false)
    expect(downloadButton.disabled).toBe(false)
    await click(copy)
    expect(copy.disabled).toBe(true)
    expect(downloadButton.disabled).toBe(true)
    expect(clipboard).not.toHaveBeenCalled()
    await act(async () => release())
    await waitFor(() => container.querySelector('[aria-label="Copied"]'))
    expect(copy.disabled).toBe(false)
    expect(downloadButton.disabled).toBe(false)
  } finally {
    release()
    clipboard.mockRestore()
    get.mockRestore()
    window.location.href = originalUrl
  }
})

function ThreadHarness({ messages }: { messages: ThreadMessageLike[] }) {
  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: false,
    onNew: async () => {},
    convertMessage: (item: ThreadMessageLike) => item,
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TheoremPartRenderers />
      <ThreadPrimitive.Messages
        components={{ Message: () => <MessagePrimitive.Parts /> }}
      />
    </AssistantRuntimeProvider>
  )
}

test('an older revision card downloads the source its message pinned, not the current App', async () => {
  const fetch = spyOn(window, 'fetch')
  try {
    const { container } = await render(
      <ThreadHarness
        messages={[
          message(1, '<p>Original revision</p>'),
          message(2, '<p>Current revision</p>'),
        ]}
      />,
    )
    const downloads = await waitFor(() => {
      const found = container.querySelectorAll<HTMLButtonElement>(
        '[data-slot="theorem-artifact-card"] [aria-label="Download App source"]',
      )
      return found.length === 2 ? found : undefined
    })
    expect(downloads[0]!.title).toStartWith("Download this revision's source")
    expect(downloads[1]!.title).toStartWith('Download current saved source')
    await click(downloads[0]!)
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    fetch.mockRestore()
  }
}, 20_000)
