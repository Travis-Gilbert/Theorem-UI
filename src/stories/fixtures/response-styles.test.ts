import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'bun:test'
import { TheoremError } from '@theoremharness/sdk'
import { theoremJson } from '@/lib/theorem/passthrough'
import type {
  PreviewResult,
  ResponseFrameworkDetail,
  ResponseStyleCatalog,
  ResponseStyleDetail,
  RevisionSummary,
  StyleSelection,
  StyleSuggestions,
} from '@/lib/theorem/response-styles'
import { installFakeTheorem } from '../fake-theorem'
import { createResponseStylesFake } from './response-styles'
import type { ResponseStylesFakeOptions } from './response-styles'
import { SHIPPED_FILES } from './response-styles-seed'

// The SDK resolves routes against the page's origin, which a bare happy-dom
// page does not have.
const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

const ROOT = '/api/chat/v1/response-styles'
let restore: (() => void) | undefined
let clock = 1_000
function fake(options: ResponseStylesFakeOptions = {}) {
  restore?.()
  restore = installFakeTheorem(
    createResponseStylesFake({ now: () => ++clock, ...options }).routes,
  )
}
beforeEach(() => fake())
afterEach(() => restore?.())

const get = <T>(path: string) => theoremJson<T>(`${ROOT}${path}`)
const send = <T>(
  method: string,
  path: string,
  body?: unknown,
  ifMatch?: number | string,
) =>
  theoremJson<T>(`${ROOT}${path}`, {
    method,
    body,
    headers: ifMatch === undefined ? {} : { 'If-Match': String(ifMatch) },
  })

async function refused(run: Promise<unknown>) {
  const error = await run.then(
    () => undefined,
    (thrown: unknown) => thrown,
  )
  expect(error).toBeInstanceOf(TheoremError)
  return error as TheoremError
}

async function refusal(run: Promise<unknown>) {
  const error = await refused(run)
  return {
    status: error.statusCode,
    code: (error.body as { code?: string } | undefined)?.code,
  }
}

/** The whole `application/problem+json` body of a refusal. */
const problemOf = async (run: Promise<unknown>) =>
  (await refused(run)).body as Record<string, unknown>

const idsOf = (items: { id: string }[]) => items.map((item) => item.id)

test('it starts with the five shipped styles and two frameworks, at their real text', async () => {
  const catalog = await get<ResponseStyleCatalog>('')
  expect(idsOf(catalog.styles)).toEqual([
    'theorem.style.default',
    'theorem.style.concise',
    'theorem.style.exploratory',
    'theorem.style.educational',
    'theorem.style.formal',
  ])
  expect(idsOf(catalog.frameworks)).toEqual([
    'theorem.framework.explanation',
    'theorem.framework.related-questions',
  ])
  // A list leaves the text out.
  expect('body' in (catalog.styles[0] ?? {})).toBe(false)

  const exploratory = await get<ResponseStyleDetail>(
    '/styles/theorem.style.exploratory',
  )
  expect(exploratory.source).toBe(SHIPPED_FILES['styles/exploratory.md']!)
  expect(exploratory.body.startsWith('# Exploratory')).toBe(true)
  expect(exploratory).toMatchObject({
    origin: 'shipped',
    revision: 0,
    frameworks: [
      'theorem.framework.explanation',
      'theorem.framework.related-questions',
    ],
    shipped: { version: '0.1.0', updateAvailable: false },
  })
  expect(exploratory.revisionId).toMatch(/^sha256:[0-9a-f]{64}$/)

  const explanation = await get<ResponseFrameworkDetail>(
    '/frameworks/theorem.framework.explanation',
  )
  expect(explanation.references.map((reference) => reference.title)).toEqual([
    'Source notes',
    'Varied applications',
  ])
  expect(explanation.references[0]?.body).toContain('original adaptation')
  expect(idsOf(explanation.usedBy)).toHaveLength(5)
  const related = catalog.frameworks.find(
    (framework) => framework.id === 'theorem.framework.related-questions',
  )
  expect(related?.usedBy.map((style) => style.name)).toEqual([
    'Default',
    'Exploratory',
    'Educational',
  ])
})

