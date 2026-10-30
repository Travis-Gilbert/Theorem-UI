// SOURCING: bun:test over the links aside, rendered with React into happy-dom
// against the in-memory workspace, whose index answers are given.
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { act } from 'react'
import { useRevealRequest } from '@/lib/handlers/actions'
import { useWorkspaceFileView } from '@/lib/workspace/open'
import type {
  LinkSuggestions,
  TheoremAbilities,
  WorkspaceLink,
} from '@/lib/workspace/types'
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

const suggestion = (
  candidateId: string,
  targetTitle: string,
  aboveThreshold = true,
) => ({
  candidateId,
  targetPath: `Notes/${targetTitle}.md`,
  targetTitle,
  kind: 'inline' as const,
  reason: 'mention' as const,
  generator: 'mention',
  score: 0.9,
  aboveThreshold,
  span: { line: 2, text: targetTitle.toLowerCase() },
})

/** The Theorem vault's abilities, answering suggestions with `answer`. */
function abilities(answer: LinkSuggestions) {
  const decided: Array<[string, string]> = []
  const theorem = {
    suggestions: () => Promise.resolve(answer),
    decide: (candidateId: string, decision: string) => {
      decided.push([candidateId, decision])
      if (answer.status === 'ready')
        answer.page.suggestions = answer.page.suggestions.filter(
          (s) => s.candidateId !== candidateId,
        )
      return Promise.resolve({})
    },
  } as unknown as TheoremAbilities
  return { theorem, decided }
}

async function show(path: string, theorem?: TheoremAbilities) {
  const vault = fakeWorkspace(FILES, {
    answers: {
      theorem,
      backlinks: (to) =>
        Promise.resolve(
          to === 'Notes/Plan.md'
            ? [
                link('Journal.md', 'Plan', 'Notes/Plan.md', 2),
                link('Journal.md', 'Plan', 'Notes/Plan.md', 2),
              ]
            : to === 'Notes/Other.md'
              ? [{ ...link('Journal.md', 'Other', to, 0), kind: 'related' }]
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

  test('a related link shows as related, with no linking line', async () => {
    const { container } = await show('Notes/Other.md')
    const backlinks = await waitFor(() => {
      const s = section(container, 'Backlinks')
      return buttons(s).length === 1 && s
    })
    expect(buttons(backlinks)[0]!.textContent).toBe('JournalRelated')
    expect(backlinks.querySelectorAll('p')).toHaveLength(0)
  })

  test('outside the Theorem vault nothing is suggested', async () => {
    const { container } = await show('Notes/Plan.md')
    await waitFor(() => container.textContent.includes('Outgoing links'))
    expect(container.textContent).not.toContain('Suggested links')
  })

  test('suggests the links above the threshold, and takes a decision', async () => {
    const { theorem, decided } = abilities({
      status: 'ready',
      page: {
        schema: 'theorem-files/1',
        path: 'Notes/Plan.md',
        receiptId: 'r1',
        expiresAtMs: 0,
        suggestions: [
          suggestion('c1', 'Ideas'),
          suggestion('c2', 'Weak', false),
          suggestion('c3', 'Roadmap'),
        ],
      },
    })
    const { container } = await show('Notes/Plan.md', theorem)
    const suggested = await waitFor(() => {
      const s = section(container, 'Suggested links')
      return buttons(s).length === 8 && s
    })
    expect(
      buttons(suggested)
        .filter((_, i) => i % 4 === 0)
        .map((b) => b.textContent),
    ).toEqual(['Ideas', 'Roadmap'])
    expect(suggested.querySelector('p')?.textContent).toBe(
      'Mentioned here: “ideas”, line 2',
    )

    const accept = buttons(suggested)[1]!
    expect(accept.textContent).toBe('Make it a link')
    await act(async () => accept.click())
    expect(decided).toEqual([['c1', 'accept']])
    await waitFor(
      () => buttons(section(container, 'Suggested links')).length === 4,
    )

    await act(async () =>
      buttons(section(container, 'Suggested links'))[3]!.click(),
    )
    expect(decided).toEqual([
      ['c1', 'accept'],
      ['c3', 'mute'],
    ])
    await waitFor(() => container.textContent.includes('Nothing to suggest.'))
  })

  test('suggestions that share a title say which folder each is in', async () => {
    const { theorem } = abilities({
      status: 'ready',
      page: {
        schema: 'theorem-files/1',
        path: 'Notes/Plan.md',
        receiptId: 'r1',
        expiresAtMs: 0,
        suggestions: [
          suggestion('c1', 'Brief'),
          { ...suggestion('c2', 'Brief'), targetPath: 'Agent/Brief.md' },
          suggestion('c3', 'Ideas'),
        ],
      },
    })
    const { container } = await show('Notes/Plan.md', theorem)
    const suggested = await waitFor(() => {
      const s = section(container, 'Suggested links')
      return buttons(s).length === 12 && s
    })
    expect(
      buttons(suggested)
        .filter((_, i) => i % 4 === 0)
        .map((b) => b.textContent),
    ).toEqual(['BriefNotes', 'BriefAgent', 'Ideas'])
  })

  test('says so quietly when link thresholds are not set', async () => {
    const { theorem } = abilities({ status: 'unconfigured' })
    const { container } = await show('Notes/Plan.md', theorem)
    await waitFor(() =>
      container.textContent.includes(
        'Theorem suggests links once link thresholds are set.',
      ),
    )
  })

  test('a file that is not a note shows only its backlinks', async () => {
    const { container } = await show('pic.png')
    await waitFor(() => container.textContent.includes('No notes link here.'))
    expect(container.textContent).not.toContain('Outgoing links')
    expect(container.textContent).not.toContain('Tags')
  })
})
