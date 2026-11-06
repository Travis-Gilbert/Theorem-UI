import { act, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'bun:test'
import {
  AssistantRuntimeProvider,
  useAui,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { AppendMessage, ThreadMessageLike } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Thread } from '../assistant-ui/elements/thread.aui'
import { cleanup, render, waitFor } from '../../../test/blocks/render'
import { useWebSearch, webTurnOptions } from './composer-tools'

/** What GET /api/environment/v1/tools answers: MCP-shaped native descriptors. */
const CATALOG = {
  tools: [
    {
      name: 'remember',
      description: 'Store a memory for this person. It is recalled later.',
      inputSchema: {},
      annotations: { readOnlyHint: false },
    },
    {
      name: 'recall',
      description: 'Recall prior memory for a query. Ranks by relevance.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    {
      name: 'document_delete',
      description: 'Delete a document.',
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    {
      name: 'rustyweb_search',
      description: 'Search the web.',
      inputSchema: {},
    },
  ],
}

// The SDK resolves routes against the page's origin, which a bare happy-dom
// page does not have.
const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

let toolsStatus = 200
let client: QueryClient
const realFetch = window.fetch
beforeEach(() => {
  toolsStatus = 200
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  window.fetch = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input)
    if (new URL(url).pathname === '/api/environment/v1/tools')
      return toolsStatus === 200
        ? Response.json(CATALOG)
        : Response.json({ title: 'Not found' }, { status: toolsStatus })
    return Response.json({}, { status: 404 })
  }) as typeof fetch
})
afterEach(async () => {
  await cleanup()
  window.fetch = realFetch
  useWebSearch.setState({ on: false })
})

function Draft({ text }: { text: string }) {
  const aui = useAui()
  useEffect(() => {
    aui.composer.setText(text)
    aui.composer.setRunConfig({
      custom: {
        theoremTurnOptions: {
          modelId: 'selected/model',
          contextReferences: [{ resource: 'existing-context' }],
        },
      },
    })
  }, [aui, text])
  return null
}
function Harness({
  text,
  sent,
  messages = [],
}: {
  text: string
  sent: AppendMessage[]
  messages?: ThreadMessageLike[]
}) {
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: (message: ThreadMessageLike) => message,
    isRunning: false,
    onNew: async (message) => {
      sent.push(message)
    },
  })
  return (
    <QueryClientProvider client={client}>
      <AssistantRuntimeProvider runtime={runtime}>
        <Draft text={text} />
        <Thread autoFocus={false} />
      </AssistantRuntimeProvider>
    </QueryClientProvider>
  )
}

/** Renders, then lets the page's queries settle, as they have by the time a person types. */
async function mount(harness: ReactNode) {
  const view = await render(harness)
  await waitFor(() => !client.isFetching())
  // Query results reach React on the next tick, after the cache has settled.
  await act(() => new Promise((resolve) => setTimeout(resolve)))
  return view
}

const sentText = (message: AppendMessage) =>
  message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')

const inputOf = (container: HTMLElement) =>
  container.querySelector<HTMLTextAreaElement>('[aria-label="Message input"]')!

/** Types into the textarea as a person does: the value changes and the caret ends up after it. */
async function type(input: HTMLTextAreaElement, value: string) {
  const { set } = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input) as object,
    'value',
  )!
  await act(async () => {
    set!.call(input, value)
    input.setSelectionRange(value.length, value.length)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const press = (input: HTMLTextAreaElement, key: string) =>
  act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })

const options = () => [
  ...document.querySelectorAll<HTMLElement>('[role="option"]'),
]

test('a slash lists the native tools, with their first sentence and what they change', async () => {
  const { container } = await mount(<Harness text="" sent={[]} />)
  await type(inputOf(container), '/')
  await waitFor(() => options().length === 4)
  expect(container.textContent).toContain('Theorem tools')
  const rows = options().map((option) => option.textContent)
  expect(rows).toEqual([
    'document_deletedestructiveDelete a document.',
    'recallRecall prior memory for a query.',
    'rememberwritesStore a memory for this person.',
    'rustyweb_searchSearch the web.',
  ])
})

test('the tools heading shows only while the slash list is open', async () => {
  const { container } = await mount(<Harness text="" sent={[]} />)
  expect(container.textContent).not.toContain('Theorem tools')
  await type(inputOf(container), '/')
  await waitFor(() => options().length === 4)
  expect(container.textContent).toContain('Theorem tools')
  await type(inputOf(container), 'Hello')
  await waitFor(() => !options().length)
  expect(container.textContent).not.toContain('Theorem tools')
})

test('typing after the slash narrows the list, best name match first', async () => {
  const { container } = await mount(<Harness text="" sent={[]} />)
  await type(inputOf(container), '/rec')
  await waitFor(() => options().length)
  expect(options()[0]!.textContent).toStartWith('recall')
  await type(inputOf(container), '/web')
  await waitFor(() => options()[0]?.textContent.startsWith('rustyweb_search'))
})

