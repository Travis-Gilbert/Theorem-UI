import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  spyOn,
  test,
} from 'bun:test'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  SimpleTextAttachmentAdapter,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, useLayoutEffect } from 'react'
import { cleanup, click, render, waitFor } from '../../../test/blocks/render'
import { useLiveRuns } from '@/lib/theorem/runtime'
import { useComposerReferences } from './composer-references'
import {
  ComposerRunInputStatus,
  useComposerRunInput,
} from './composer-run-input'
import type { ComposerRunInput } from './composer-run-input'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'

let aui: ReturnType<typeof useAui>
let control: ComposerRunInput
let normalSends = 0
let cancellations = 0
let requests: Array<{ path: string; key: string | null; text: string }>
let response: (request: Request, text: string) => Promise<Response>
let fetchSpy: ReturnType<typeof spyOn<typeof window, 'fetch'>>

const page = (
  window as unknown as {
    happyDOM: {
      setURL: (url: string) => void
      settings: { device: { prefersReducedMotion: string } }
    }
  }
).happyDOM
let previousMotion: string
beforeAll(() => {
  page.setURL('http://localhost:3000/')
  previousMotion = page.settings.device.prefersReducedMotion
  page.settings.device.prefersReducedMotion = 'reduce'
})
afterAll(() => {
  page.setURL('about:blank')
  page.settings.device.prefersReducedMotion = previousMotion
})

function acknowledged(request: Request, text: string) {
  const runId = new URL(request.url).pathname.split('/').at(-2)!
  return Response.json({
    runId,
    idempotencyKey: `chat-command:${request.headers.get('Idempotency-Key')}`,
    payload: {
      part: { type: 'user_input', inputId: 'input-1', text, status: 'queued' },
    },
  })
}

beforeEach(() => {
  normalSends = 0
  cancellations = 0
  requests = []
  useLiveRuns.setState({}, true)
  useComposerReferences.setState({ references: [] })
  response = async (request, text) => acknowledged(request, text)
  fetchSpy = spyOn(window, 'fetch').mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path.endsWith('/bootstrap')) return Response.json({ csrfToken: 'csrf' })
    if (path.endsWith('/organization'))
      return Response.json({
        schema: 'theorem-organization/1',
        projects: [],
        threads: [],
        librarian: {
          state: 'idle',
          paused: false,
          queued: 0,
          recent: [],
          jobs: { membership: { enabled: false }, summary: { enabled: false } },
        },
      })
    if (request.method === 'GET')
      return Response.json({ items: [], groups: [], threads: [], projects: [] })
    const body = await request.json()
    requests.push({
      path,
      key: request.headers.get('Idempotency-Key'),
      text: body.text,
    })
    return response(request, body.text)
  }) as typeof fetch)
})

afterEach(async () => {
  await cleanup()
  fetchSpy.mockRestore()
})

function Form({ initial, full = false }: { initial: string; full?: boolean }) {
  const client = useAui()
  const input = useComposerRunInput()
  const text = useAuiState((s) => s.composer.text)
  useLayoutEffect(() => {
    aui = client
    control = input
  }, [client, input])
  useLayoutEffect(() => {
    client.composer.setText(initial)
  }, [client, initial])
  if (full) return <Thread autoFocus={false} />
  return (
    <ComposerPrimitive.Root
      onSubmit={(event) => {
        if (input.submit()) event.preventDefault()
      }}
    >
      <output>{text}</output>
      <button type="submit" disabled={input.active && !input.canSend}>
        Send
      </button>
      <ComposerRunInputStatus input={input} />
    </ComposerPrimitive.Root>
  )
}

function Harness({
  id,
  running = true,
  initial = 'Use the second option.',
  full = false,
}: {
  id: string
  running?: boolean
  initial?: string
  full?: boolean
}) {
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: full
      ? [
          {
            id: 'user',
            role: 'user',
            content: [{ type: 'text', text: 'Compare these options.' }],
          },
        ]
      : [],
    convertMessage: (message) => message,
    isRunning: running,
    onNew: async () => {
      normalSends++
    },
    onCancel: async () => {
      cancellations++
    },
    adapters: {
      attachments: new SimpleTextAttachmentAdapter(),
      threadList: {
        threadId: id,
        threads: [{ id, remoteId: id, status: 'regular' }],
      },
    },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <AssistantRuntimeProvider runtime={runtime}>
        <Form initial={initial} full={full} />
      </AssistantRuntimeProvider>
    </QueryClientProvider>
  )
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

async function open(running = true) {
  const id = crypto.randomUUID()
  if (running) useLiveRuns.setState({ [id]: `run-${id}` })
  const view = await render(<Harness id={id} running={running} />)
  return { ...view, id, send: view.container.querySelector('button')! }
}

