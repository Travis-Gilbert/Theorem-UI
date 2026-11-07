// SOURCING: bun:test over Puck's Render with the app's page config, rendered
// with React into happy-dom (test/workspace's render, which supplies a
// QueryClient). Only the plain built-ins are placed, so nothing reaches a
// Theorem; fetch is not stubbed because nothing here calls it.
import { Render } from '@puckeditor/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, spyOn, test } from 'bun:test'
import { Activity, act, useEffect, useState } from 'react'
import { cleanup, render, waitFor } from '../../../test/workspace'
import { validateConnections } from '@/lib/modules/connections'
import type { ComponentData, LayoutData } from '@/lib/modules/contract'
import {
  MISSING_TYPE,
  prepareLayout,
  restoreLayout,
} from '@/lib/modules/layout'
import {
  allModules,
  builtin,
  moduleById,
  registerBuiltin,
  setInstalled,
} from '@/lib/modules/registry'
import type { ModuleDefinition, ModuleViewProps } from '@/lib/modules/registry'
import { MAX_EVENT_DEPTH } from '@/lib/modules/runtime'
import { BUILTIN_TEMPLATES } from '@/lib/modules/templates'
import { create } from 'zustand'
import { observer } from '@/components/index/observe'
import { useOwner } from './builtins'
import type { OwnerStore } from './builtins'
import { ContentRendererContext } from './module-instance'
import {
  PageRuntimeProvider,
  PageScopeProvider,
  useModuleAction,
  useModuleActions,
} from './page-runtime'
import { useContentRenderer } from './page-view'
import { LAYOUT_TYPES, SPLIT_TYPE, pageConfig } from './puck-config'

afterEach(cleanup)

const instance = (
  type: string,
  id: string,
  props: Record<string, unknown> = {},
): ComponentData => ({ type, props: { id, ...props } })

const known = (type: string) => LAYOUT_TYPES.has(type)

// One config for every render, as usePageConfig keeps it: a new one is new
// component types, and React would remount every module on each render.
let config: ReturnType<typeof pageConfig> | undefined

function page(layout: LayoutData) {
  const prepared = prepareLayout(layout, (type) => moduleById(type), known)
  config ??= pageConfig(allModules())
  return (
    <PageRuntimeProvider>
      <PageScopeProvider layout={layout}>
        <Render
          config={config}
          data={prepared}
          metadata={{ arranging: false }}
        />
      </PageScopeProvider>
    </PageRuntimeProvider>
  )
}

const renderPage = (layout: LayoutData) => render(page(layout))

const shownValues = (container: HTMLElement) =>
  [...container.querySelectorAll('pre')].map((pre) => pre.textContent)

test("a value bound to another instance's output shows it, inside a split too", async () => {
  const { container } = await renderPage({
    root: { props: {} },
    content: [
      instance('theorem.text', 'note', { text: 'hello' }),
      instance(SPLIT_TYPE, 'split', {
        direction: 'row',
        ratio: 50,
        height: 300,
        first: [
          instance('theorem.value', 'shown', {
            bind: { value: { from: 'note', port: 'text' } },
          }),
        ],
        second: [instance('theorem.value', 'unbound')],
      }),
    ],
  })
  const shown = await waitFor(() =>
    [...container.querySelectorAll('pre')].find(
      (pre) => pre.textContent === '"hello"',
    ),
  )
  expect(shown).toBeDefined()
  // The unbound one says so rather than showing a stale or made-up value.
  expect(container.textContent).toContain('Nothing has come in yet.')
})

