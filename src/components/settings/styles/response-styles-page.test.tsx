import { act } from 'react'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { installFakeTheorem } from '@/stories/fake-theorem'
import type { FakeRoutes } from '@/stories/fake-theorem'
import { createResponseStylesFake } from '@/stories/fixtures/response-styles'
import type { ResponseStylesFakeOptions } from '@/stories/fixtures/response-styles'
import { cleanup, click, render, waitFor } from '../../../../test/blocks/render'
import { ResponseStylesPage } from './response-styles-page'

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
beforeAll(() => page.setURL('http://localhost:3000/'))
afterAll(() => page.setURL('about:blank'))

const API = '/api/chat/v1/response-styles'
const NOW = Date.UTC(2026, 10, 9, 12)

type Sent = {
  method: string
  path: string
  body: any
  ifMatch: string | null
}
let sent: Sent[]
/** True while the test itself writes, as another tab would; those calls are not the page's. */
let quiet = false
let restore: (() => void) | undefined
let client: QueryClient

/** Installs the fake backend, recording what the page sends it. `null` is a Theorem with no response-styles routes. */
function backend(
  options: ResponseStylesFakeOptions | null,
  extra: FakeRoutes = {},
) {
  restore?.()
  const routes = options
    ? createResponseStylesFake({ now: () => NOW, ...options }).routes
    : {}
  const watched = Object.fromEntries(
    Object.entries(routes).map(([key, answer]) => [
      key,
      async (params: Record<string, string>, request: Request) => {
        if (!quiet) {
          const text = await request.clone().text()
          sent.push({
            method: request.method,
            path: new URL(request.url).pathname,
            body: text ? JSON.parse(text) : undefined,
            ifMatch: request.headers.get('If-Match'),
          })
        }
        return answer(params, request)
      },
    ]),
  )
  restore = installFakeTheorem({
    'GET /api/chat/v1/bootstrap': () => ({
      csrfToken: 'csrf',
      tenantId: 'story',
    }),
    'GET /api/chat/v1/credentials': () => ({
      credentials: [
        {
          provider: 'openrouter',
          name: 'OpenRouter',
          configured: false,
          source: null,
        },
      ],
    }),
    ...watched,
    ...extra,
  })
}

/** Writes to the fake the way another tab would, before the page reads. */
async function elsewhere(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  quiet = true
  try {
    const response = await fetch(`http://localhost:3000${API}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return response.status === 204 ? undefined : await response.json()
  } finally {
    quiet = false
  }
}

beforeEach(() => {
  sent = []
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 1 } },
  })
})
afterEach(async () => {
  await cleanup()
  client.clear()
  restore?.()
})

async function mount({ settle = true } = {}) {
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>
        <Outlet />
      </QueryClientProvider>
    ),
  })
  const styles = createRoute({
    getParentRoute: () => root,
    path: '/settings/styles',
    component: ResponseStylesPage,
  })
  const keys = createRoute({
    getParentRoute: () => root,
    path: '/settings/keys',
    component: () => <p>The keys page</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([styles, keys]),
    history: createMemoryHistory({ initialEntries: ['/settings/styles'] }),
  })
  await router.load()
  const view = await render(<RouterProvider router={router} />)
  if (settle) await waitFor(() => !client.isFetching())
  return { ...view, router }
}

// -- finding things -----------------------------------------------------------

const text = () => document.body.textContent
const byLabel = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`)
const button = (name: string | RegExp) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    typeof name === 'string'
      ? item.textContent.trim() === name
      : name.test(item.textContent),
  )
const waitButton = (name: string | RegExp) => waitFor(() => button(name))
/** A text control by its visible label, or by its accessible name where it has no visible one. */
const field = (label: string) => {
  const found = [...document.querySelectorAll('label')].find(
    (item) => item.textContent.trim() === label,
  )
  return (
    found
      ? document.getElementById(found.htmlFor)
      : document.querySelector(`[aria-label="${label}"]`)
  ) as HTMLInputElement | HTMLTextAreaElement | null
}
const waitField = (label: string) => waitFor(() => field(label))
const waitText = (words: string) => waitFor(() => text().includes(words))
const DIFF = /\d+ lines? added, \d+ lines? removed\./
const waitDiff = () => waitFor(() => DIFF.test(text()))
const tab = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (item) => item.textContent.trim() === name,
  )
const dialog = () =>
  document.querySelector<HTMLElement>('[data-slot="alert-dialog-popup"]')