test('each save is a new revision, and a stale If-Match is 412 response_style_changed', async () => {
  const id = 'theorem.style.concise'
  const before = await get<ResponseStyleDetail>(`/styles/${id}`)
  const draft = {
    name: before.name,
    description: before.description,
    body: '# Concise\n\nShorter.',
    frameworks: before.frameworks,
  }

  const first = await send<ResponseStyleDetail>(
    'PUT',
    `/styles/${id}`,
    draft,
    0,
  )
  expect(first.revision).toBe(1)
  expect(first.revisionId).not.toBe(before.revisionId)
  expect(first.body).toBe(draft.body)
  expect(first.source).toContain('name: Concise')

  // Saving again at the revision the page opened is a lost race.
  expect(await refusal(send('PUT', `/styles/${id}`, draft, 0))).toEqual({
    status: 412,
    code: 'response_style_changed',
  })
  expect(await refusal(send('PUT', `/styles/${id}`, draft))).toEqual({
    status: 428,
    code: 'response_style_revision_required',
  })
  const second = await send<ResponseStyleDetail>(
    'PUT',
    `/styles/${id}`,
    { ...draft, body: '# Concise\n\nShorter still.' },
    1,
  )
  expect(second.revision).toBe(2)
  expect((await get<ResponseStyleDetail>(`/styles/${id}`)).revision).toBe(2)
})

test('a blank name is 422 response_style_invalid, an unknown framework in the body is 422 with no field, and an empty body is accepted', async () => {
  const id = 'theorem.style.concise'
  const before = await get<ResponseStyleDetail>(`/styles/${id}`)
  const draft = {
    name: before.name,
    description: '',
    body: before.body,
    frameworks: before.frameworks,
  }
  expect(
    await problemOf(send('PUT', `/styles/${id}`, { ...draft, name: ' ' }, 0)),
  ).toMatchObject({
    status: 422,
    code: 'response_style_invalid',
    field: 'name',
  })
  const unknown = await problemOf(
    send(
      'PUT',
      `/styles/${id}`,
      { ...draft, frameworks: ['theorem.framework.nope'] },
      0,
    ),
  )
  expect(unknown).toMatchObject({
    status: 422,
    code: 'response_framework_unknown',
  })
  expect('field' in unknown).toBe(false)
  expect((await get<ResponseStyleDetail>(`/styles/${id}`)).revision).toBe(0)

  const emptied = await send<ResponseStyleDetail>(
    'PUT',
    `/styles/${id}`,
    { ...draft, body: '' },
    0,
  )
  expect(emptied).toMatchObject({ revision: 1, body: '' })
})

test('name, description, body and the framework list are limited, counted in bytes', async () => {
  const id = 'theorem.style.concise'
  const before = await get<ResponseStyleDetail>(`/styles/${id}`)
  const draft = {
    name: before.name,
    description: '',
    body: before.body,
    frameworks: before.frameworks,
  }
  const fieldOf = (change: object) =>
    problemOf(send('PUT', `/styles/${id}`, { ...draft, ...change }, 0))
  // 'é' is two bytes: 101 of them are 202 bytes in 101 characters.
  expect(await fieldOf({ name: 'é'.repeat(101) })).toMatchObject({
    status: 422,
    code: 'response_style_invalid',
    field: 'name',
  })
  expect(await fieldOf({ description: 'x'.repeat(1001) })).toMatchObject({
    code: 'response_style_invalid',
    field: 'description',
  })
  expect(await fieldOf({ body: 'x'.repeat(65_537) })).toMatchObject({
    code: 'response_style_invalid',
    field: 'body',
  })
  expect(
    await fieldOf({ frameworks: Array(33).fill(before.frameworks[0]) }),
  ).toMatchObject({ code: 'response_style_invalid', field: 'frameworks' })
  expect((await get<ResponseStyleDetail>(`/styles/${id}`)).revision).toBe(0)

  // The limits themselves are allowed.
  const limit = await send<ResponseStyleDetail>(
    'PUT',
    `/styles/${id}`,
    {
      ...draft,
      name: 'é'.repeat(100),
      description: 'x'.repeat(1000),
      body: 'x'.repeat(65_536),
    },
    0,
  )
  expect(limit.revision).toBe(1)
})