test('Enter picks the highlighted tool, and the message names it for the turn', async () => {
  const sent: AppendMessage[] = []
  const { container } = await mount(<Harness text="" sent={sent} />)
  const input = inputOf(container)
  await type(input, '/reca')
  await waitFor(() => options().length === 1)
  await press(input, 'Enter')
  await waitFor(() => !options().length)
  expect(input.value).toStartWith(':tool[recall]')
  expect(sent).toHaveLength(0)
  await type(input, `${input.value.trimEnd()} what did we decide`)
  await press(input, 'Enter')
  await waitFor(() => sent.length)
  expect(sentText(sent[0]!)).toBe(':tool[recall] what did we decide')
})

test('a slash that names no tool stays text, and Enter sends it', async () => {
  const sent: AppendMessage[] = []
  const { container } = await mount(<Harness text="" sent={sent} />)
  const input = inputOf(container)
  await type(input, '/')
  await waitFor(() => options().length)
  await type(input, '/usr/bin')
  await waitFor(() => !options().length)
  await press(input, 'Enter')
  await waitFor(() => sent.length)
  expect(sentText(sent[0]!)).toBe('/usr/bin')
})

test('a Theorem without the tools route says so instead of an empty list', async () => {
  toolsStatus = 404
  const { container } = await mount(<Harness text="" sent={[]} />)
  await type(inputOf(container), '/')
  await waitFor(() =>
    container.textContent.includes('This Theorem does not list its tools yet.'),
  )
  expect(options()).toHaveLength(0)
})

test('a sent message shows the tool it asked for as a chip', async () => {
  const { container } = await mount(
    <Harness
      text=""
      sent={[]}
      messages={[
        {
          id: 'u1',
          role: 'user',
          content: [{ type: 'text', text: ':tool[recall] what did we decide' }],
        },
      ]}
    />,
  )
  const chip = await waitFor(() =>
    container.querySelector('[data-slot="directive-text-chip"]'),
  )
  expect(chip.textContent).toBe('recall')
  expect(chip.getAttribute('aria-label')).toBe('tool: recall')
  expect(container.textContent).not.toContain(':tool[')
})

for (const method of ['click', 'Enter'] as const) {
  test(`composer ${method} sends exactly one message with its run config`, async () => {
    const sent: AppendMessage[] = []
    const { container } = await mount(
      <Harness text="Compare Chrome and Firefox" sent={sent} />,
    )
    const input = inputOf(container)
    const send = container.querySelector<HTMLButtonElement>(
      '[aria-label="Send message"]',
    )!
    await waitFor(() => !send.disabled)
    await act(() => (method === 'click' ? send.click() : press(input, 'Enter')))
    await waitFor(() => sent.length)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.runConfig).toEqual({
      custom: {
        theoremTurnOptions: {
          modelId: 'selected/model',
          contextReferences: [{ resource: 'existing-context' }],
        },
      },
    })
    expect(sentText(sent[0]!)).toBe('Compare Chrome and Firefox')
    expect(input.value).toBe('')
  })
}

test('blank composer stays disabled and Shift+Enter does not send or alter the draft', async () => {
  const sent: AppendMessage[] = []
  const { container, rerender } = await mount(<Harness text="" sent={sent} />)
  expect(
    container.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!
      .disabled,
  ).toBe(true)
  await press(inputOf(container), 'Enter')
  expect(sent).toHaveLength(0)
  expect(inputOf(container).value).toBe('')
  await rerender(<Harness text="Draft" sent={sent} />)
  const input = inputOf(container)
  await act(() =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
      }),
    ),
  )
  expect(sent).toHaveLength(0)
  expect(input.value).toBe('Draft')
})

test('the Web chip scopes later turns to RustyRed web until it is turned off', async () => {
  const sent: AppendMessage[] = []
  const { container } = await mount(
    <Harness text="Latest Rust release" sent={sent} />,
  )
  const web = container.querySelector<HTMLButtonElement>(
    '[aria-label="Web search"]',
  )!
  expect(web.getAttribute('aria-pressed')).toBe('false')
  expect(webTurnOptions()).toEqual({})

  await act(() => web.click())
  expect(web.getAttribute('aria-pressed')).toBe('true')
  expect(webTurnOptions()).toEqual({
    capabilityScope: ['web_search', 'web_read'],
  })

  // A send leaves it on and the message as typed: the scope, not a line of text, asks for the web.
  const send = container.querySelector<HTMLButtonElement>(
    '[aria-label="Send message"]',
  )!
  await waitFor(() => !send.disabled)
  await act(() => send.click())
  await waitFor(() => sent.length)
  expect(sentText(sent[0]!)).toBe('Latest Rust release')
  expect(web.getAttribute('aria-pressed')).toBe('true')

  await act(() => web.click())
  expect(web.getAttribute('aria-pressed')).toBe('false')
  expect(webTurnOptions()).toEqual({})
})