const inDialog = (name: string) =>
  [...(dialog()?.querySelectorAll('button') ?? [])].find(
    (item) => item.textContent.trim() === name,
  )
/** What the page asked the server to change. A draft or a preview is asked for with a POST but changes nothing. */
const writes = (method?: string) =>
  sent.filter(
    (item) =>
      item.method !== 'GET' &&
      !/\/(draft|preview)$/.test(item.path) &&
      (!method || item.method === method),
  )

/** Types into a controlled field the way a keyboard would. */
const type = (element: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(async () => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(
      element,
      value,
    )
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })

/** The check mark of a framework in the style editor: its box, and the hidden input beside it that the browser presses. */
const checkbox = (name: string) =>
  document
    .querySelector(`[role="checkbox"][aria-label="${name}"]`)
    ?.parentElement?.querySelector<HTMLInputElement>('input[type="checkbox"]')
const checked = (name: string) =>
  document
    .querySelector(`[role="checkbox"][aria-label="${name}"]`)
    ?.getAttribute('aria-checked') === 'true'
const tick = (name: string) => click(checkbox(name)!)

/** Opens a style in the editor from the list and waits for it to load. */
async function openStyle(name: string) {
  await click(await waitFor(() => byLabel(`Edit ${name}`)))
  await waitField('Name')
  await waitFor(() => field('Name')?.value === name)
}

// -- the list -------------------------------------------------------------------

test('the list shows shipped and user styles, marks an edited shipped one, and offers each what it may do', async () => {
  backend({ updatesAvailable: ['theorem.style.formal'] })
  await elsewhere('POST', '/styles', {
    name: 'Mine',
    description: 'My own',
    body: 'Answer in my way.',
    frameworks: [],
  })
  await elsewhere(
    'PUT',
    '/styles/theorem.style.formal',
    {
      name: 'Formal',
      description: 'Formal, edited',
      body: 'Be formal, my way.',
      frameworks: ['theorem.framework.explanation'],
    },
    { 'If-Match': '0' },
  )
  await mount()
  await waitFor(() => byLabel('Edit Concise'))

  const rows = new Map(
    [...document.querySelectorAll('[aria-label="Styles"] > li')].map((row) => [
      row.querySelector('span')?.textContent ?? '',
      row,
    ]),
  )
  expect([...rows.keys()]).toEqual([
    'Default',
    'Concise',
    'Exploratory',
    'Educational',
    'Formal',
    'Mine',
  ])
  const concise = rows.get('Concise')!
  expect(concise.textContent).toContain('Shipped')
  expect(concise.textContent).not.toContain('Edited')
  // Nothing to delete and nothing to reset: it is Theorem's and unchanged.
  expect(concise.querySelector('[aria-label="Delete Concise"]')).toBeNull()
  expect(
    concise.querySelector('[aria-label="Reset Concise to shipped"]'),
  ).toBeNull()

  const formal = rows.get('Formal')!
  expect(formal.textContent).toContain('Shipped')
  expect(formal.textContent).toContain('Edited')
  expect(formal.textContent).toContain('Update available')
  expect(formal.querySelector('[aria-label="Delete Formal"]')).toBeNull()
  expect(
    formal.querySelector('[aria-label="Reset Formal to shipped"]'),
  ).not.toBeNull()

  const mine = rows.get('Mine')!
  expect(mine.textContent).toContain('Yours')
  expect(mine.textContent).toContain('My own')
  expect(mine.querySelector('[aria-label="Delete Mine"]')).not.toBeNull()
  expect(mine.querySelector('[aria-label="Duplicate Mine"]')).not.toBeNull()
})

// -- editing --------------------------------------------------------------------

test('saving sends the revision the style was opened at as If-Match, and shows the revision it became', async () => {
  backend({})
  await mount()
  await openStyle('Concise')
  expect(text()).toContain('No unsaved changes.')
  const save = () => button('Save')!
  expect(save().disabled).toBe(true)

  await type(await waitField('Instructions'), 'Answer in one line.')
  await waitText('Unsaved changes')
  expect(save().disabled).toBe(false)
  expect(writes()).toHaveLength(0)

  await click(save())
  await waitText('Saved as revision 1.')
  const [put, ...rest] = writes()
  expect(rest).toHaveLength(0)
  expect(put?.method).toBe('PUT')
  expect(put?.path).toBe(`${API}/styles/theorem.style.concise`)
  expect(put?.ifMatch).toBe('0')
  expect(put?.body).toMatchObject({
    name: 'Concise',
    body: 'Answer in one line.',
  })
  // The page now holds the saved text, and History lists the new revision as the current one.
  expect(field('Instructions')?.value).toBe('Answer in one line.')
  const revisions = await waitFor(() => byLabel('Revisions'))
  await waitFor(() => revisions.textContent.includes('Revision 1'))
  expect(revisions.textContent).toContain('Revision 0')
  expect(revisions.querySelector('li')?.textContent).toContain('Current')
})