test('If-Match reads 3, "3" and W/"3"; anything else is 400, and a stale one carries currentRevision', async () => {
  const id = 'theorem.style.concise'
  const before = await get<ResponseStyleDetail>(`/styles/${id}`)
  const draft = {
    name: before.name,
    description: '',
    body: before.body,
    frameworks: before.frameworks,
  }
  const save = (ifMatch: string) => send('PUT', `/styles/${id}`, draft, ifMatch)
  expect(((await save('0')) as ResponseStyleDetail).revision).toBe(1)
  expect(((await save('"1"')) as ResponseStyleDetail).revision).toBe(2)
  expect(((await save('W/"2"')) as ResponseStyleDetail).revision).toBe(3)

  expect(await problemOf(save('abc'))).toMatchObject({
    status: 400,
    code: 'invalid_chat_revision',
  })
  expect(await refusal(save('"abc"'))).toEqual({
    status: 400,
    code: 'invalid_chat_revision',
  })

  const stale = await problemOf(save('1'))
  expect(stale).toMatchObject({
    type: 'about:blank',
    status: 412,
    code: 'response_style_changed',
    currentRevision: 3,
  })
  expect(stale.title).toEqual(expect.any(String))
  expect(stale.correlationId).toEqual(expect.any(String))
})

test('restore and reset write new revisions with the old content; history is never rewritten', async () => {
  const id = 'theorem.style.formal'
  const before = await get<ResponseStyleDetail>(`/styles/${id}`)
  const draft = (body: string) => ({
    name: before.name,
    description: before.description,
    body,
    frameworks: before.frameworks,
  })
  await send('PUT', `/styles/${id}`, draft('# Formal\n\nOne.'), 0)
  await send('PUT', `/styles/${id}`, draft('# Formal\n\nTwo.'), 1)

  const restored = await send<ResponseStyleDetail>(
    'POST',
    `/styles/${id}/restore`,
    { revision: 1 },
    2,
  )
  expect(restored.revision).toBe(3)
  expect(restored.body).toBe('# Formal\n\nOne.')

  const reset = await send<ResponseStyleDetail>(
    'POST',
    `/styles/${id}/restore`,
    { shipped: true },
    3,
  )
  expect(reset.revision).toBe(4)
  expect(reset.body).toBe(before.body)
  expect(reset.revisionId).toBe(before.revisionId)

  const { revisions } = await get<{ revisions: RevisionSummary[] }>(
    `/styles/${id}/revisions`,
  )
  expect(
    revisions.map((revision) => [revision.revision, revision.cause]),
  ).toEqual([
    [4, 'reset'],
    [3, 'restore'],
    [2, 'edit'],
    [1, 'edit'],
    [0, null],
  ])
  // The baseline was never saved: no cause, no time.
  expect(revisions.at(-1)?.savedAtMs).toBe(0)
  // An old revision still reads as it was, and `shipped` is the baseline.
  expect(
    (await get<ResponseStyleDetail>(`/styles/${id}/revisions/2`)).body,
  ).toBe('# Formal\n\nTwo.')
  expect(
    (await get<ResponseStyleDetail>(`/styles/${id}/revisions/shipped`))
      .revision,
  ).toBe(0)
  expect(await refusal(get(`/styles/${id}/revisions/9`))).toEqual({
    status: 404,
    code: 'response_style_revision_unknown',
  })
})

test('restoring to the shipped text: nothing to write when unedited, 404 when there is none, 422 for neither or both', async () => {
  const id = 'theorem.style.concise'
  const unedited = await send<ResponseStyleDetail>(
    'POST',
    `/styles/${id}/restore`,
    { shipped: true },
    0,
  )
  expect(unedited.revision).toBe(0)
  const { revisions } = await get<{ revisions: RevisionSummary[] }>(
    `/styles/${id}/revisions`,
  )
  expect(revisions.map((revision) => revision.revision)).toEqual([0])

  const made = await send<ResponseStyleDetail>('POST', '/styles', {
    name: 'Mine',
    body: 'Say it.',
  })
  expect(
    await refusal(
      send('POST', `/styles/${made.id}/restore`, { shipped: true }, 1),
    ),
  ).toEqual({ status: 404, code: 'response_style_revision_unknown' })
  expect(
    await refusal(
      send('POST', `/styles/${made.id}/restore`, { revision: 9 }, 1),
    ),
  ).toEqual({ status: 404, code: 'response_style_revision_unknown' })

  for (const body of [{}, { revision: 0, shipped: true }]) {
    expect(
      await problemOf(send('POST', `/styles/${id}/restore`, body, 0)),
    ).toMatchObject({
      status: 422,
      code: 'response_style_invalid',
      field: 'revision',
    })
  }
})