// Hiding a page (React's Activity) runs every effect's cleanup and showing it
// runs them again on the same state, as a remount does; development's
// StrictMode does the same. The browser check found that this left the
// page's runtime disposed but still in use: values published before the
// cleanup stayed, and nothing published after it arrived.
test('a value published after the page is hidden and shown still arrives', async () => {
  const layout = (text: string): LayoutData => ({
    root: { props: {} },
    content: [
      instance('theorem.text', 'note', { text }),
      instance('theorem.value', 'shown', {
        bind: { value: { from: 'note', port: 'text' } },
      }),
    ],
  })
  const ui = (text: string, mode: 'visible' | 'hidden') => (
    <Activity mode={mode}>{page(layout(text))}</Activity>
  )
  const { container, queryClient, root } = await render(ui('first', 'visible'))
  const show = (text: string, mode: 'visible' | 'hidden') =>
    act(() =>
      root.render(
        <QueryClientProvider client={queryClient}>
          {ui(text, mode)}
        </QueryClientProvider>,
      ),
    )
  await waitFor(() => shownValues(container).includes('"first"'))

  show('first', 'hidden')
  show('first', 'visible')
  show('second', 'visible')
  await waitFor(() => shownValues(container).includes('"second"'))
  expect(shownValues(container)).toEqual(['"second"'])
})

// Review found that moving an instance's route (arranging does) unwired it
// for a moment, which took its published values and blanked what read them.
test('a value stays while the routes of the instance it comes from change', async () => {
  const layout = (on: Record<string, unknown>): LayoutData => ({
    root: { props: {} },
    content: [
      instance('theorem.text', 'note', { text: 'hello', on }),
      instance('theorem.value', 'shown', {
        bind: { value: { from: 'note', port: 'text' } },
      }),
    ],
  })
  const { container, queryClient, root } = await renderPage(layout({}))
  await waitFor(() => shownValues(container).includes('"hello"'))
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        {page(
          layout({ changed: [{ to: { instance: 'shown', action: 'show' } }] }),
        )}
      </QueryClientProvider>,
    ),
  )
  await act(() => Bun.sleep(20))
  expect(shownValues(container)).toEqual(['"hello"'])
})

function Sender({ emit }: ModuleViewProps) {
  return <button onClick={() => emit('pick', 'chosen')}>Pick</button>
}

function Shows() {
  const [shown, setShown] = useState('nothing yet')
  useModuleAction('show', (payload) => setShown(`shown: ${String(payload)}`))
  return <output>{shown}</output>
}

/** Shows what reached it, and hands it on when clicked: a linked view. */
function Linked({ emit }: ModuleViewProps) {
  const [shown, setShown] = useState(0)
  useModuleAction('show', () => setShown((n) => n + 1))
  return <button onClick={() => emit('pick', 'x')}>{`shown ${shown}`}</button>
}

function ShowsAny() {
  const [shown, setShown] = useState('nothing yet')
  useModuleActions(['show', 'hide'], (name, payload) =>
    setShown(`${name}: ${String(payload)}`),
  )
  return <output>{shown}</output>
}

/** A page whose composites draw their content, as the page view's do. */
function withComposites(layout: LayoutData) {
  const lookup = (type: string) => moduleById(type)
  const withBox = pageConfig(allModules())
  function Page() {
    const renderContent = useContentRenderer(
      withBox,
      { arranging: false },
      lookup,
    )
    return (
      <ContentRendererContext.Provider value={renderContent}>
        <PageScopeProvider layout={layout}>
          <Render
            config={withBox}
            data={prepareLayout(layout, lookup, known)}
            metadata={{ arranging: false }}
          />
        </PageScopeProvider>
      </ContentRendererContext.Provider>
    )
  }
  return (
    <PageRuntimeProvider>
      <Page />
    </PageRuntimeProvider>
  )
}