test('a style needs a name and instructions before it can be saved', async () => {
  backend({})
  await mount()
  await openStyle('Concise')
  await type(await waitField('Name'), '')
  await waitText('A style needs a name and instructions.')
  expect(button('Save')!.disabled).toBe(true)
})

test('a 412 shows a notice that keeps the text; Reload takes the newer revision', async () => {
  backend({})
  await mount()
  await openStyle('Concise')
  await elsewhere(
    'PUT',
    '/styles/theorem.style.concise',
    {
      name: 'Concise',
      description: 'Shorter, elsewhere',
      body: 'Elsewhere text.',
      frameworks: [],
    },
    { 'If-Match': '0' },
  )

  await type(await waitField('Instructions'), 'My own text.')
  await waitText('Unsaved changes')
  await click(button('Save')!)
  await waitText('This style changed elsewhere')
  expect(writes('PUT')).toHaveLength(1)
  // Nothing is lost: the text I typed is still in the editor.
  expect(field('Instructions')?.value).toBe('My own text.')
  expect(button('Keep my text and compare')).toBeDefined()

  await click(button('Reload')!)
  await waitFor(() => field('Instructions')?.value === 'Elsewhere text.')
  expect(text()).not.toContain('This style changed elsewhere')
  expect(text()).toContain('No unsaved changes.')
})

test('Keep my text and compare shows the two side by side, and the next save is made over the newer revision', async () => {
  backend({})
  await mount()
  await openStyle('Concise')
  await elsewhere(
    'PUT',
    '/styles/theorem.style.concise',
    {
      name: 'Concise',
      description: 'Shorter, elsewhere',
      body: 'Elsewhere text.',
      frameworks: [],
    },
    { 'If-Match': '0' },
  )
  await type(await waitField('Instructions'), 'My own text.')
  await click(button('Save')!)
  await waitText('This style changed elsewhere')

  await click(button('Keep my text and compare')!)
  await waitText('Saving now replaces the version saved elsewhere.')
  expect(button('Keep my text and compare')).toBeUndefined()
  expect(field('Instructions')?.value).toBe('My own text.')

  await click(button('Save')!)
  await waitText('Saved as revision 2.')
  const puts = writes('PUT')
  expect(puts.map((item) => item.ifMatch)).toEqual(['0', '1'])
  expect(text()).not.toContain('This style changed elsewhere')
})

test('describe a change shows the proposed difference and applies it to the editor only on request', async () => {
  backend({})
  await mount()
  await openStyle('Concise')
  const before = field('Instructions')!.value

  await type(await waitField('Describe a change'), 'Make it warmer')
  await click(await waitButton('Draft the change'))
  await waitFor(() => byLabel('Proposed change'))
  expect(sent.find((item) => item.path === `${API}/draft`)?.body).toMatchObject(
    { instruction: 'Make it warmer' },
  )
  // Reviewing is not applying.
  expect(field('Instructions')?.value).toBe(before)
  expect(text()).toContain('No unsaved changes.')
  expect(text()).toMatch(DIFF)

  await click(button('Apply to editor')!)
  await waitFor(() =>
    field('Instructions')?.value.includes(
      'Adjustment asked for: Make it warmer',
    ),
  )
  expect(text()).toContain('Unsaved changes')
  expect(text()).toContain('It is not saved until you save.')
  // Applied is still not saved.
  expect(writes()).toHaveLength(0)
  expect(byLabel('Proposed change')).toBeNull()
})

test('discarding a proposed change leaves the editor as it was', async () => {
  backend({})
  await mount()
  await openStyle('Concise')
  const before = field('Instructions')!.value
  await type(await waitField('Describe a change'), 'Make it warmer')
  await click(await waitButton('Draft the change'))
  await waitFor(() => byLabel('Proposed change'))

  await click(button('Discard')!)
  await waitFor(() => !byLabel('Proposed change'))
  expect(field('Instructions')?.value).toBe(before)
  expect(text()).toContain('No unsaved changes.')
})