test('the form sends active text through the inbox and clears only after acceptance', async () => {
  let finish!: () => void
  response = (request, text) =>
    new Promise((resolve) => {
      finish = () => resolve(acknowledged(request, text))
    })
  const view = await open()
  await waitFor(() => control.canSend)
  expect(control.status).toContain(
    'Model and tool settings apply to the next turn',
  )
  await click(view.send)
  await waitFor(() => requests.length === 1)
  expect(control.pending).toBe(true)
  expect(aui.composer.getState().text).toBe('Use the second option.')
  expect(normalSends).toBe(0)
  expect(cancellations).toBe(0)
  await act(async () => {
    control.submit()
    finish()
  })
  await waitFor(() => !control.pending)
  expect(requests).toHaveLength(1)
  expect(aui.composer.getState().text).toBe('')
})

test('typing during input HTTP stays editable and is not cleared by the earlier acknowledgement', async () => {
  let finish!: () => void
  response = (request, text) =>
    new Promise((resolve) => {
      finish = () => resolve(acknowledged(request, text))
    })
  const view = await open()
  await click(view.send)
  await waitFor(() => requests.length === 1)
  await act(async () => {
    aui.composer.setText('A later draft')
  })
  await act(async () => {
    finish()
  })
  await waitFor(() => !control.pending)
  expect(aui.composer.getState().text).toBe('A later draft')
  expect(control.canSend).toBe(true)
})

test('acknowledgement after a thread switch cannot clear that other thread', async () => {
  let finish!: () => void
  response = (request, text) =>
    new Promise((resolve) => {
      finish = () => resolve(acknowledged(request, text))
    })
  const view = await open()
  await click(view.send)
  await waitFor(() => requests.length === 1)
  const other = crypto.randomUUID()
  await view.rerender(
    <Harness id={other} running={false} initial="Use the second option." />,
  )
  await waitFor(() => aui.threadListItem.getState().remoteId === other)
  await act(async () => {
    finish()
  })
  await waitFor(() => !control.pending)
  expect(aui.composer.getState().text).toBe('Use the second option.')
  expect(requests[0]!.path).toContain(`run-${view.id}`)
})

test('a missing run id and unsupported attachments or references keep the draft', async () => {
  const id = crypto.randomUUID()
  const view = await render(<Harness id={id} />)
  expect(control.active).toBe(true)
  expect(control.canSend).toBe(false)
  expect(control.status).toContain('Waiting')
  await act(async () => {
    expect(control.submit()).toBe(true)
  })
  expect(requests).toHaveLength(0)

  await act(async () => {
    useLiveRuns.setState({ [id]: 'run-live' })
  })
  await act(async () => {
    await aui.composer.addAttachment(
      new File(['notes'], 'notes.txt', { type: 'text/plain' }),
    )
  })
  expect(control.canSend).toBe(false)
  expect(control.status).toContain('Attachments')
  await act(async () => {
    control.submit()
  })
  expect(requests).toHaveLength(0)
  expect(aui.composer.getState().attachments).toHaveLength(1)
  expect(view.container.querySelector('output')?.textContent).toBe(
    'Use the second option.',
  )
})

test('context references from the store or runConfig cannot disappear into a text-only input', async () => {
  await open()
  await act(async () => {
    useComposerReferences.getState().add({
      location: {
        resource: {
          kind: 'graph-object',
          objectId: 'app-one',
          objectType: 'theorem.app',
        },
      },
    })
  })
  expect(control.canSend).toBe(false)
  await act(async () => {
    control.submit()
  })
  expect(requests).toHaveLength(0)
  expect(useComposerReferences.getState().references).toHaveLength(1)
  await act(async () => {
    useComposerReferences.setState({ references: [] })
    aui.composer.setRunConfig({
      custom: {
        theoremTurnOptions: {
          contextReferences: [{ resource: 'existing-context' }],
        },
      },
    })
  })
  expect(control.canSend).toBe(false)
  await act(async () => {
    control.submit()
  })
  expect(requests).toHaveLength(0)
  expect(aui.composer.getState().text).toBe('Use the second option.')
})

test('uncertain delivery blocks a changed draft and Retry replays only the original envelope', async () => {
  response = async () => {
    throw new TypeError('Lost reply')
  }
  const view = await open()
  await click(view.send)
  await waitFor(() => control.canRetry)
  const original = requests[0]!
  await act(async () => {
    aui.composer.setText('Do not send this yet')
  })
  expect(control.canSend).toBe(false)
  await act(async () => {
    control.submit()
  })
  expect(requests).toHaveLength(1)
  response = async (request, text) => acknowledged(request, text)
  await click(view.container.querySelectorAll('button')[1]!)
  await waitFor(() => requests.length === 2 && !control.pending)
  expect(requests[1]).toEqual(original)
  expect(aui.composer.getState().text).toBe('Do not send this yet')
  expect(normalSends).toBe(0)
})