test('an id named in a body is 422 with no field; one named in the path is 404', async () => {
  const unknownStyle = await problemOf(
    send('POST', '/styles', { from: 'user.style.nope', name: 'Copy' }),
  )
  expect(unknownStyle).toMatchObject({
    status: 422,
    code: 'response_style_unknown',
  })
  expect('field' in unknownStyle).toBe(false)

  const unknownFramework = await problemOf(
    send('POST', '/frameworks', { from: 'user.framework.nope', name: 'Copy' }),
  )
  expect(unknownFramework).toMatchObject({
    status: 422,
    code: 'response_framework_unknown',
  })
  expect('field' in unknownFramework).toBe(false)

  const unknownTarget = await problemOf(
    send('POST', '/frameworks', {
      from: 'theorem.framework.explanation',
      forStyle: 'user.style.nope',
    }),
  )
  expect(unknownTarget).toMatchObject({
    status: 422,
    code: 'response_style_unknown',
  })
  expect('field' in unknownTarget).toBe(false)

  expect(await refusal(get('/frameworks/user.framework.nope'))).toEqual({
    status: 404,
    code: 'response_framework_unknown',
  })
})

test('a duplicate is its own style that the person owns, and a shipped style cannot be deleted', async () => {
  const copy = await send<ResponseStyleDetail>('POST', '/styles', {
    from: 'theorem.style.concise',
    name: 'Brief',
  })
  expect(copy).toMatchObject({
    id: 'user.style.brief',
    origin: 'user',
    revision: 1,
    shipped: null,
    name: 'Brief',
    frameworks: ['theorem.framework.explanation'],
  })
  const original = await get<ResponseStyleDetail>(
    '/styles/theorem.style.concise',
  )
  expect(copy.body).toBe(original.body)
  expect(
    (
      await send<ResponseStyleDetail>('POST', '/styles', {
        from: 'theorem.style.concise',
        name: 'Brief',
      })
    ).id,
  ).toBe('user.style.brief-2')
  const revisions = await get<{ revisions: RevisionSummary[] }>(
    '/styles/user.style.brief/revisions',
  )
  // A style the person made has no revision 0 row: its history starts at 1.
  expect(
    revisions.revisions.map((revision) => [revision.revision, revision.cause]),
  ).toEqual([[1, 'duplicate']])

  expect(
    await refusal(
      send('DELETE', '/styles/theorem.style.concise', undefined, 0),
    ),
  ).toEqual({
    status: 409,
    code: 'response_style_shipped',
  })
  await send('DELETE', '/styles/user.style.brief', undefined, 1)
  expect(await refusal(get('/styles/user.style.brief'))).toEqual({
    status: 404,
    code: 'response_style_unknown',
  })
  const catalog = await get<ResponseStyleCatalog>('')
  expect(idsOf(catalog.styles)).not.toContain('user.style.brief')
})

test('duplicating a framework for one style rewrites that style and leaves the others sharing the original', async () => {
  const created = await send<{
    framework: ResponseFrameworkDetail
    style?: ResponseStyleDetail
  }>('POST', '/frameworks', {
    from: 'theorem.framework.explanation',
    forStyle: 'theorem.style.concise',
    name: 'Explanation for Concise',
  })
  expect(created.framework).toMatchObject({
    id: 'user.framework.explanation-for-concise',
    origin: 'user',
    usedBy: [{ id: 'theorem.style.concise', name: 'Concise' }],
  })
  expect(created.framework.references).toHaveLength(2)
  expect(created.style).toMatchObject({
    id: 'theorem.style.concise',
    revision: 1,
    frameworks: ['user.framework.explanation-for-concise'],
  })
  const original = await get<ResponseFrameworkDetail>(
    '/frameworks/theorem.framework.explanation',
  )
  expect(original.usedBy.map((style) => style.name)).not.toContain('Concise')
  expect(original.usedBy).toHaveLength(4)

  // A framework that styles still list cannot be deleted from under them.
  const refusedDelete = await problemOf(
    send(
      'DELETE',
      '/frameworks/user.framework.explanation-for-concise',
      undefined,
      1,
    ),
  )
  expect(refusedDelete).toMatchObject({
    status: 409,
    code: 'response_framework_in_use',
    title: 'A style still lists this framework',
    detail:
      'user.framework.explanation-for-concise is still listed by Concise; take it off those styles first',
  })
  expect('field' in refusedDelete).toBe(false)
})

