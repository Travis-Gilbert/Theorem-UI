import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TheoremError } from '@theoremharness/sdk'
import { act } from 'react'
import { createResponseStylesFake } from '@/stories/fixtures/response-styles'
import type { ResponseStylesFakeOptions } from '@/stories/fixtures/response-styles'
import { installFakeTheorem } from '@/stories/fake-theorem'
import { cleanup, render, waitFor } from '../../../test/blocks/render'
import { describeError } from './client'
import {
  BUILTIN_STYLE_ID,
  consumePendingStyle,
  inheritedStyle,
  isResponseStyleConflict,
  isResponseStylesAbsent,
  problemCode,
  readResponseStyle,
  resolveStyle,
  responseStylesQuery,
  styleTurnOptions,
  useResponseStyles,
  usePendingStyle,
  useSelectionMutation,
  useStyleMutations,
  useSuggestionsMutation,
  withSelection,
} from './response-styles'
import type { ResponseStyleCatalog } from './response-styles'

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

let restore: (() => void) | undefined
let client: QueryClient
const requests: {
  method: string
  url: string
  body: unknown
  ifMatch: string | null
}[] = []

function fake(options: ResponseStylesFakeOptions = {}) {
  restore?.()
  const { routes } = createResponseStylesFake(options)
  // Records what the page sent, then answers as the fake does.
  const answered = Object.fromEntries(
    Object.entries(routes).map(([key, answer]) => [
      key,
      async (params: Record<string, string>, request: Request) => {
        const text = await request.clone().text()
        requests.push({
          method: request.method,
          url: new URL(request.url).pathname + new URL(request.url).search,
          body: text ? (JSON.parse(text) as unknown) : undefined,
          ifMatch: request.headers.get('If-Match'),
        })
        return answer(params, request)
      },
    ]),
  )
  restore = installFakeTheorem({
    'GET /api/chat/v1/bootstrap': () => ({ csrfToken: 'csrf', schema: 'x' }),
    ...answered,
  })
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  fake()
})
afterEach(async () => {
  await cleanup()
  client.clear()
  restore?.()
  requests.length = 0
  usePendingStyle.setState({ styleId: undefined })
})

/** Mounts a hook under a QueryClient and hands back its latest result. */
async function mountHook<T>(use: () => T) {
  const latest: { current?: T } = {}
  function Probe() {
    latest.current = use()
    return null
  }
  await render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  )
  return latest as { current: T }
}

/** Runs a mutation under act(), so the hook's state updates are not reported as stray. */
async function inAct<T>(work: () => Promise<T>): Promise<T> {
  let result!: T
  await act(async () => {
    result = await work()
  })
  return result
}
/** What a mutation threw, or undefined if it worked. */
const failure = (work: () => Promise<unknown>) =>
  inAct(() =>
    work().then(
      () => undefined,
      (thrown: unknown) => thrown,
    ),
  )

const sent = (method: string, pathname: string) =>
  requests.filter(
    (request) => request.method === method && request.url.startsWith(pathname),
  )

// --- the part ---------------------------------------------------------------

const baseStyle = {
  id: 'theorem.style.concise',
  name: 'Concise',
  revision: 0,
  revisionId: 'sha256:aa',
  source: 'account',
}

test('a part reads with its style, the frameworks it loaded and the references read', () => {
  const part = readResponseStyle({
    type: 'response_style',
    style: { ...baseStyle, source: 'conversation' },
    frameworks: [
      {
        id: 'theorem.framework.explanation',
        name: 'Explanation',
        revision: 2,
        revisionId: 'sha256:bb',
        references: ['references/source-notes.md', 7],
      },
      { name: 'No id' },
    ],
    suggestions: { state: 'skipped_no_model' },
  })
  expect(part?.style).toEqual({ ...baseStyle, source: 'conversation' })
  expect(part?.frameworks).toEqual([
    {
      id: 'theorem.framework.explanation',
      name: 'Explanation',
      revision: 2,
      revisionId: 'sha256:bb',
      references: ['references/source-notes.md'],
    },
  ])
  expect(part?.suggestions).toEqual({ state: 'skipped_no_model' })
})