test('a known closed run keeps the draft and permits ordinary submission only once idle', async () => {
  response = async () =>
    Response.json({ code: 'run_input_closed' }, { status: 409 })
  const view = await open()
  await click(view.send)
  await waitFor(() => control.status?.includes('run finished'))
  expect(aui.composer.getState().text).toBe('Use the second option.')
  expect(control.canSend).toBe(false)
  expect(normalSends).toBe(0)
  await act(async () => {
    useLiveRuns.setState({ [view.id]: undefined })
  })
  await view.rerender(<Harness id={view.id} running={false} />)
  await waitFor(() => !control.active)
  await click(view.send)
  await waitFor(() => normalSends === 1)
  expect(requests).toHaveLength(1)
  expect(control.status).toBeUndefined()
})

test('an ordinary idle send falls through to assistant-ui once', async () => {
  const view = await open(false)
  expect(control.active).toBe(false)
  await click(view.send)
  await waitFor(() => normalSends === 1)
  expect(requests).toHaveLength(0)
})

test('an unmounted composer cannot clear a newly mounted draft when its earlier input is accepted', async () => {
  let finish!: () => void
  response = (request, text) =>
    new Promise((resolve) => {
      finish = () => resolve(acknowledged(request, text))
    })
  const first = await open()
  await click(first.send)
  await waitFor(() => requests.length === 1)
  await first.rerender(null)
  await render(<Harness id={first.id} initial="Use the second option." />)
  await act(async () => {
    finish()
  })
  await waitFor(() => !control.pending)
  expect(aui.composer.getState().text).toBe('Use the second option.')
  expect(control.status).toContain('Message accepted')
})

test('remounting while HTTP is pending can still restore the original draft when its reply is lost', async () => {
  let fail!: () => void
  response = () =>
    new Promise((_, reject) => {
      fail = () => reject(new TypeError('Lost reply'))
    })
  const first = await open()
  await click(first.send)
  await waitFor(() => requests.length === 1)
  await first.rerender(null)
  await render(<Harness id={first.id} initial="" />)
  expect(aui.composer.getState().text).toBe('')
  await act(async () => {
    fail()
  })
  await waitFor(() => control.canRetry)
  expect(aui.composer.getState().text).toBe('Use the second option.')
})

test('remount restores an unresolved input into an empty draft and retries its original identity', async () => {
  response = async () => {
    throw new TypeError('Lost reply')
  }
  const first = await open()
  await click(first.send)
  await waitFor(() => control.canRetry)
  const original = requests[0]
  await first.rerender(null)
  const next = await render(<Harness id={first.id} initial="" />)
  await waitFor(() => aui.composer.getState().text === 'Use the second option.')
  response = async (request, text) => acknowledged(request, text)
  await click(next.container.querySelectorAll('button')[1]!)
  await waitFor(() => requests.length === 2 && !control.pending)
  expect(requests[1]).toEqual(original)
  expect(aui.composer.getState().text).toBe('')
})

test('Stop retrying preserves later typing, exposes the old text, and never sends automatically', async () => {
  response = async () => {
    throw new TypeError('Lost reply')
  }
  const view = await open()
  await click(view.send)
  await waitFor(() => control.canRetry)
  await act(async () => {
    aui.composer.setText('A different draft')
  })
  expect(view.container.querySelector('details pre')?.textContent).toBe(
    'Use the second option.',
  )
  expect(view.container.textContent).toContain(
    'Delivery may already have happened',
  )
  const stop = [...view.container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Stop retrying',
  )!
  await click(stop)
  expect(aui.composer.getState().text).toBe('A different draft')
  expect(view.container.querySelector('details pre')?.textContent).toBe(
    'Use the second option.',
  )
  expect(control.status).toContain('Earlier delivery is still unknown')
  expect(control.canSend).toBe(true)
  expect(requests).toHaveLength(1)
  expect(normalSends).toBe(0)
})

test('the real Thread keeps Send and Stop available and retains the document until its input is accepted', async () => {
  const id = crypto.randomUUID()
  useLiveRuns.setState({ [id]: `run-${id}` })
  let finish!: () => void
  response = (request, text) =>
    new Promise((resolve) => {
      finish = () => resolve(acknowledged(request, text))
    })
  const { container } = await render(<Harness id={id} full />)
  const send = await waitFor(() =>
    container.querySelector<HTMLButtonElement>('[aria-label="Send message"]'),
  )
  const stop = container.querySelector<HTMLButtonElement>(
    '[aria-label="Stop generating"]',
  )
  expect(stop).not.toBeNull()
  await waitFor(() => !send.disabled)
  const editor = await waitFor(() => container.querySelector('.ProseMirror'))
  await click(send)
  await waitFor(() => requests.length === 1)
  expect(editor.textContent).toBe('Use the second option.')
  expect(editor.getAttribute('contenteditable')).toBe('true')
  expect(send.disabled).toBe(true)
  expect(stop?.disabled).toBe(false)
  expect(cancellations).toBe(0)
  expect(normalSends).toBe(0)
  await act(async () => {
    finish()
  })
  await waitFor(() => editor.textContent === '')
  expect(requests[0]!.path).toBe(`/v1/theorem/agent/stream/run-${id}/commands`)
})