// Review found two ways a saved module broke: a route from outside into it
// was dropped when it was made, and its content skipped the page's
// preparation, so a part this app does not have was not held in place.
test("a saved module answers an outside route with its part's action, and holds a missing part", async () => {
  const removals = [
    registerBuiltin(
      builtin({
        id: 'test.sender',
        label: 'Sender',
        events: [{ name: 'pick', label: 'Pick', type: 'text' }],
        Component: Sender,
      }),
    ),
    registerBuiltin(
      builtin({
        id: 'test.shows',
        label: 'Shows',
        actions: [{ name: 'show', label: 'Show', type: 'text' }],
        Component: Shows,
      }),
    ),
  ]
  const box: ModuleDefinition = {
    ...builtin({ id: 'acme.box', label: 'Box', Component: () => null }),
    origin: 'vault',
    category: 'Composite',
    actions: [{ name: 'show', label: 'Show', type: 'text' }],
    implementation: {
      kind: 'composite',
      content: [
        instance('test.shows', 'insp'),
        instance('vault.gone', 'gone', { title: 'Reading list' }),
      ],
      exposes: {
        outputs: {},
        events: {},
        actions: { show: { instance: 'insp', action: 'show' } },
      },
    },
  }
  setInstalled([box])
  try {
    const { container } = await render(
      withComposites({
        root: { props: {} },
        content: [
          instance('test.sender', 'list', {
            on: { pick: [{ to: { instance: 'box', action: 'show' } }] },
          }),
          instance('acme.box', 'box'),
        ],
      }),
    )
    await waitFor(() => container.textContent.includes('nothing yet'))
    expect(container.textContent).toContain('which is not installed here')
    expect(container.textContent).toContain('Reading list')
    const pick = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Pick',
    )!
    act(() => pick.click())
    await waitFor(() => container.textContent.includes('shown: chosen'))
  } finally {
    setInstalled([])
    for (const remove of removals) remove()
  }
})

// Review found that a saved module drew its parts as a page of its own with
// no settings, so on a flush page its parts came back in cards.
test("a saved module's parts are presented as the page around it is", async () => {
  const box: ModuleDefinition = {
    ...builtin({ id: 'acme.box', label: 'Box', Component: () => null }),
    origin: 'vault',
    category: 'Composite',
    implementation: {
      kind: 'composite',
      content: [instance('theorem.text', 'part', { title: 'Part' })],
      exposes: { outputs: {}, events: {}, actions: {} },
    },
  }
  setInstalled([box])
  try {
    const frame = async (frames: string) => {
      const { container } = await render(
        withComposites({
          root: { props: { frames } },
          content: [instance('acme.box', 'box')],
        }),
      )
      return waitFor(() =>
        container.querySelector<HTMLElement>('section[aria-label="Part"]'),
      )
    }
    expect((await frame('flush')).className).not.toContain('rounded-xl')
    cleanup()
    expect((await frame('cards')).className).toContain('rounded-xl')
  } finally {
    setInstalled([])
  }
})

// Review found that a sandboxed module's declared actions never reached it:
// its frame registers them by name, from its manifest, through this hook.
test('a module whose actions come from its manifest answers a route to each', async () => {
  const removals = [
    registerBuiltin(
      builtin({
        id: 'test.sender',
        label: 'Sender',
        events: [{ name: 'pick', label: 'Pick', type: 'text' }],
        Component: Sender,
      }),
    ),
    registerBuiltin(
      builtin({
        id: 'test.any',
        label: 'Any',
        actions: [
          { name: 'show', label: 'Show', type: 'text' },
          { name: 'hide', label: 'Hide', type: 'text' },
        ],
        Component: ShowsAny,
      }),
    ),
  ]
  try {
    // A config of its own: the shared one predates these modules.
    const { container } = await render(
      withComposites({
        root: { props: {} },
        content: [
          instance('test.sender', 'list', {
            on: { pick: [{ to: { instance: 'any', action: 'hide' } }] },
          }),
          instance('test.any', 'any'),
        ],
      }),
    )
    await waitFor(() => container.textContent.includes('nothing yet'))
    const pick = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Pick',
    )!
    act(() => pick.click())
    await waitFor(() => container.textContent.includes('hide: chosen'))
  } finally {
    for (const remove of removals) remove()
  }
})

// Review found that clicks a second apart between two linked views inherited
// each other's depth, and stopped reaching the other after eight.
test('a person alternating between two linked views is never cut off', async () => {
  const remove = registerBuiltin(
    builtin({
      id: 'test.linked',
      label: 'Linked',
      events: [{ name: 'pick', label: 'Pick', type: 'text' }],
      actions: [{ name: 'show', label: 'Show', type: 'text' }],
      Component: Linked,
    }),
  )
  try {
    const { container } = await render(
      withComposites({
        root: { props: {} },
        content: [
          instance('test.linked', 'one', {
            on: { pick: [{ to: { instance: 'two', action: 'show' } }] },
          }),
          instance('test.linked', 'two', {
            on: { pick: [{ to: { instance: 'one', action: 'show' } }] },
          }),
        ],
      }),
    )
    const [one, two] = await waitFor(() => {
      const buttons = [...container.querySelectorAll('button')]
      return buttons.length === 2 && buttons
    })
    const clicks = 2 * MAX_EVENT_DEPTH
    for (let click = 0; click < clicks; click++) {
      const button = click % 2 ? two! : one!
      act(() => {
        button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        button.click()
      })
    }
    await waitFor(
      () =>
        one!.textContent === `shown ${clicks / 2}` &&
        two!.textContent === `shown ${clicks / 2}`,
    )
  } finally {
    remove()
  }
})

