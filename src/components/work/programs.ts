// SOURCING: none — the tracker's built-in Index views as OpenUI Lang programs over the components in ./library; they are data, written in the language the library renders
import { parseWorkView } from './route'
import type { WorkScreen } from './route'

export type WorkProgram = { title: string; purpose: string; program: string }

/** The views the contract ships, by id, with what each is for. */
const BUILT_IN: Record<string, { title: string; purpose: string }> = {
  'my-issues': {
    title: 'My issues',
    purpose: 'Issues and pull requests assigned to you, most recently changed first.',
  },
  active: {
    title: 'Active',
    purpose: 'Work that is started and not yet done, grouped by status.',
  },
  'high-priority': {
    title: 'High priority',
    purpose: 'Urgent and high priority items that are still open.',
  },
  'review-requests': {
    title: 'Review requests',
    purpose: 'Pull requests waiting for your review.',
  },
  'all-issues': {
    title: 'All issues',
    purpose: 'Every issue and pull request the tracker knows.',
  },
  board: {
    title: 'Board',
    purpose: 'The work as columns by status; drag a card to change its status.',
  },
}

const quoted = (text: string) => JSON.stringify(text)

/** The title a screen opens with before a name is known. */
export function workScreenTitle(screen: WorkScreen): string {
  switch (screen.kind) {
    case 'inbox':
      return 'Work inbox'
    case 'projects':
      return 'Work projects'
    case 'project':
      return 'Project'
    case 'view':
      return BUILT_IN[screen.viewId]?.title ?? 'Work view'
  }
}

/** The program a work screen is: one component, which reads the tracker itself. */
export function workProgram(screen: WorkScreen): WorkProgram {
  switch (screen.kind) {
    case 'inbox':
      return {
        title: workScreenTitle(screen),
        purpose:
          'What came in for you: review requests, assignments, mentions and CI results.',
        program: 'root = WorkInbox()',
      }
    case 'projects':
      return {
        title: workScreenTitle(screen),
        purpose: 'The projects the tracker follows, with how far each has come.',
        program: 'root = WorkProjects()',
      }
    case 'project':
      return {
        title: workScreenTitle(screen),
        purpose: 'Where this project stands, what happened lately, and its items.',
        program: `root = WorkProject(${quoted(screen.projectId)})`,
      }
    case 'view':
      return {
        title: workScreenTitle(screen),
        purpose:
          BUILT_IN[screen.viewId]?.purpose ?? 'A saved view of issues and pull requests.',
        program: `root = WorkView(${quoted(screen.viewId)})`,
      }
  }
}

/** The program for an Index view id, when it names a work screen. */
export function workProgramFor(viewId: string): WorkProgram | undefined {
  const screen = parseWorkView(viewId)
  return screen && workProgram(screen)
}
