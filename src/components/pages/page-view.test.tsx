// SOURCING: bun:test over the page editor (page-view.tsx), rendered with
// React into happy-dom with test/workspace's render (a QueryClient) and its
// fake vault, which answers the SDK Files contract and sends its events.
// Puck draws the arrangement in this document; the title is typed through
// the input's own value setter and an input event, as React reads it.
import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import {
  cleanup,
  fakeWorkspace,
  render,
  waitFor,
} from '../../../test/workspace'
import { pageText, parsePage } from '@/lib/modules/contract'
import { pagesUnsaved, usePageDrafts } from '@/lib/modules/drafts'
import { newPage } from '@/lib/modules/layout'
import { VaultPage } from './page-view'

afterEach(() => {
  cleanup()
  usePageDrafts.setState({ drafts: {} })
})

const button = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === name,
  )

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// Review found three ways an unsaved arrangement was lost: leaving the page
// unmounted the editor that held it, and a rename or a revision of the file
// that does not parse replaced the editor with a loading or error state.
test('an unsaved arrangement outlives its view, a rename and a revision that does not parse', async () => {
  const fake = fakeWorkspace({
    'Pages/Desk.page.json': pageText(newPage('Desk')),
  })
  const [entry] = (await fake.client.tree()).filter(
    (e) => e.path === 'Pages/Desk.page.json',
  )
  const ui = <VaultPage client={fake.client} entryId={entry!.id} />
  const { container, queryClient, root } = await render(ui)
  const title = () => container.querySelector('h1')?.textContent

  act(() => button(container, 'Arrange')!.click())
  const input = await waitFor(() =>
    container.querySelector<HTMLInputElement>('input[aria-label="Page title"]'),
  )
  type(input, 'Reading desk')
  await waitFor(() => container.textContent.includes('Unsaved changes'))
  expect(pagesUnsaved()).toBe(true)

  // Another page, then this one again: the arrangement is still unsaved.
  const { QueryClientProvider } = await import('@tanstack/react-query')
  const show = (shown: boolean) =>
    act(() =>
      root.render(
        <QueryClientProvider client={queryClient}>
          {shown ? ui : null}
        </QueryClientProvider>,
      ),
    )
  show(false)
  show(true)
  await waitFor(() => title() === 'Reading desk')
  expect(container.textContent).toContain('Unsaved changes')

  await act(() =>
    fake.client.rename('Pages/Desk.page.json', 'Pages/Study.page.json'),
  )
  await waitFor(() => !container.querySelector('[data-slot="skeleton"]'))
  expect(title()).toBe('Reading desk')
  expect(container.textContent).toContain('Unsaved changes')

  await fake.external('Pages/Study.page.json', 'not json')
  await waitFor(() =>
    container.textContent.includes(
      "The vault's copy changed and does not open",
    ),
  )
  expect(title()).toBe('Reading desk')

  // Saving over it asks first, and Keep mine writes the arrangement there.
  act(() => button(container, 'Save')!.click())
  await waitFor(() => button(container, 'Keep mine'))
  act(() => button(container, 'Keep mine')!.click())
  await waitFor(() => !button(container, 'Keep mine') && !pagesUnsaved())
  expect(container.textContent).not.toContain('Unsaved changes')
  expect(
    parsePage('Pages/Study.page.json', fake.text('Pages/Study.page.json')!)
      .title,
  ).toBe('Reading desk')
})

// Review found that an edit made while a save was on its way was cleared
// when the save came back.
test('an edit made while a save runs stays unsaved', async () => {
  const fake = fakeWorkspace({
    'Pages/Desk.page.json': pageText(newPage('Desk')),
  })
  const [entry] = (await fake.client.tree()).filter(
    (e) => e.path === 'Pages/Desk.page.json',
  )
  const write = fake.client.write
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  fake.client.write = async (...args) => {
    await held
    return write(...args)
  }
  const { container } = await render(
    <VaultPage client={fake.client} entryId={entry!.id} />,
  )
  act(() => button(container, 'Arrange')!.click())
  const input = await waitFor(() =>
    container.querySelector<HTMLInputElement>('input[aria-label="Page title"]'),
  )
  type(input, 'Reading')
  await waitFor(() => button(container, 'Save'))
  act(() => button(container, 'Save')!.click())
  type(input, 'Reading desk')
  await act(async () => release())
  await waitFor(() => fake.text('Pages/Desk.page.json')?.includes('"Reading"'))
  await act(() => Bun.sleep(20))
  expect(
    parsePage('Pages/Desk.page.json', fake.text('Pages/Desk.page.json')!).title,
  ).toBe('Reading')
  expect(input.value).toBe('Reading desk')
  expect(container.textContent).toContain('Unsaved changes')
  expect(pagesUnsaved()).toBe(true)
})