test('a module this app does not have is held in place and comes back unchanged', async () => {
  const gone = instance('vault.gone', 'kept', {
    title: 'Reading list',
    v: 4,
    shelf: 'later',
    bind: { item: { from: 'note', port: 'text' } },
  })
  const layout: LayoutData = { root: { props: {} }, content: [gone] }
  const prepared = prepareLayout(layout, (type) => moduleById(type), known)
  expect(prepared.content[0]!.type).toBe(MISSING_TYPE)
  expect(restoreLayout(prepared)).toEqual(layout)

  const { container } = await renderPage(layout)
  await waitFor(() =>
    container.textContent.includes('which is not installed here'),
  )
  expect(container.textContent).toContain('Reading list')
  expect(container.textContent).toContain('vault.gone')
})

test("the built-in templates' connections are all valid for the built-in modules", () => {
  for (const template of BUILTIN_TEMPLATES)
    expect(
      validateConnections(template.layout, (type) => moduleById(type)),
    ).toEqual([])
})

const foldingSplit = (second: ComponentData[]): LayoutData => ({
  root: { props: {} },
  content: [
    instance(SPLIT_TYPE, 'split', {
      direction: 'row',
      ratio: 50,
      fixed: 'second',
      size: 300,
      fold: true,
      height: 300,
      first: [instance('theorem.text', 'note', { text: 'kept' })],
      second,
    }),
  ],
})

const sides = (container: HTMLElement) => {
  const split = container.querySelector<HTMLElement>('[data-split="split"]')!
  const [, sash, second] = [...split.children] as HTMLElement[]
  return { sash: sash!, second: second! }
}

test('a split set to fold hides its second side while nothing in it has anything to show', async () => {
  const { container } = await renderPage(
    foldingSplit([instance('theorem.index.inspector', 'inspector')]),
  )
  await waitFor(() => container.textContent.includes('Nothing to show yet'))
  const { sash, second } = sides(container)
  expect(second.hidden).toBe(true)
  expect(sash.hidden).toBe(true)
  // Folded, not gone: the inspector stays placed, ready for an item.
  expect(second.textContent).toContain('Nothing to show yet')
})

test('a folding split shows its second side while anything in it has something to show', async () => {
  const { container } = await renderPage(
    foldingSplit([
      instance('theorem.index.inspector', 'inspector'),
      instance('theorem.value', 'shown', {
        bind: { value: { from: 'note', port: 'text' } },
      }),
    ]),
  )
  await waitFor(() => shownValues(container).includes('"kept"'))
  const { sash, second } = sides(container)
  expect(second.hidden).toBe(false)
  expect(sash.hidden).toBe(false)
})

// Review found that only what a nested split held in its first side counted
// towards the side around it, so the outer split folded away a value shown
// in the nested split's second side.
test('a folding split counts what a split nested in its second side shows', async () => {
  const nested = (second: ComponentData[]) =>
    foldingSplit([
      instance(SPLIT_TYPE, 'nested', {
        direction: 'column',
        ratio: 50,
        fixed: 'none',
        size: 300,
        fold: false,
        height: 300,
        first: [instance('theorem.index.inspector', 'inspector')],
        second,
      }),
    ])
  const shown = await renderPage(
    nested([
      instance('theorem.value', 'shown', {
        bind: { value: { from: 'note', port: 'text' } },
      }),
    ]),
  )
  await waitFor(() => shownValues(shown.container).includes('"kept"'))
  expect(sides(shown.container).second.hidden).toBe(false)
  cleanup()

  const empty = await renderPage(nested([]))
  await waitFor(() =>
    empty.container.textContent.includes('Nothing to show yet'),
  )
  expect(sides(empty.container).second.hidden).toBe(true)
})