test('a part reads each suggestions state', () => {
  const read = (suggestions: unknown) =>
    readResponseStyle({ style: baseStyle, frameworks: [], suggestions })
      ?.suggestions

  for (const state of [
    'skipped_no_model',
    'skipped_no_credential',
    'skipped_disabled',
    'empty',
  ] as const)
    expect(read({ state, model: null })).toEqual({ state, model: null })

  expect(
    read({
      state: 'suggested',
      model: 'openrouter/typesafe/jev-1.14',
      items: [
        {
          id: 'theorem.framework.explanation',
          category: 'framework',
          name: 'Understanding through explanation',
          relevance: 0.9,
        },
        { id: 'tool.web', category: 'tool', relevance: 0.4 },
        { id: 'x', category: 'unheard-of', relevance: 1 },
      ],
    }),
  ).toEqual({
    state: 'suggested',
    model: 'openrouter/typesafe/jev-1.14',
    items: [
      {
        id: 'theorem.framework.explanation',
        category: 'framework',
        name: 'Understanding through explanation',
        relevance: 0.9,
      },
      { id: 'tool.web', category: 'tool', relevance: 0.4 },
    ],
  })
  expect(
    read({
      state: 'unavailable',
      code: 'timeout',
      items: [{ id: 'a', category: 'tool', relevance: 1 }],
    }),
  ).toEqual({
    state: 'unavailable',
    code: 'timeout',
  })
  // An unknown state is not guessed at.
  expect(read({ state: 'surprised' })).toBeUndefined()
})

test('anything that is not a part reads as nothing', () => {
  expect(readResponseStyle(undefined)).toBeUndefined()
  expect(readResponseStyle('text')).toBeUndefined()
  expect(readResponseStyle({ frameworks: [] })).toBeUndefined()
  expect(
    readResponseStyle({ style: { ...baseStyle, source: 'elsewhere' } }),
  ).toBeUndefined()
  expect(
    readResponseStyle({ style: { name: 'No id', source: 'account' } }),
  ).toBeUndefined()
})

// --- resolution -------------------------------------------------------------

const styles = [
  { id: 'theorem.style.default', name: 'Default' },
  { id: 'theorem.style.concise', name: 'Concise' },
  { id: 'user.style.mine', name: 'Mine' },
]

test('resolution takes the conversation, then the project, then the account, then the built-in', () => {
  expect(
    resolveStyle(
      {
        conversation: 'user.style.mine',
        project: 'theorem.style.concise',
        account: null,
      },
      styles,
    ),
  ).toEqual({
    style: 'user.style.mine',
    name: 'Mine',
    source: 'conversation',
  })
  expect(
    resolveStyle(
      {
        conversation: null,
        project: 'theorem.style.concise',
        account: 'user.style.mine',
      },
      styles,
    ).source,
  ).toBe('project')
  expect(
    resolveStyle(
      { conversation: null, project: null, account: 'user.style.mine' },
      styles,
    ).source,
  ).toBe('account')
  expect(
    resolveStyle({ conversation: null, project: null, account: null }, styles),
  ).toEqual({
    style: BUILTIN_STYLE_ID,
    name: 'Default',
    source: 'builtin',
  })
  // A choice that names a style that is gone is skipped, not trusted.
  expect(
    resolveStyle(
      {
        conversation: 'user.style.gone',
        project: null,
        account: 'theorem.style.concise',
      },
      styles,
    ).source,
  ).toBe('account')
})