test('drafting says so when no chat model is available', async () => {
  backend({ previewUnavailable: true })
  await mount()
  await openStyle('Concise')
  await type(await waitField('Describe a change'), 'Make it warmer')
  await click(await waitButton('Draft the change'))
  await waitText('Drafting needs a chat model')
  expect(text()).toContain(
    'Theorem has no usable chat model to write a draft with.',
  )
})

// -- preview --------------------------------------------------------------------

test('preview of a changed style shows the saved and the draft answers as two labelled columns, said to be model-written', async () => {
  backend({})
  await mount()
  await openStyle('Concise')
  await type(await waitField('Instructions'), 'Answer in one line.')
  await type(await waitField('Sample question'), 'Why is the sky blue?')
  await click(await waitButton('Preview'))
  await waitText('Model-generated previews')

  const preview = byLabel('Preview')!
  expect(preview.textContent).toContain('Written by')
  expect(preview.textContent).toContain('Nothing was run')
  const saved = preview.querySelector('[aria-label="Saved"]')
  const draft = preview.querySelector('[aria-label="Draft"]')
  expect(saved).not.toBeNull()
  expect(draft).not.toBeNull()
  expect(saved?.textContent).not.toEqual(draft?.textContent)
  expect(draft?.textContent).toContain('Answer in one line.')

  const [request] = sent.filter((item) => item.path === `${API}/preview`)
  expect(request?.body.question).toBe('Why is the sky blue?')
  expect(request?.body.variants).toEqual([
    { label: 'Saved', style: { id: 'theorem.style.concise', revision: 0 } },
    expect.objectContaining({ label: 'Draft' }),
  ])

  // Editing again says the preview is out of date.
  await type(await waitField('Instructions'), 'Another way.')
  await waitText('The draft has changed since this preview.')
})

test('preview says a chat model is needed, with the server detail, when none is', async () => {
  backend({ previewUnavailable: true })
  await mount()
  await openStyle('Concise')
  await type(await waitField('Sample question'), 'Why is the sky blue?')
  await click(await waitButton('Preview'))
  await waitText('Preview needs a chat model')
  expect(text()).toContain(
    'Theorem has no usable chat model to write a preview with.',
  )
})

// -- history --------------------------------------------------------------------

/** Saves a new text for Concise through the page, so it stands at revision 1. */
async function editConcise(textOf: string) {
  await openStyle('Concise')
  await type(await waitField('Instructions'), textOf)
  await click(button('Save')!)
  await waitText('Saved as revision 1.')
}

test('restoring a version asks first, says it makes a new revision, and does', async () => {
  backend({})
  await mount()
  await editConcise('Answer in one line.')
  await waitFor(() => byLabel('Restore revision 0'))

  await click(byLabel('Restore revision 0')!)
  const confirm = await waitFor(() => dialog())
  expect(confirm.textContent).toContain('saves a new revision')
  expect(confirm.textContent).toContain('Nothing is deleted')
  expect(writes('POST')).toHaveLength(0)

  await click(inDialog('Restore this version')!)
  await waitText('Saved as revision 2.')
  const [restored] = writes('POST')
  expect(restored?.path).toBe(`${API}/styles/theorem.style.concise/restore`)
  expect(restored?.body).toEqual({ revision: 0 })
  expect(restored?.ifMatch).toBe('1')
  const revisions = byLabel('Revisions')!
  await waitFor(() => revisions.textContent.includes('Revision 2'))
  // The older revisions are all still there.
  expect(revisions.textContent).toContain('Revision 1')
  expect(revisions.textContent).toContain('Revision 0')
})

test('Compare with current shows what changed since that revision', async () => {
  backend({})
  await mount()
  await editConcise('Answer in one line.')
  await click(await waitFor(() => byLabel('Compare revision 0 with current')))
  await waitText('What changed from revision 0 to the current revision 1.')
  await waitDiff()
})

test('the history names what made each revision, and the shipped baseline by its own name', async () => {
  backend({})
  await mount()
  await editConcise('Answer in one line.')
  const revisions = await waitFor(() => byLabel('Revisions'))
  await waitFor(() => revisions.textContent.includes('Revision 1'))
  const [latest, baseline] = [...revisions.querySelectorAll('li')]
  expect(latest?.textContent).toContain('Edit')
  expect(baseline?.textContent).toContain('Revision 0')
  expect(baseline?.textContent).toContain('Shipped baseline')
  expect(latest?.textContent).not.toContain('Shipped baseline')
})