function Offers({ output }: ModuleViewProps) {
  useEffect(
    () =>
      output('item', {
        id: 'd1',
        kind: 'document',
        scope: { kind: 'collection', collectionId: 'c1' },
      }),
    [output],
  )
  return null
}

// Review found that an inspector took the scope of the place the page
// provides, or Home, never that of the Index view beside it the item came
// from, so what was done with the item counted in the wrong scope.
test('an inspector acts in the scope its item was opened in', async () => {
  const remove = registerBuiltin(
    builtin({
      id: 'test.offers',
      label: 'Offers',
      outputs: [{ name: 'item', label: 'Item', type: 'item' }],
      Component: Offers,
    }),
  )
  const recorded: Parameters<ReturnType<typeof observer>['record']>[0][] = []
  const record = spyOn(observer(), 'record').mockImplementation((event) => {
    recorded.push(event)
  })
  const fetched = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request ? input : undefined
    const url = request ? request.url : String(input)
    const method = request ? request.method : init?.method
    const path = new URL(url, 'http://localhost').pathname
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      })
    if (path.endsWith('/filings'))
      return json(
        method === 'POST'
          ? { receiptId: 'r1', documentId: 'd1', destinationCollectionId: 'c1' }
          : { receipts: [] },
      )
    if (path.endsWith('/collections')) return json({ collections: [] })
    if (path.endsWith('/bootstrap'))
      return json({ csrfToken: 'csrf', tenantId: 't' })
    if (path.endsWith('/documents/d1'))
      return json({
        summary: {
          title: 'Lease',
          documentKind: 'authored',
          readOnly: false,
          revision: { position: 1, contentDigest: 'sha256:1' },
        },
      })
    return json({})
  }) as typeof fetch)
  // The Index routes resolve against the page's origin, which a bare
  // happy-dom page does not have.
  const dom = (
    window as unknown as { happyDOM: { setURL: (url: string) => void } }
  ).happyDOM
  dom.setURL('http://localhost:3000/pages')
  try {
    const { container } = await render(
      withComposites({
        root: { props: {} },
        content: [
          instance('test.offers', 'offers'),
          instance('theorem.index.inspector', 'inspector', {
            bind: { item: { from: 'offers', port: 'item' } },
          }),
        ],
      }),
    )
    const file = await waitFor(() =>
      [...container.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'File it',
      ),
    )
    act(() => file.click())
    await waitFor(() => recorded.some((e) => e.kind === 'item_filed'))
    expect(recorded.find((e) => e.kind === 'item_filed')!.scope).toEqual({
      kind: 'collection',
      collectionId: 'c1',
    })
  } finally {
    dom.setURL('about:blank')
    record.mockRestore()
    fetched.mockRestore()
    remove()
  }
})

function Claims({ store }: { store: OwnerStore }) {
  const { mine } = useOwner(store, 'ide', true)
  return <span>{mine ? 'here' : 'elsewhere'}</span>
}

// Review found that two pages made from one template, or a mode's page in
// use and in Pages, share instance ids, so both took the one Theia.
test('one surface shows in one view, whichever views share its instance id', async () => {
  const store: OwnerStore = create(() => ({}))
  const views = (both: boolean) => (
    <>
      {both && (
        <PageRuntimeProvider>
          <Claims store={store} />
        </PageRuntimeProvider>
      )}
      <PageRuntimeProvider>
        <Claims store={store} />
      </PageRuntimeProvider>
    </>
  )
  const { container, queryClient, root } = await render(views(true))
  const said = () =>
    [...container.querySelectorAll('span')].map((s) => s.textContent)
  expect(said()).toEqual(['here', 'elsewhere'])
  // When the view showing it goes, the other takes it.
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        {views(false)}
      </QueryClientProvider>,
    ),
  )
  await waitFor(() => said()[0] === 'here')
  expect(said()).toEqual(['here'])
})
