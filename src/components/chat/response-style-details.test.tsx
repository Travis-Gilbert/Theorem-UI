import { act } from 'react'
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
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toAssistantMessages } from '@theoremharness/sdk/assistant-ui'
import type { Theorem } from '@/lib/theorem/client'
import { readResponseStyle } from '@/lib/theorem/response-styles'
import type { ResponseStylePart } from '@/lib/theorem/response-styles'
import { installFakeTheorem } from '@/stories/fake-theorem'
import { Thread } from '../assistant-ui/elements/thread.aui'
import { cleanup, click, render, waitFor } from '../../../test/blocks/render'
import {
  ResponseStyleDetails,
  suggestionsLine,
  useResponseDetails,
} from './response-style-details'
import { TheoremPartRenderers } from './theorem-parts'

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
let restore: (() => void) | undefined
let client: QueryClient

beforeAll(() => {
  page.setURL('http://localhost:3000/')
  // The thread's thinking indicator waits on fonts; happy-dom has none.
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      status: 'loaded',
      ready: Promise.resolve(),
      addEventListener() {},
      removeEventListener() {},
    },
  })
})
afterAll(() => {
  page.setURL('about:blank')
  Reflect.deleteProperty(document, 'fonts')
})
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Nothing here serves response styles, so the composer's picker stays out of the way.
  restore = installFakeTheorem({})
})
afterEach(async () => {
  await cleanup()
  client.clear()
  restore?.()
  useResponseDetails.setState({ messageId: undefined })
})

const STYLE = {
  id: 'brief',
  name: 'Brief and direct',
  revision: 3,
  revisionId: 'r3',
}
const LOADED = {
  id: 'f1',
  name: 'Research brief',
  revision: 2,
  revisionId: 'fr2',
  references: ['sources.md', 'checklist.md'],
}

/** A part as the server stores it, parsed the way the thread reads it. */
function part(
  source: ResponseStylePart['style']['source'],
  rest: Partial<Pick<ResponseStylePart, 'frameworks' | 'suggestions'>> = {},
): ResponseStylePart {
  const read = readResponseStyle({
    style: { ...STYLE, source },
    frameworks: [],
    ...rest,
  })
  if (!read) throw new Error('part did not parse')
  return read
}

test('each way the suggestions ask can end gets one plain line', () => {
  const line = (suggestions: NonNullable<ResponseStylePart['suggestions']>) =>
    suggestionsLine(suggestions)
  expect(line({ state: 'skipped_no_model' })).toBe(
    'No suggestions this turn: no decision model is set.',
  )
  expect(line({ state: 'skipped_no_credential' })).toBe(
    'No suggestions this turn: the decision model has no key.',
  )
  expect(line({ state: 'skipped_disabled' })).toBe(
    'No suggestions this turn: you turned them off.',
  )
  expect(
    line({
      state: 'suggested',
      items: [{ id: 'f1', category: 'framework', relevance: 0.9 }],
    }),
  ).toBe('A decision model offered 1 optional suggestion this turn.')
  expect(
    line({
      state: 'suggested',
      items: [
        { id: 'f1', category: 'framework', relevance: 0.9 },
        { id: 'web_search', category: 'tool', relevance: 0.7 },
      ],
    }),
  ).toBe('A decision model offered 2 optional suggestions this turn.')
  expect(line({ state: 'empty' })).toBe(
    'A decision model looked and found nothing useful this turn.',
  )
  expect(line({ state: 'unavailable', code: 'timeout' })).toBe(
    'Suggestions were unavailable this turn (timeout).',
  )
  expect(line({ state: 'unavailable' })).toBe(
    'Suggestions were unavailable this turn.',
  )
})

test('the details name the style and where the choice came from', async () => {
  const origins = {
    conversation: 'Chosen for this conversation',
    project: "This project's default",
    account: 'Your default',
    builtin: "Theorem's own default",
  } as const
  for (const [source, words] of Object.entries(origins)) {
    const { container, unmount } = await render(
      <ResponseStyleDetails part={part(source as keyof typeof origins)} />,
    )
    expect(container.textContent).toContain('Brief and direct')
    expect(container.textContent).toContain(words)
    await unmount()
  }
})

test('a reply that loaded no framework says so, and one that did lists it with its references', async () => {
  const none = await render(<ResponseStyleDetails part={part('account')} />)
  expect(none.container.textContent).toContain('No framework was loaded')
  await none.unmount()

  const some = await render(
    <ResponseStyleDetails part={part('account', { frameworks: [LOADED] })} />,
  )
  expect(some.container.textContent).toContain('Research brief')
  expect(some.container.textContent).toContain(
    'References: sources.md, checklist.md',
  )
  expect(some.container.textContent).not.toContain('No framework was loaded')
})