test('a style the person made has no shipped baseline in its history', async () => {
  backend({})
  await elsewhere('POST', '/styles', {
    name: 'Mine',
    description: '',
    body: 'Answer my way.',
    frameworks: [],
  })
  await mount()
  await openStyle('Mine')
  const revisions = await waitFor(() => byLabel('Revisions'))
  await waitFor(() => revisions.querySelector('li'))
  expect(revisions.querySelectorAll('li')).toHaveLength(1)
  expect(revisions.textContent).toContain('Revision 1')
  expect(revisions.textContent).not.toContain('Shipped baseline')
})

test('Reset to shipped is offered on an edited shipped style, and saves a new revision', async () => {
  backend({})
  await mount()
  await editConcise('Answer in one line.')
  const reset = await waitButton('Reset to shipped')
  await click(reset)
  const confirm = await waitFor(() => dialog())
  expect(confirm.textContent).toContain('saves a new revision')
  await click(inDialog('Reset to shipped')!)
  await waitText('Saved as revision 2.')
  const [restored] = writes('POST')
  expect(restored?.body).toEqual({ shipped: true })
  expect(restored?.ifMatch).toBe('1')
  expect(field('Instructions')?.value).not.toBe('Answer in one line.')
})

// -- frameworks ---------------------------------------------------------------

/** Moves to the Frameworks tab and opens one framework. */
async function openFramework(name: string) {
  await click(await waitFor(() => tab('Frameworks')))
  await click(await waitFor(() => byLabel(`Edit ${name}`)))
  await waitField('Name')
  await waitFor(() => field('Name')?.value === name)
}

test('the frameworks list shows references and which styles use each', async () => {
  backend({})
  await mount()
  await click(await waitFor(() => tab('Frameworks')))
  const list = await waitFor(() => byLabel('Frameworks'))
  await waitFor(() =>
    list.textContent.includes('Understanding through explanation'),
  )
  expect(list.textContent).toContain(
    'References: Source notes, Varied applications',
  )
  expect(list.textContent).toContain('Used by: Default, Concise')
})

test('a framework used by several styles says saving changes it for all of them, and Duplicate for re-points one style', async () => {
  backend({})
  await mount()
  await openFramework('Understanding through explanation')
  await waitText('Saving changes this framework for 5 styles:')
  expect(text()).toContain('Default, Concise, Exploratory, Educational, Formal')

  await click(button('Duplicate for Formal')!)
  // The copy opens in the editor: it is used by Formal alone, so nothing is shared any more.
  await waitFor(() => !text().includes('Saving changes this framework for'))
  const [made] = writes('POST')
  expect(made?.path).toBe(`${API}/frameworks`)
  expect(made?.body).toEqual({
    from: 'theorem.framework.explanation',
    forStyle: 'theorem.style.formal',
  })

  // Formal now lists the copy; the others keep the shipped framework.
  const styleNamed = async (id: string) =>
    (
      await fetch(`http://localhost:3000${API}/styles/${id}`)
    ).json() as Promise<{ frameworks: string[] }>
  const formal = await styleNamed('theorem.style.formal')
  expect(formal.frameworks).not.toContain('theorem.framework.explanation')
  expect(formal.frameworks).toHaveLength(1)
  expect((await styleNamed('theorem.style.concise')).frameworks).toContain(
    'theorem.framework.explanation',
  )
  expect(field('Name')?.value).not.toBe('')
})

test('deleting a framework that a style still lists says which, and removes nothing', async () => {
  backend({})
  await elsewhere('POST', '/frameworks', {
    from: 'theorem.framework.explanation',
    forStyle: 'theorem.style.concise',
    name: 'Explanation for Concise',
  })
  await mount()
  await click(await waitFor(() => tab('Frameworks')))
  await click(await waitFor(() => byLabel('Delete Explanation for Concise')))
  const confirm = await waitFor(() => dialog())
  expect(confirm.textContent).toContain('Theorem will refuse')

  await click(inDialog('Delete framework')!)
  await waitText('is still listed by Concise; take it off those styles first')
  const [attempt] = writes('DELETE')
  expect(attempt?.ifMatch).toBe('1')
  expect(byLabel('Delete Explanation for Concise')).not.toBeNull()
})

// -- defaults and suggestions -------------------------------------------------

