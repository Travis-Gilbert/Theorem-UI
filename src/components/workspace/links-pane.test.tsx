// SOURCING: bun:test over the links aside, rendered with React into happy-dom
// against the in-memory workspace, whose index answers are given.
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { act } from 'react'
import { useRevealRequest } from '@/lib/handlers/actions'
import { useWorkspaceFileView } from '@/lib/workspace/open'
import type { WorkspaceLink } from '@/lib/workspace/types'
import {
  cleanup,
  fakeWorkspace,
  render,
  waitFor,
} from '../../../test/workspace'

void mock.module('@/components/icons', () => ({
  Icon: new Proxy({}, { get: () => () => null }),
}))
const { LinksPane } = await import('./links-pane')
const { useWorkspaceSearch } = await import('./search-dialog')

const link = (
  from: string,
  target: string,
  resolved: string | null,
  line: number,
  heading?: string,
): WorkspaceLink => ({
  from,
  target,
  resolved,
  kind: 'wikilink',
  line,
  heading,
})

const FILES = {
  'Notes/Plan.md':
    '# Plan\nSee [[Ideas]] and [[Notes/Other#Part]], [[Notes/Other]]\n#project/alpha #draft\n',
  'Notes/Other.md': '# Other\n',
  'Journal.md': 'line one\nWorking on [[Plan]] today, [[Plan]] again\n',
  'pic.png': 'png',
}

async function show(path: string) {
  const vault = fakeWorkspace(FILES, {
    answers: {
      backlinks: (to) =>
        Promise.resolve(
          to === 'Notes/Plan.md'
            ? [
                link('Journal.md', 'Plan', 'Notes/Plan.md', 2),
                link('Journal.md', 'Plan', 'Notes/Plan.md', 2),
              ]
            : [],
        ),
      links: (from) =>
        Promise.resolve(
          from === 'Notes/Plan.md'
            ? [
                link(from, 'Ideas', null, 2),
                link(from, 'Notes/Other', 'Notes/Other.md', 2, 'Part'),
                link(from, 'Notes/Other', 'Notes/Other.md', 2),
              ]
            : [],
        ),
    },
  })
  const entry = (await vault.client.tree()).find((e) => e.path === path)!
  const view = await render(
    <LinksPane client={vault.client} path={path} entry={entry} />,
  )
  return { vault, ...view }
}

const section = (container: HTMLElement, title: string) =>
  [
    ...container.querySelectorAll<HTMLElement>('[aria-label="Links"] > div'),
  ].find((s) => s.querySelector('button')?.textContent.startsWith(title))!

const buttons = (element: HTMLElement) =>
  [...element.querySelectorAll<HTMLButtonElement>('button')].slice(1)

beforeEach(() => {
  useWorkspaceFileView.setState({ file: undefined })
  useRevealRequest.setState({ request: null })
})
afterEach(cleanup)

describe('LinksPane', () => {
  test('lists each linking note once, with its linking line', async () => {
    const { container } = await show('Notes/Plan.md')
    const backlinks = await waitFor(() => {
      const s = section(container, 'Backlinks')
      return buttons(s).length === 1 && s
    })
    expect(buttons(backlinks).map((b) => b.textContent)).toEqual(['Journal'])
    expect(
      [...backlinks.querySelectorAll('p')].map((p) => p.textContent),
    ).toEqual(['Working on [[Plan]] today, [[Plan]] again'])

    await act(async () => buttons(backlinks)[0]!.click())
    expect(useWorkspaceFileView.getState().file?.path).toBe('Journal.md')
  })

  test('outgoing links open at their heading; one not made yet is made', async () => {
    const { container, vault } = await show('Notes/Plan.md')
    const outgoing = await waitFor(() => {
      const s = section(container, 'Outgoing links')
      return buttons(s).length === 2 && s
    })
    const [ideas, other] = buttons(outgoing)
    expect([ideas!.textContent, other!.textContent]).toEqual(['Ideas', 'Other'])
    expect(ideas!.dataset.unresolved).toBe('true')

    await act(async () => other!.click())
    expect(useWorkspaceFileView.getState().file?.path).toBe('Notes/Other.md')
    expect(useRevealRequest.getState().request?.subpath).toBe('#Part')

    await act(async () => ideas!.click())
    await waitFor(
      () => useWorkspaceFileView.getState().file?.path === 'Ideas.md',
    )
    expect(vault.text('Ideas.md')).toBe('')
  })

  test("the note's tags search for their notes", async () => {
    const { container } = await show('Notes/Plan.md')
    const tags = await waitFor(() => {
      const s = section(container, 'Tags')
      return buttons(s).length === 2 && s
    })
    expect(buttons(tags).map((b) => b.textContent)).toEqual([
      '#draft',
      '#project/alpha',
    ])
    await act(async () => buttons(tags)[1]!.click())
    expect(useWorkspaceSearch.getState().query).toBe('tag:#project/alpha')
  })

  test('a file that is not a note shows only its backlinks', async () => {
    const { container } = await show('pic.png')
    await waitFor(() => container.textContent.includes('No notes link here.'))
    expect(container.textContent).not.toContain('Outgoing links')
    expect(container.textContent).not.toContain('Tags')
  })
})