test('every suggestions state reads as its one line, and only a suggested state lists items', async () => {
  const states: Array<[NonNullable<ResponseStylePart['suggestions']>, string]> =
    [
      [{ state: 'skipped_no_model' }, 'no decision model is set'],
      [{ state: 'skipped_no_credential' }, 'the decision model has no key'],
      [{ state: 'skipped_disabled' }, 'you turned them off'],
      [{ state: 'empty' }, 'found nothing useful'],
      [
        { state: 'unavailable', code: 'rate_limited' },
        'unavailable this turn (rate_limited)',
      ],
    ]
  for (const [suggestions, words] of states) {
    const { container, unmount } = await render(
      <ResponseStyleDetails part={part('account', { suggestions })} />,
    )
    expect(container.textContent).toContain(words)
    expect(container.querySelector('ul li')).toBeNull()
    await unmount()
  }

  const { container } = await render(
    <ResponseStyleDetails
      part={part('account', {
        suggestions: {
          state: 'suggested',
          items: [
            {
              id: 'f1',
              category: 'framework',
              name: 'Related questions',
              relevance: 0.9,
            },
            { id: 'web_search', category: 'tool', relevance: 0.7 },
            { id: 'verify_sources', category: 'delegation', relevance: 0.6 },
          ],
        },
      })}
    />,
  )
  expect(container.textContent).toContain('offered 3 optional suggestions')
  // A suggestion with a name is listed by it, not by its id; one without falls back to the id.
  expect(container.textContent).toContain('Framework: Related questions')
  expect(container.textContent).not.toContain('Framework: f1')
  expect(container.textContent).toContain('Tool: web_search')
  expect(container.textContent).toContain('Delegation: verify_sources')
})

test('a reply with no suggestions part says nothing about them', async () => {
  const { container } = await render(
    <ResponseStyleDetails part={part('account')} />,
  )
  expect(container.textContent).not.toContain('Suggestions')
})

// ---------------------------------------------------------------------------
// In the thread: stored parts become data parts, drawn nowhere in the transcript
// ---------------------------------------------------------------------------

function Harness({ messages }: { messages: ThreadMessageLike[] }) {
  const runtime = useExternalStoreRuntime({
    messages,
    isRunning: false,
    onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
  })
  return (
    <QueryClientProvider client={client}>
      <AssistantRuntimeProvider runtime={runtime}>
        <TheoremPartRenderers />
        <Thread autoFocus={false} />
      </AssistantRuntimeProvider>
    </QueryClientProvider>
  )
}

type StoredPart = Theorem.Message['parts'][number]
const answer = (parts: StoredPart[]) =>
  toAssistantMessages([
    {
      schema: 'theorem.chat.message.v1',
      messageId: 'answer',
      tenantId: 'tenant',
      threadId: 'thread',
      originBranchId: 'branch',
      role: 'assistant',
      createdAtMs: 1,
      parts: [
        ...parts,
        {
          partId: 'text',
          type: 'text',
          payload: { text: 'Denver gets 300 days of sun.' },
        },
      ],
    } satisfies Theorem.Message,
  ])

const STORED: StoredPart = {
  partId: 'style',
  type: 'response_style',
  payload: {
    style: { ...STYLE, source: 'project' },
    frameworks: [LOADED],
    suggestions: { state: 'empty' },
  },
}

/** Radix opens its menu on the pointer going down, not on a click. */
async function openMore(container: HTMLElement) {
  const more = await waitFor(() =>
    [...container.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'More',
    ),
  )
  await act(async () => {
    more.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerType: 'mouse',
      }),
    )
  })
  return waitFor(() => document.querySelector('[role="menu"]'))
}

const menuItem = (name: string) =>
  [...document.querySelectorAll('[role="menuitem"]')].find((item) =>
    item.textContent.includes(name),
  )

test('an ordinary reply shows no routing text, not even a notice that something was not shown', async () => {
  const { container } = await render(<Harness messages={answer([STORED])} />)
  await waitFor(() =>
    container.textContent.includes('Denver gets 300 days of sun.'),
  )
  expect(container.textContent).not.toContain('Brief and direct')
  expect(container.textContent).not.toContain('Research brief')
  expect(container.textContent).not.toContain(
    "This content can't be shown here.",
  )
  expect(document.body.textContent).not.toContain('Response details')
})

test('the More menu offers the details of a reply that carries them', async () => {
  const { container } = await render(<Harness messages={answer([STORED])} />)
  await openMore(container)
  const item = await waitFor(() => menuItem('Response details'))
  expect(item.textContent).toContain('Response details')

  await click(item)
  const dialog = await waitFor(() => document.querySelector('[role="dialog"]'))
  expect(dialog.textContent).toContain('Brief and direct')
  expect(dialog.textContent).toContain("This project's default")
  expect(dialog.textContent).toContain('Research brief')
  expect(dialog.textContent).toContain('found nothing useful')
})

test('a reply without the part offers no details item', async () => {
  const { container } = await render(<Harness messages={answer([])} />)
  await openMore(container)
  expect(
    menuItem('Fork into new thread') ?? menuItem('Export as Markdown'),
  ).toBeTruthy()
  expect(menuItem('Response details')).toBeUndefined()
})