test("choosing Theorem's default is not choosing the style named Default", async () => {
  backend({})
  await mount()
  await waitFor(() => byLabel('Your default style'))
  const inherit = byLabel("Use Theorem's default")!
  const named = byLabel('Default')
  expect(inherit).not.toBeNull()
  expect(named).not.toBeNull()
  expect(inherit).not.toBe(named)
  expect(inherit.getAttribute('aria-checked')).toBe('true')
  expect(text()).toContain("Use Theorem's default (Default)")
  expect(text()).toContain('not the same as choosing the style named Default')
  expect(text()).toContain("Set as this project's default")

  // The page may be told twice for one press (happy-dom fires the label's click as well as the radio's); both say the same thing.
  const lastChoice = async (style: string | null) => {
    await waitFor(
      () =>
        writes('PUT').length > 0 &&
        writes('PUT').every((item) => item.body.style === style),
    )
    const puts = writes('PUT')
    expect(puts.every((item) => item.path === `${API}/selection`)).toBe(true)
    expect(puts.every((item) => item.body.scope === 'account')).toBe(true)
    sent = []
  }

  await click(byLabel('Concise')!)
  await lastChoice('theorem.style.concise')
  await waitText('Your default is Concise.')

  // The style named Default is a choice of its own: it is sent as that style.
  await click(byLabel('Default')!)
  await lastChoice('theorem.style.default')
  await waitText('Your default is Default.')

  // And inheriting sends null.
  await click(byLabel("Use Theorem's default")!)
  await lastChoice(null)
  await waitText('You have not chosen a default')
})

const MODELS = {
  jev: 'openrouter/typesafe/jev-1.14',
  luna: 'openrouter/openai/gpt-6-luna-decisions',
}

/** Opens the Decision model list and picks one entry by its words. */
async function chooseModel(name: string) {
  const trigger = await waitFor(() =>
    document.querySelector<HTMLElement>(
      '[aria-labelledby="decision-model-label"]',
    ),
  )
  // Base UI opens a select as the mouse goes down on it.
  await act(async () => {
    trigger.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0 }),
    )
  })
  await waitFor(() => document.querySelector('[role="option"]'))
  // Base UI ignores a choice made the instant the list opens, so that the press that opened it cannot also pick.
  await act(() => new Promise((resolve) => setTimeout(resolve, 400)))
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((item) => item.textContent.trim() === name)
  if (!option) throw new Error(`No decision model named ${name}`)
  await act(async () => {
    option.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, button: 0 }),
    )
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
  })
}

const suggestionWrites = () =>
  writes('PUT').filter((item) => item.path === `${API}/suggestions`)

test('suggestions: the decision model is chosen from a list, and each choice is sent as the contract says', async () => {
  backend({})
  await mount()
  await waitFor(() => text().includes('Decision model'))
  expect(text()).toContain('Use the default (TypeSafe: Jev 1.14)')
  expect(text()).toContain('optional hints')
  expect(text()).toContain('changes nothing else about your answers')

  await chooseModel('OpenAI: GPT-6 Luna Decisions')
  await waitFor(() => suggestionWrites().length > 0)
  expect(suggestionWrites().at(-1)?.body).toEqual({ model: MODELS.luna })
  await waitText(
    'Suggestions are on. OpenAI: GPT-6 Luna Decisions offers hints',
  )

  await chooseModel('None')
  await waitFor(() => suggestionWrites().at(-1)?.body.model === 'none')
  expect(suggestionWrites().at(-1)?.body).toEqual({ model: 'none' })

  // Back to the default is `null`, not the name of the default model.
  await chooseModel('Use the default')
  await waitFor(() => suggestionWrites().at(-1)?.body.model === null)
  expect(suggestionWrites().at(-1)?.body).toEqual({ model: null })
})

test('suggestions: the switch turns them off without touching the decision model', async () => {
  backend({})
  await mount()
  const toggle = await waitFor(() =>
    document.querySelector<HTMLElement>('[role="switch"]'),
  )
  expect(toggle.getAttribute('aria-checked')).toBe('true')
  await click(toggle)
  await waitFor(() => suggestionWrites().length > 0)
  expect(suggestionWrites().at(-1)?.body).toEqual({ enabled: false })
  await waitText('Suggestions are off.')
})

test('suggestions: a missing key is named, with a link to API keys', async () => {
  backend({
    suggestions: {
      hasKey: false,
      last: { state: 'unavailable', code: 'rate_limited', atMs: NOW },
    },
  })
  const { router } = await mount()
  await waitText('The OpenRouter connection has no key')
  expect(text()).toContain('Last turn: unavailable (rate limited)')
  const link = await waitFor(() =>
    [...document.querySelectorAll('a')].find(
      (item) => item.textContent.trim() === 'API keys',
    ),
  )
  expect(link.getAttribute('href')).toBe('/settings/keys')
  await click(link)
  await waitFor(() => router.state.location.pathname === '/settings/keys')
})

