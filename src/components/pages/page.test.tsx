// SOURCING: bun:test over Puck's Render with the app's page config, rendered
// with React into happy-dom (test/workspace's render, which supplies a
// QueryClient). Only the plain built-ins are placed, so nothing reaches a
// Theorem; fetch is not stubbed because nothing here calls it.
import { Render } from '@puckeditor/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test } from 'bun:test'
import { Activity, act } from 'react'
import { cleanup, render, waitFor } from '../../../test/workspace'
import { validateConnections } from '@/lib/modules/connections'
import type { ComponentData, LayoutData } from '@/lib/modules/contract'
import {
  MISSING_TYPE,
  prepareLayout,
  restoreLayout,
} from '@/lib/modules/layout'
import { allModules, moduleById } from '@/lib/modules/registry'
import { BUILTIN_TEMPLATES } from '@/lib/modules/templates'
import './builtins'
import { PageRuntimeProvider, PageScopeProvider } from './page-runtime'
import { LAYOUT_TYPES, SPLIT_TYPE, pageConfig } from './puck-config'

afterEach(cleanup)

const instance = (
  type: string,
  id: string,
  props: Record<string, unknown> = {},
): ComponentData => ({ type, props: { id, ...props } })

const known = (type: string) => LAYOUT_TYPES.has(type)

function page(layout: LayoutData) {
  const prepared = prepareLayout(layout, (type) => moduleById(type), known)
  return (
    <PageRuntimeProvider>
      <PageScopeProvider layout={layout}>
        <Render
          config={pageConfig(allModules())}
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