test('a framework save replaces its references and bumps its revision', async () => {
  const id = 'theorem.framework.related-questions'
  const before = await get<ResponseFrameworkDetail>(`/frameworks/${id}`)
  const saved = await send<ResponseFrameworkDetail>(
    'PUT',
    `/frameworks/${id}`,
    {
      name: before.name,
      description: before.description,
      body: before.body,
      references: [
        { path: 'references/notes.md', body: '# Notes\n\nA reference.' },
      ],
    },
    0,
  )
  expect(saved.revision).toBe(1)
  expect(saved.references).toEqual([
    {
      path: 'references/notes.md',
      title: 'Notes',
      body: '# Notes\n\nA reference.',
    },
  ])
  const reset = await send<ResponseFrameworkDetail>(
    'POST',
    `/frameworks/${id}/restore`,
    { shipped: true },
    1,
  )
  expect(reset.references).toHaveLength(1)
  expect(reset.references[0]?.path).toBe('references/application-examples.md')
})

test('the selection resolves conversation, then project, then account, then the built-in', async () => {
  fake({ threadProjects: { t1: 'p1' } })
  const read = (query: string) => get<StyleSelection>(`/selection${query}`)
  const put = (body: object) => send<StyleSelection>('PUT', '/selection', body)

  expect((await read('')).effective).toEqual({
    style: 'theorem.style.default',
    name: 'Default',
    source: 'builtin',
  })

  await put({ scope: 'account', style: 'theorem.style.educational' })
  expect((await read('?threadId=t1&projectId=p1')).effective).toEqual({
    style: 'theorem.style.educational',
    name: 'Educational',
    source: 'account',
  })

  await put({
    scope: 'project',
    projectId: 'p1',
    style: 'theorem.style.formal',
  })
  expect((await read('?threadId=t1&projectId=p1')).effective.source).toBe(
    'project',
  )
  // The project is found from the thread when only the thread is named.
  expect((await read('?threadId=t1')).project).toBe('theorem.style.formal')

  const chosen = await put({
    scope: 'conversation',
    threadId: 't1',
    style: 'theorem.style.concise',
  })
  expect(chosen).toMatchObject({
    conversation: 'theorem.style.concise',
    project: 'theorem.style.formal',
    account: 'theorem.style.educational',
    effective: { style: 'theorem.style.concise', source: 'conversation' },
  })
  // Another conversation is not affected.
  expect((await read('?threadId=t2&projectId=p1')).effective.source).toBe(
    'project',
  )

  // Null is "Use my default": the conversation inherits again.
  const cleared = await put({
    scope: 'conversation',
    threadId: 't1',
    style: null,
  })
  expect(cleared.conversation).toBeNull()
  expect(cleared.effective.source).toBe('project')

  const unknown = await problemOf(
    put({ scope: 'account', style: 'user.style.nope' }),
  )
  expect(unknown).toMatchObject({
    status: 422,
    code: 'response_style_unknown',
  })
  expect('field' in unknown).toBe(false)
  for (const [body, field] of [
    [{ scope: 'conversation', style: null }, 'threadId'],
    [{ scope: 'project', style: null }, 'projectId'],
    [{ scope: 'account' }, 'style'],
  ] as const) {
    expect(await problemOf(put(body))).toMatchObject({
      status: 422,
      code: 'response_style_invalid',
      field,
    })
  }
  // A body that does not deserialize fails before anything it says is looked at.
  for (const body of [{ style: null }, { scope: 'team', style: null }]) {
    expect(await problemOf(put(body))).toMatchObject({
      status: 422,
      code: 'invalid_chat_request',
      title: 'Invalid message fields',
    })
  }
})

test('a deleted style that a scope still names is skipped', async () => {
  const copy = await send<ResponseStyleDetail>('POST', '/styles', {
    from: 'theorem.style.formal',
    name: 'Mine',
  })
  await send('PUT', '/selection', { scope: 'account', style: copy.id })
  expect((await get<StyleSelection>('/selection')).effective).toMatchObject({
    style: copy.id,
    source: 'account',
  })
  await send('DELETE', `/styles/${copy.id}`, undefined, 1)
  const after = await get<StyleSelection>('/selection')
  expect(after.account).toBe(copy.id)
  expect(after.effective.source).toBe('builtin')
})