test('what "Use my default" means leaves the conversation out', () => {
  const choices = {
    conversation: 'user.style.mine',
    project: null,
    account: 'theorem.style.concise',
  }
  expect(inheritedStyle(choices, styles)).toEqual({
    style: 'theorem.style.concise',
    name: 'Concise',
    source: 'account',
  })
  expect(
    inheritedStyle({ ...choices, project: 'user.style.mine' }, styles).source,
  ).toBe('project')
  expect(
    inheritedStyle(
      { conversation: 'user.style.mine', project: null, account: null },
      styles,
    ).source,
  ).toBe('builtin')
})

test('changing one scope of a catalog works the effective style out again', () => {
  const catalog = {
    styles,
    frameworks: [],
    selection: {
      account: 'theorem.style.concise',
      project: null,
      conversation: null,
      effective: {
        style: 'theorem.style.concise',
        name: 'Concise',
        source: 'account',
      },
    },
  } as unknown as ResponseStyleCatalog
  const chosen = withSelection(catalog, 'conversation', 'user.style.mine')
  expect(chosen.selection).toMatchObject({
    conversation: 'user.style.mine',
    account: 'theorem.style.concise',
    effective: { style: 'user.style.mine', source: 'conversation' },
  })
  expect(
    withSelection(chosen, 'conversation', null).selection.effective.source,
  ).toBe('account')
})

// --- problems ---------------------------------------------------------------

const problem = (status: number, code?: string) =>
  new TheoremError({
    message: 'x',
    statusCode: status,
    body: code
      ? { code, title: 'T', detail: 'D' }
      : { title: 'Not in this story' },
  })

test('a route that is not served is told from a 404 that carries a problem code', () => {
  expect(isResponseStylesAbsent(problem(404))).toBe(true)
  expect(isResponseStylesAbsent(problem(405))).toBe(true)
  expect(isResponseStylesAbsent(problem(404, 'response_style_unknown'))).toBe(
    false,
  )
  // A thread or project the caller cannot reach is Theorem answering, not Theorem predating the routes.
  expect(isResponseStylesAbsent(problem(404, 'chat_resource_not_found'))).toBe(
    false,
  )
  expect(isResponseStylesAbsent(problem(405, 'method_not_allowed'))).toBe(false)
  expect(isResponseStylesAbsent(problem(500))).toBe(false)
  expect(isResponseStylesAbsent(new Error('offline'))).toBe(false)
  expect(problemCode(problem(409, 'response_style_shipped'))).toBe(
    'response_style_shipped',
  )
  expect(problemCode(new Error('x'))).toBeUndefined()
})

test('a lost save is a conflict by status or by code', () => {
  expect(isResponseStyleConflict(problem(412))).toBe(true)
  expect(isResponseStyleConflict(problem(409, 'response_style_changed'))).toBe(
    true,
  )
  expect(isResponseStyleConflict(problem(422, 'response_style_invalid'))).toBe(
    false,
  )
})

// --- the send option --------------------------------------------------------

test('the pick rides only the first message of a conversation that does not exist', () => {
  expect(styleTurnOptions(false)).toEqual({})
  usePendingStyle.getState().choose('theorem.style.formal')
  expect(styleTurnOptions(false)).toEqual({
    responseStyle: 'theorem.style.formal',
  })
  expect(styleTurnOptions(true)).toEqual({})
  // Accepted: the conversation holds it now. A different pick made meanwhile stays.
  usePendingStyle.getState().choose('theorem.style.concise')
  consumePendingStyle('theorem.style.formal')
  expect(usePendingStyle.getState().styleId).toBe('theorem.style.concise')
  consumePendingStyle('theorem.style.concise')
  expect(usePendingStyle.getState().styleId).toBeUndefined()
  expect(styleTurnOptions(false)).toEqual({})
})

// --- the hooks, against the stateful fake -----------------------------------