test('suggestions: the status says what the last turn did', async () => {
  backend({
    suggestions: { last: { state: 'suggested', atMs: NOW } },
  })
  await mount()
  await waitText('Last turn: suggested')
})

// -- making, copying, deleting, resetting ---------------------------------------

test('a new style is made from a name and instructions, and opens when made', async () => {
  backend({})
  await mount()
  await click(await waitButton('New style'))
  await waitField('Name')
  expect(button('Create style')!.disabled).toBe(true)
  await type(await waitField('Name'), 'Brief')
  await type(await waitField('Instructions'), 'Answer briefly.')
  await tick('Understanding through explanation')
  expect(checked('Understanding through explanation')).toBe(true)
  await click(button('Create style')!)

  await waitFor(() => writes('POST').length > 0)
  const [made] = writes('POST')
  expect(made?.path).toBe(`${API}/styles`)
  expect(made?.body).toMatchObject({
    name: 'Brief',
    body: 'Answer briefly.',
    frameworks: ['theorem.framework.explanation'],
  })
  // It opens as a saved style of the person's own.
  await waitFor(() => button('Save'))
  expect(field('Name')?.value).toBe('Brief')
  expect(text()).toContain('Yours')
})

test('Duplicate makes a copy and opens it', async () => {
  backend({})
  await mount()
  await click(await waitFor(() => byLabel('Duplicate Concise')))
  await waitFor(() => field('Name')?.value === 'Concise copy')
  const [made] = writes('POST')
  expect(made?.body).toEqual({
    from: 'theorem.style.concise',
    name: 'Concise copy',
  })
  expect(text()).toContain('Yours')
})