test('suggestions carry the decision models and the person own pick', async () => {
  const initial = await get<ResponseStyleCatalog>('')
  expect(initial.suggestions).toMatchObject({
    enabled: true,
    state: 'ready',
    model: 'openrouter/typesafe/jev-1.14',
    modelSource: 'shipped',
    choice: null,
    last: null,
  })
  expect(initial.suggestions.models).toEqual([
    { ref: 'openrouter/typesafe/jev-1.14', name: 'TypeSafe: Jev 1.14' },
    {
      ref: 'openrouter/openai/gpt-6-luna-decisions',
      name: 'OpenAI: GPT-6 Luna Decisions',
    },
    {
      ref: 'openrouter/microsoft/microsoft-decision-1',
      name: 'Microsoft: Decision 1',
    },
  ])

  const picked = await send<StyleSuggestions>('PUT', '/suggestions', {
    model: 'openrouter/microsoft/microsoft-decision-1',
  })
  expect(picked).toMatchObject({
    model: 'openrouter/microsoft/microsoft-decision-1',
    modelSource: 'user',
    choice: 'openrouter/microsoft/microsoft-decision-1',
  })

  const none = await send<StyleSuggestions>('PUT', '/suggestions', {
    model: 'none',
  })
  expect(none).toMatchObject({ model: null, state: 'no_model', choice: 'none' })

  // Null inherits again; leaving the key out changes nothing.
  const inherited = await send<StyleSuggestions>('PUT', '/suggestions', {
    model: null,
  })
  expect(inherited).toMatchObject({
    model: 'openrouter/typesafe/jev-1.14',
    modelSource: 'shipped',
    choice: null,
  })
  expect(
    (await send<StyleSuggestions>('PUT', '/suggestions', { model: 'none' }))
      .choice,
  ).toBe('none')
  expect(
    (await send<StyleSuggestions>('PUT', '/suggestions', { enabled: false }))
      .choice,
  ).toBe('none')

  // With models listed, the ref has to be one of them.
  expect(
    await problemOf(
      send('PUT', '/suggestions', { model: 'openrouter/vendor/chat-model' }),
    ),
  ).toMatchObject({
    status: 422,
    code: 'response_style_invalid',
    field: 'model',
  })
  expect(
    (await send<StyleSuggestions>('PUT', '/suggestions', { enabled: false }))
      .state,
  ).toBe('disabled')
})

test('a decision model is trimmed, none is any case, and a non-openrouter ref is refused', async () => {
  const pick = (model: unknown) =>
    send<StyleSuggestions>('PUT', '/suggestions', { model })
  expect((await pick('  openrouter/openai/gpt-6-luna-decisions ')).choice).toBe(
    'openrouter/openai/gpt-6-luna-decisions',
  )
  expect((await pick(' None ')).choice).toBe('none')
  for (const model of ['gpt-6', 'openrouter/', 'anthropic/claude']) {
    expect(await problemOf(pick(model))).toMatchObject({
      status: 422,
      code: 'response_style_invalid',
      field: 'model',
    })
  }
  // The pick that failed changed nothing.
  expect((await get<ResponseStyleCatalog>('')).suggestions.choice).toBe('none')

  // A non-boolean switch, or a model that is not text, does not deserialize.
  for (const body of [{ enabled: 'yes' }, { model: 5 }]) {
    expect(await problemOf(send('PUT', '/suggestions', body))).toMatchObject({
      status: 422,
      code: 'invalid_chat_request',
      title: 'Invalid message fields',
    })
  }
})

test('with no decision models listed, any openrouter ref is accepted', async () => {
  fake({ suggestions: { models: [] } })
  const picked = await send<StyleSuggestions>('PUT', '/suggestions', {
    model: 'openrouter/vendor/chat-model',
  })
  expect(picked).toMatchObject({
    model: 'openrouter/vendor/chat-model',
    choice: 'openrouter/vendor/chat-model',
    models: [],
  })
  expect(
    await refusal(send('PUT', '/suggestions', { model: 'vendor/chat-model' })),
  ).toEqual({ status: 422, code: 'response_style_invalid' })
})

test('the operator default and a missing key show in the suggestions state', async () => {
  fake({
    suggestions: {
      operatorModel: 'openrouter/openai/gpt-6-luna-decisions',
      hasKey: false,
    },
  })
  const { suggestions } = await get<ResponseStyleCatalog>('')
  expect(suggestions).toMatchObject({
    model: 'openrouter/openai/gpt-6-luna-decisions',
    modelSource: 'operator',
    state: 'credential_missing',
  })
  fake({ suggestions: { models: [] } })
  expect((await get<ResponseStyleCatalog>('')).suggestions.models).toEqual([])
})