test('the catalog is read for the conversation and project it names', async () => {
  fake({
    threadProjects: { t1: 'p1' },
    selection: { projects: { p1: 'theorem.style.formal' } },
  })
  const read = await mountHook(() =>
    useResponseStyles({ threadId: 't1', projectId: 'p1' }),
  )
  await waitFor(() => read.current.data)
  expect(sent('GET', '/api/chat/v1/response-styles')[0]?.url).toBe(
    '/api/chat/v1/response-styles?threadId=t1&projectId=p1',
  )
  expect(read.current.data?.selection.effective).toMatchObject({
    style: 'theorem.style.formal',
    source: 'project',
  })
  expect(read.current.data?.styles).toHaveLength(5)
})

test('an older Theorem that does not serve the catalog is absent, and is not retried', async () => {
  restore?.()
  restore = installFakeTheorem({})
  const error = await client.fetchQuery(responseStylesQuery()).then(
    () => undefined,
    (thrown: unknown) => thrown,
  )
  expect(isResponseStylesAbsent(error)).toBe(true)
})

test('saving sends the revision the person was looking at as If-Match, and a stale one surfaces as a conflict', async () => {
  const mutations = await mountHook(useStyleMutations)
  const concise = await inAct(() =>
    mutations.current.save.mutateAsync({
      id: 'theorem.style.concise',
      revision: 0,
      name: 'Concise',
      description: 'Short answers.',
      body: '# Concise\n\nBe short.',
      frameworks: [],
    }),
  )
  expect(concise.revision).toBe(1)
  expect(
    sent('PUT', '/api/chat/v1/response-styles/styles/theorem.style.concise')[0]
      ?.ifMatch,
  ).toBe('0')

  // The same page saving again at revision 0 lost the race.
  const error = await failure(() =>
    mutations.current.save.mutateAsync({
      id: 'theorem.style.concise',
      revision: 0,
      name: 'Concise',
      description: '',
      body: '# Concise\n\nBe shorter.',
      frameworks: [],
    }),
  )
  expect(isResponseStyleConflict(error)).toBe(true)
  expect(error).toBeInstanceOf(TheoremError)
  // The words, not the status.
  expect(describeError(error)).not.toMatch(/412|answered/)
  expect(describeError(error).length).toBeGreaterThan(0)
})

test('create, restore, reset and remove go to their routes and carry the revision', async () => {
  const mutations = await mountHook(useStyleMutations)
  const copy = await inAct(() =>
    mutations.current.create.mutateAsync({
      from: 'theorem.style.formal',
      name: 'My formal',
    }),
  )
  expect(copy).toMatchObject({
    id: 'user.style.my-formal',
    origin: 'user',
    revision: 1,
  })

  const edited = await inAct(() =>
    mutations.current.save.mutateAsync({
      id: copy.id,
      revision: copy.revision,
      name: copy.name,
      description: copy.description,
      body: '# My formal\n\nChanged.',
      frameworks: copy.frameworks,
    }),
  )
  const restored = await inAct(() =>
    mutations.current.restore.mutateAsync({
      id: copy.id,
      revision: edited.revision,
      to: 1,
    }),
  )
  expect(restored.body).toBe(copy.body)
  expect(restored.revision).toBe(3)
  expect(
    sent('POST', `/api/chat/v1/response-styles/styles/${copy.id}/restore`)[0]
      ?.body,
  ).toEqual({ revision: 1 })

  const edit = await inAct(() =>
    mutations.current.save.mutateAsync({
      id: 'theorem.style.exploratory',
      revision: 0,
      name: 'Exploratory',
      description: '',
      body: '# Exploratory\n\nMine.',
      frameworks: [],
    }),
  )
  await inAct(() =>
    mutations.current.restore.mutateAsync({
      id: 'theorem.style.exploratory',
      revision: edit.revision,
      to: 'shipped',
    }),
  )
  expect(
    sent(
      'POST',
      '/api/chat/v1/response-styles/styles/theorem.style.exploratory/restore',
    )[0]?.body,
  ).toEqual({ shipped: true })

  await inAct(() =>
    mutations.current.remove.mutateAsync({
      id: copy.id,
      revision: restored.revision,
    }),
  )
  expect(
    sent('DELETE', `/api/chat/v1/response-styles/styles/${copy.id}`)[0]
      ?.ifMatch,
  ).toBe('3')
  const removal = await failure(() =>
    mutations.current.remove.mutateAsync({
      id: 'theorem.style.concise',
      revision: 0,
    }),
  )
  expect(problemCode(removal)).toBe('response_style_shipped')
})