test('deleting asks first, and only a style the person made can be deleted', async () => {
  backend({})
  await elsewhere('POST', '/styles', {
    name: 'Mine',
    description: '',
    body: 'Answer in my way.',
    frameworks: [],
  })
  await mount()
  await click(await waitFor(() => byLabel('Delete Mine')))
  const confirm = await waitFor(() => dialog())
  expect(confirm.textContent).toContain('Delete Mine?')
  expect(confirm.textContent).toContain('cannot be undone')
  // Cancelling sends nothing.
  await click(inDialog('Cancel')!)
  await waitFor(() => !dialog())
  expect(writes()).toHaveLength(0)
  expect(byLabel('Edit Mine')).not.toBeNull()

  await click(byLabel('Delete Mine')!)
  await waitFor(() => dialog())
  await click(inDialog('Delete style')!)
  await waitFor(() => !byLabel('Edit Mine'))
  const [removed] = writes('DELETE')
  expect(removed?.path).toMatch(/\/styles\//)
  expect(removed?.ifMatch).toBe('1')
})

test('Reset to shipped in the list asks first and saves a new revision', async () => {
  backend({})
  await elsewhere(
    'PUT',
    '/styles/theorem.style.formal',
    {
      name: 'Formal',
      description: 'Formal, edited',
      body: 'Be formal, my way.',
      frameworks: [],
    },
    { 'If-Match': '0' },
  )
  await mount()
  await click(await waitFor(() => byLabel('Reset Formal to shipped')))
  const confirm = await waitFor(() => dialog())
  expect(confirm.textContent).toContain('saves a new revision')
  await click(inDialog('Reset to shipped')!)
  await waitFor(() => writes('POST').length > 0)
  const [reset] = writes('POST')
  expect(reset?.path).toBe(`${API}/styles/theorem.style.formal/restore`)
  expect(reset?.body).toEqual({ shipped: true })
  expect(reset?.ifMatch).toBe('1')
})

test('going back with unsaved text asks first; staying keeps the text', async () => {
  backend({})
  await mount()
  await openStyle('Concise')
  await type(await waitField('Instructions'), 'Draft text.')
  await waitText('Unsaved changes')

  await click(button('All styles')!)
  const confirm = await waitFor(() => dialog())
  expect(confirm.textContent).toContain('Leave without saving?')
  await click(inDialog('Cancel')!)
  await waitFor(() => !dialog())
  expect(field('Instructions')?.value).toBe('Draft text.')

  await click(button('All styles')!)
  await waitFor(() => dialog())
  await click(inDialog('Leave without saving')!)
  await waitFor(() => byLabel('Edit Concise'))
  expect(writes()).toHaveLength(0)
})

test('leaving the page with unsaved text asks first, and staying keeps the text', async () => {
  backend({})
  const { router } = await mount()
  await openStyle('Concise')
  await type(await waitField('Instructions'), 'Draft text.')
  await waitText('Unsaved changes')

  await act(async () => {
    void router.navigate({ to: '/settings/keys' })
  })
  const confirm = await waitFor(() => dialog())
  expect(confirm.textContent).toContain('Leave this page without saving?')
  expect(router.state.location.pathname).toBe('/settings/styles')
  await click(inDialog('Stay on this page')!)
  await waitFor(() => !dialog())
  expect(router.state.location.pathname).toBe('/settings/styles')
  expect(field('Instructions')?.value).toBe('Draft text.')

  await act(async () => {
    void router.navigate({ to: '/settings/keys' })
  })
  await waitFor(() => dialog())
  await click(inDialog('Leave without saving')!)
  await waitFor(() => router.state.location.pathname === '/settings/keys')
  expect(writes()).toHaveLength(0)
})

test('leaving the page with nothing unsaved asks nothing', async () => {
  backend({})
  const { router } = await mount()
  await openStyle('Concise')
  await act(async () => {
    void router.navigate({ to: '/settings/keys' })
  })
  await waitFor(() => router.state.location.pathname === '/settings/keys')
  expect(dialog()).toBeNull()
})

test('unsaved text survives a look at another tab', async () => {
  backend({})
  await mount()
  await openStyle('Concise')
  await type(await waitField('Instructions'), 'Draft text.')
  await click(tab('Defaults and suggestions')!)
  await waitFor(() => byLabel('Your default style'))
  await click(tab('Styles')!)
  expect(field('Instructions')?.value).toBe('Draft text.')
  expect(text()).toContain('Unsaved changes')
})

// -- a newer shipped version ----------------------------------------------------

test('an edited style with a newer shipped version offers to compare and to take it', async () => {
  backend({ updatesAvailable: ['theorem.style.formal'] })
  await elsewhere(
    'PUT',
    '/styles/theorem.style.formal',
    {
      name: 'Formal',
      description: 'Formal, edited',
      body: 'Be formal, my way.',
      frameworks: [],
    },
    { 'If-Match': '0' },
  )
  await mount()
  await openStyle('Formal')
  await waitText('Theorem has a newer shipped version')
  expect(text()).toContain('Update available')

  await click(button('Compare with the new shipped version')!)
  await waitText('What taking the shipped version would change')
  await waitDiff()

  await click(button('Take the shipped version')!)
  const confirm = await waitFor(() => dialog())
  expect(confirm.textContent).toContain('saves a new revision')
  expect(writes()).toHaveLength(0)
  await click(inDialog('Take the shipped version')!)
  await waitText('Saved as revision 2.')
  expect(writes('POST')[0]?.body).toEqual({ shipped: true })
})

// -- framework editing ----------------------------------------------------------

test('saving a framework sends its revision, and says it changes every style that lists it', async () => {
  backend({})
  await mount()
  await openFramework('Research related questions')
  await waitText('Saving changes this framework for 3 styles:')
  const instructions = await waitField('Instructions')
  await type(instructions, 'Look wider.')
  await click(button('Save')!)
  await waitText('Saved as revision 1.')
  const [put] = writes('PUT')
  expect(put?.path).toBe(
    `${API}/frameworks/theorem.framework.related-questions`,
  )
  expect(put?.ifMatch).toBe('0')
  expect(put?.body.body).toBe('Look wider.')
})

// -- the page itself ------------------------------------------------------------

test('a Theorem that does not serve response styles gets one calm line, and no editor', async () => {
  backend(null)
  await mount()
  await waitText('This Theorem does not serve response styles yet')
  expect(text()).toContain('Response styles are not available here')
  expect(document.querySelector('[role="tab"]')).toBeNull()
  expect(document.querySelector('[role="alert"]')).toBeNull()
})

test('a Theorem that fails to list its styles says why, with the server detail', async () => {
  backend(null, {
    'GET /api/chat/v1/response-styles': () =>
      new Response(
        JSON.stringify({
          title: 'Store unavailable',
          detail: 'The style store is not reachable.',
          code: 'store_unavailable',
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/problem+json' },
        },
      ),
  })
  await mount()
  await waitText('Theorem did not list its styles')
  expect(text()).toContain('The style store is not reachable.')
  expect(text()).not.toContain('does not serve response styles')
})

test('the page says it is loading while the styles are read', async () => {
  backend(null, {
    'GET /api/chat/v1/response-styles': () => new Promise(() => undefined),
  })
  await mount({ settle: false })
  await waitText('Loading styles.')
})