test('a shipped update reads as available only once the person has an override', async () => {
  fake({ updatesAvailable: ['theorem.style.concise'] })
  expect(
    (await get<ResponseStyleDetail>('/styles/theorem.style.concise')).shipped
      ?.updateAvailable,
  ).toBe(false)
  const before = await get<ResponseStyleDetail>('/styles/theorem.style.concise')
  await send(
    'PUT',
    '/styles/theorem.style.concise',
    { name: before.name, description: '', body: before.body, frameworks: [] },
    0,
  )
  expect(
    (await get<ResponseStyleDetail>('/styles/theorem.style.concise')).shipped
      ?.updateAvailable,
  ).toBe(true)
})

test('preview answers visibly different text per variant, and says it is generated', async () => {
  const result = await send<PreviewResult>('POST', '/preview', {
    question: 'Should I batch this query?',
    variants: [
      { label: 'Concise', style: { id: 'theorem.style.concise' } },
      { label: 'Educational', style: { id: 'theorem.style.educational' } },
    ],
  })
  expect(result.generated).toBe(true)
  expect(result.model).toBeTruthy()
  expect(result.variants.map((variant) => variant.label)).toEqual([
    'Concise',
    'Educational',
  ])
  const [concise, educational] = result.variants.map((variant) => variant.text)
  expect(concise).not.toBe(educational)
  expect(concise?.length ?? 0).toBeLessThan(educational?.length ?? 0)

  const draft = await send<PreviewResult>('POST', '/preview', {
    question: 'Should I batch this query?',
    variants: [
      {
        label: 'Draft',
        draft: {
          name: 'Plain',
          description: '',
          body: '# Plain\n\nSay it plainly. Then stop.',
          frameworks: [],
        },
      },
    ],
  })
  expect(draft.variants[0]?.text).toContain('Say it plainly.')

  expect(
    await refusal(send('POST', '/preview', { question: 'x', variants: [] })),
  ).toEqual({
    status: 422,
    code: 'response_style_invalid',
  })

  // A style or revision that does not exist names the variant it was in.
  const unknownStyle = await problemOf(
    send('POST', '/preview', {
      question: 'x',
      variants: [
        { label: 'a', style: { id: 'theorem.style.concise' } },
        { label: 'b', style: { id: 'user.style.nope' } },
      ],
    }),
  )
  expect(unknownStyle).toMatchObject({
    status: 422,
    code: 'response_style_unknown',
    field: 'variants[1].style',
  })
  expect(
    await problemOf(
      send('POST', '/preview', {
        question: 'x',
        variants: [
          { label: 'a', style: { id: 'theorem.style.concise', revision: 9 } },
        ],
      }),
    ),
  ).toMatchObject({
    status: 422,
    code: 'response_style_unknown',
    field: 'variants[0].style',
  })

  fake({ previewUnavailable: true })
  expect(
    await refusal(
      send('POST', '/preview', {
        question: 'x',
        variants: [{ label: 'a', style: { id: 'theorem.style.concise' } }],
      }),
    ),
  ).toEqual({
    status: 503,
    code: 'response_preview_unavailable',
  })
})

test('describing a change returns a modified draft and saves nothing', async () => {
  const current = {
    name: 'Concise',
    description: 'Short.',
    body: '# Concise\n\nBe short.',
  }
  const result = await send<{ draft: typeof current; model: string }>(
    'POST',
    '/draft',
    {
      kind: 'style',
      current,
      instruction: 'Always give one example',
    },
  )
  expect(result.draft.body).toContain('# Concise\n\nBe short.')
  expect(result.draft.body).toContain('Always give one example')
  expect(result.draft.body).not.toBe(current.body)
  expect(result.model).toBeTruthy()
  expect(
    (await get<ResponseStyleDetail>('/styles/theorem.style.concise')).revision,
  ).toBe(0)
  expect(
    await refusal(
      send('POST', '/draft', { kind: 'style', current, instruction: ' ' }),
    ),
  ).toEqual({
    status: 422,
    code: 'response_style_invalid',
  })

  // Draft has its own code when no chat model is usable.
  fake({ previewUnavailable: true })
  expect(
    await refusal(
      send('POST', '/draft', { kind: 'style', current, instruction: 'x' }),
    ),
  ).toEqual({
    status: 503,
    code: 'response_draft_unavailable',
  })
})