test('a selection change shows in every catalog it reaches, and in no other, and every query reads again', async () => {
  fake({ threadProjects: { t1: 'p1', t2: 'p1' } })
  const probe = await mountHook(() => ({
    mine: useResponseStyles({ threadId: 't1', projectId: 'p1' }),
    other: useResponseStyles({ threadId: 't2', projectId: 'p1' }),
    select: useSelectionMutation(),
  }))
  await waitFor(() => probe.current.mine.data && probe.current.other.data)
  expect(probe.current.mine.data?.selection.effective.source).toBe('builtin')

  // The change names the thread alone; the catalog that asked also named its project.
  await inAct(() =>
    probe.current.select.mutateAsync({
      scope: 'conversation',
      threadId: 't1',
      style: 'theorem.style.formal',
    }),
  )
  expect(
    sent('PUT', '/api/chat/v1/response-styles/selection')[0]?.body,
  ).toEqual({
    scope: 'conversation',
    threadId: 't1',
    style: 'theorem.style.formal',
  })
  await waitFor(
    () =>
      probe.current.mine.data?.selection.conversation ===
      'theorem.style.formal',
  )
  expect(probe.current.mine.data?.selection.effective).toMatchObject({
    style: 'theorem.style.formal',
    source: 'conversation',
  })
  expect(probe.current.other.data?.selection.conversation).toBeNull()

  // A project's default reaches the catalogs for that project, so the other conversation inherits it.
  await inAct(() =>
    probe.current.select.mutateAsync({
      scope: 'project',
      projectId: 'p1',
      style: 'theorem.style.educational',
    }),
  )
  await waitFor(
    () =>
      probe.current.other.data?.selection.project ===
      'theorem.style.educational',
  )
  expect(probe.current.other.data?.selection.effective).toMatchObject({
    style: 'theorem.style.educational',
    source: 'project',
  })
  expect(probe.current.mine.data?.selection.effective.source).toBe(
    'conversation',
  )

  // Null is "Use my default".
  await inAct(() =>
    probe.current.select.mutateAsync({
      scope: 'conversation',
      threadId: 't1',
      style: null,
    }),
  )
  await waitFor(() => probe.current.mine.data?.selection.conversation === null)
  expect(probe.current.mine.data?.selection.effective.source).toBe('project')
  expect(
    sent('PUT', '/api/chat/v1/response-styles/selection')[2]?.body,
  ).toEqual({
    scope: 'conversation',
    threadId: 't1',
    style: null,
  })
})

test('the suggestions setting is written, shows in every catalog, and a non-decision model is refused', async () => {
  const probe = await mountHook(() => ({
    catalog: useResponseStyles(),
    suggest: useSuggestionsMutation(),
  }))
  await waitFor(() => probe.current.catalog.data)
  expect(probe.current.catalog.data?.suggestions.models).toHaveLength(3)

  await inAct(() =>
    probe.current.suggest.mutateAsync({
      model: 'openrouter/microsoft/microsoft-decision-1',
    }),
  )
  await waitFor(
    () =>
      probe.current.catalog.data?.suggestions.choice ===
      'openrouter/microsoft/microsoft-decision-1',
  )
  expect(
    sent('PUT', '/api/chat/v1/response-styles/suggestions')[0]?.body,
  ).toEqual({
    model: 'openrouter/microsoft/microsoft-decision-1',
  })

  const refused = await failure(() =>
    probe.current.suggest.mutateAsync({
      model: 'openrouter/vendor/chat-model',
    }),
  )
  expect(problemCode(refused)).toBe('response_style_invalid')
})
