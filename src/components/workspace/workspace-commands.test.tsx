// SOURCING: bun:test over the quick switcher, search and folder settings
// dialogs, rendered with React into happy-dom against the in-memory
// workspace. The workspace list is spied on, as the desktop server is not
// running.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import { act } from 'react'
import { useWorkspaceFileView } from '@/lib/workspace/open'
import type { WorkspaceClient, WorkspaceEntry } from '@/lib/workspace/types'
import * as workspaces from '@/lib/workspace/workspaces'
import {
  cleanup,
  fakeWorkspace,
  render,
  settle,
  waitFor,
} from '../../../test/workspace'
import type { FakeWorkspace } from '../../../test/workspace'

void mock.module('@/components/icons', () => ({
  Icon: new Proxy({}, { get: () => () => null }),
}))
const { WorkspaceCommands } = await import('./workspace-commands')
const { openSearch, useWorkspaceSearch } = await import('./search-dialog')
const { openQuickSwitcher, useQuickSwitcher } = await import('./quick-switcher')
const { openFolderSettings } = await import('./folder-settings-dialog')

let vault: FakeWorkspace
let entries: Array<WorkspaceEntry> = []
const spies: Array<{ mockRestore: () => void }> = []

beforeAll(() => {
  const client = () => vault.client
  spies.push(
    spyOn(workspaces, 'useWorkspaces').mockImplementation(
      () =>
        ({
          isPending: false,
          available: true,
          workspaces: [vault.client.workspace],
        }) as unknown as ReturnType<typeof workspaces.useWorkspaces>,
    ),
    spyOn(workspaces, 'workspaceClient').mockImplementation(client),
    spyOn(workspaces, 'useWorkspaceClient').mockImplementation(client),
    spyOn(workspaces, 'useAllWorkspaceTrees').mockImplementation(() => [
      { client: vault.client, entries, isPending: false },
    ]),
  )
})
afterAll(() => {
  for (const spy of spies) spy.mockRestore()
})

async function open(files: Record<string, string>, answers = {}) {
  vault = fakeWorkspace(files, { answers })
  entries = await vault.client.tree()
  useWorkspaceFileView.setState({ file: undefined })
  return render(<WorkspaceCommands />)
}

beforeEach(() => {
  useWorkspaceSearch.setState({ query: null })
  useQuickSwitcher.setState({ open: false })
})
afterEach(cleanup)

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const options = () =>
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
    (option) => option.textContent,
  )
const option = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) =>
    o.textContent.startsWith(text),
  )!

describe('quick switcher', () => {
  test('Mod+O opens it; a fuzzy name finds the note and opens it', async () => {
    await open({ 'Notes/Plan.md': '', 'Notes/Journal.md': '', 'pic.png': '' })
    const mac = /mac/i.test(`${navigator.platform} ${navigator.userAgent}`)
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'o',
          code: 'KeyO',
          bubbles: true,
          ...(mac ? { metaKey: true } : { ctrlKey: true }),
        }),
      )
    })
    const input = await waitFor(() =>
      dialog()?.querySelector<HTMLInputElement>('input'),
    )
    // Notes show without .md, other files with their extension.
    expect(options().toSorted()).toEqual([
      'JournalNotes',
      'PlanNotes',
      'pic.png',
    ])

    type(input, 'pln')
    await settle()
    expect(options()).toEqual(['PlanNotes', 'Create “pln”'])
    await act(async () => option('Plan').click())
    expect(useWorkspaceFileView.getState().file?.path).toBe('Notes/Plan.md')
    expect(useQuickSwitcher.getState().open).toBe(false)
  })

  test('a name nothing has is made as a note and opened', async () => {
    await open({ 'a.md': '' })
    act(() => openQuickSwitcher())
    const input = await waitFor(() =>
      dialog()?.querySelector<HTMLInputElement>('input'),
    )
    type(input, 'Ideas')
    await settle()
    expect(options()).toEqual(['Create “Ideas”'])
    await act(async () => option('Create').click())
    await waitFor(
      () => useWorkspaceFileView.getState().file?.path === 'Ideas.md',
    )
    expect(vault.text('Ideas.md')).toBe('')
  })
})

describe('search', () => {
  const hit = {
    path: 'Notes/Plan.md',
    title: 'Plan',
    snippet: 'the <mark>plan</mark> is <b>set</b>',
    score: 1,
  }
  const answers = {
    search: (query: string) =>
      Promise.resolve(query.includes('plan') ? [hit] : []),
    tags: () =>
      Promise.resolve([
        { tag: 'project', count: 2 },
        { tag: 'project/alpha', count: 1 },
      ]),
  } satisfies Partial<WorkspaceClient>

  test('lists tags first; a tag starts a tag: query', async () => {
    await open({ 'Notes/Plan.md': '' }, answers)
    act(() => openSearch())
    const tags = await waitFor(() => {
      const found = [
        ...document.querySelectorAll<HTMLButtonElement>(
          '[aria-label="Tags"] button',
        ),
      ]
      return found.length === 2 && found
    })
    expect(tags.map((tag) => tag.textContent)).toEqual([
      '#project2',
      '#project/alpha1',
    ])
    await act(async () => tags[1]!.click())
    expect(useWorkspaceSearch.getState().query).toBe('tag:#project/alpha ')
  })

  test('shows each hit with its marks, never its HTML, and opens it', async () => {
    await open({ 'Notes/Plan.md': '' }, answers)
    act(() => openSearch('plan'))
    const result = await waitFor(() => option('Plan'))
    expect(result.querySelector('mark')?.textContent).toBe('plan')
    expect(result.querySelector('b')).toBeNull()
    expect(result.textContent).toContain('is <b>set</b>')
    expect(result.textContent).toContain('Notes')

    await act(async () => result.click())
    expect(useWorkspaceFileView.getState().file?.path).toBe('Notes/Plan.md')
    expect(useWorkspaceSearch.getState().query).toBeNull()
  })
})

describe('folder settings', () => {
  test('saves where attachments go and the daily notes', async () => {
    await open({})
    act(() => openFolderSettings('ws_test'))
    const radios = await waitFor(() => {
      const found = [
        ...document.querySelectorAll<HTMLElement>('[role="radio"]'),
      ]
      return found.length === 4 && found
    })
    // The default puts attachments beside the note.
    expect(radios[2]!.getAttribute('aria-checked')).toBe('true')

    await act(async () => radios[1]!.click())
    const folder = await waitFor(() =>
      document.querySelector<HTMLInputElement>('input[aria-label="Folder"]'),
    )
    type(folder, 'Media')
    type(
      document.querySelector<HTMLInputElement>('input[placeholder="Journal"]')!,
      'Journal',
    )
    type(
      document.querySelector<HTMLInputElement>(
        'input[placeholder="Templates/Daily"]',
      )!,
      'Templates/Day',
    )
    const save = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Save',
    )!
    await act(async () => save.click())
    await waitFor(() => !dialog())
    expect(await vault.client.settings()).toEqual({
      attachments: 'Media',
      dailyNotes: { folder: 'Journal', template: 'Templates/Day' },
    })
  })
})
