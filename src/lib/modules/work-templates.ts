// SOURCING: none — the work tracker's page templates, written in the page layout format (./contract) over the builtin work modules in components/pages/work-modules; they are data, the same shape INDEX_TEMPLATE has
import type { ComponentData } from './contract'
import type { PageTemplate } from './templates'

type Settings = Record<string, unknown>

/** A list, board or inbox on the left and the item open in it on the right, folded away until one is open. */
function withItem(
  first: Pick<ComponentData, 'type'> & { props: Settings },
  folds = true,
): PageTemplate['layout'] {
  return {
    root: { props: { fill: true, frames: 'flush' } },
    content: [
      {
        type: 'theorem.split',
        props: {
          id: 'work-split',
          direction: 'row',
          ratio: 50,
          fixed: 'second',
          size: 480,
          fold: folds,
          height: 560,
          first: [
            {
              type: first.type,
              props: { id: 'list', title: 'Work', v: 1, ...first.props },
            },
          ],
          second: [
            {
              type: 'theorem.work.item',
              props: {
                id: 'item',
                title: 'Work item',
                v: 1,
                bind: { item: { from: 'list', port: 'selected' } },
                // A linked item opened in the detail is also the list's selection.
                on: { opened: [{ to: { instance: 'list', action: 'select' } }] },
              },
            },
          ],
        },
      },
    ],
  }
}

const screen = (
  id: string,
  title: string,
  description: string,
  type: 'theorem.work.list' | 'theorem.work.board' | 'theorem.work.inbox',
  props: Settings,
  feature: PageTemplate['feature'] = 'work',
): PageTemplate => ({
  id,
  title,
  description,
  origin: 'builtin',
  feature,
  layout: withItem({ type, props }),
})

const view = (viewId: string): Settings => ({ view: viewId, source: 'all' })

/** The projects, and the project chosen in them beside. */
const PROJECTS: PageTemplate = {
  id: 'theorem.work.projects',
  title: 'Work projects',
  description: 'Every tracked project, with the one you choose open beside it.',
  origin: 'builtin',
  feature: 'work',
  layout: {
    root: { props: { fill: true, frames: 'flush' } },
    content: [
      {
        type: 'theorem.split',
        props: {
          id: 'work-split',
          direction: 'row',
          ratio: 50,
          fixed: 'second',
          size: 560,
          fold: true,
          height: 560,
          first: [
            {
              type: 'theorem.work.projects',
              props: { id: 'projects', title: 'Projects', v: 1 },
            },
          ],
          second: [
            {
              type: 'theorem.work.project',
              props: {
                id: 'project',
                title: 'Project',
                v: 1,
                bind: { project: { from: 'projects', port: 'selected' } },
              },
            },
          ],
        },
      },
    ],
  },
}

/** One project, chosen in its settings, with the item open in it beside. */
const PROJECT: PageTemplate = {
  id: 'theorem.work.project',
  title: 'Work project',
  description:
    'One project: progress, milestones, activity and its items, with the item you open beside it.',
  origin: 'builtin',
  feature: 'work',
  layout: {
    root: { props: { fill: true, frames: 'flush' } },
    content: [
      {
        type: 'theorem.split',
        props: {
          id: 'work-split',
          direction: 'row',
          ratio: 50,
          fixed: 'second',
          size: 480,
          fold: true,
          height: 560,
          first: [
            {
              type: 'theorem.work.project',
              props: { id: 'list', title: 'Project', v: 1, project: '' },
            },
          ],
          second: [
            {
              type: 'theorem.work.item',
              props: {
                id: 'item',
                title: 'Work item',
                v: 1,
                bind: { item: { from: 'list', port: 'selected' } },
                on: { opened: [{ to: { instance: 'list', action: 'select' } }] },
              },
            },
          ],
        },
      },
    ],
  },
}

export const WORK_TEMPLATES: ReadonlyArray<PageTemplate> = [
  screen(
    'theorem.work.inbox',
    'Work inbox',
    'What came in for you, with the item you choose open beside it. Choosing an entry marks it read.',
    'theorem.work.inbox',
    { state: 'all' },
  ),
  screen(
    'theorem.work.my-issues',
    'My issues',
    'Issues and pull requests assigned to you, with the item open beside them.',
    'theorem.work.list',
    view('my-issues'),
  ),
  screen(
    'theorem.work.active',
    'Active work',
    'Work that is started and not yet done, with the item open beside it.',
    'theorem.work.list',
    view('active'),
  ),
  screen(
    'theorem.work.high-priority',
    'High priority',
    'Urgent and high priority items that are still open.',
    'theorem.work.list',
    view('high-priority'),
  ),
  screen(
    'theorem.work.review-requests',
    'Review requests',
    'Pull requests waiting for your review.',
    'theorem.work.list',
    view('review-requests'),
  ),
  screen(
    'theorem.work.all-issues',
    'All issues',
    'Every issue and pull request the tracker knows.',
    'theorem.work.list',
    view('all-issues'),
  ),
  screen(
    'theorem.work.board',
    'Work board',
    'The work as columns by status; drag a card to change its status.',
    'theorem.work.board',
    view('board'),
  ),
  PROJECTS,
  PROJECT,
  screen(
    'theorem.work.github',
    'GitHub work',
    'Issues and pull requests from GitHub only, with the item open beside them.',
    'theorem.work.list',
    { view: 'all-issues', source: 'github' },
    'github',
  ),
]

/** Whether a template is offered, given what the tracker has switched on. */
export function templateOffered(
  template: Pick<PageTemplate, 'feature'>,
  tracker: { work: boolean; github: boolean },
): boolean {
  switch (template.feature) {
    case undefined:
      return true
    case 'work':
      return tracker.work
    case 'github':
      return tracker.work && tracker.github
  }
}
