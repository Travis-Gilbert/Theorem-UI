// SOURCING: none — tests for how the work screens and items are named in the Index's view and item search params
import { describe, expect, test } from 'bun:test'
import { resolveDefaultView } from '@/components/index/programs'
import { workProgramFor } from './programs'
import {
  isWorkView,
  parseWorkItemId,
  parseWorkView,
  workItemId,
  workViewId,
} from './route'
import type { WorkScreen } from './route'

describe('work screens in the view param', () => {
  const screens: [WorkScreen, string][] = [
    [{ kind: 'inbox' }, 'default:work:inbox'],
    [{ kind: 'projects' }, 'default:work:projects'],
    [{ kind: 'project', projectId: 'p1' }, 'default:work:project/p1'],
    [{ kind: 'view', viewId: 'my-issues' }, 'default:work:view/my-issues'],
  ]

  test.each(screens)('%o <-> %s', (screen, viewId) => {
    expect(workViewId(screen)).toBe(viewId)
    expect(parseWorkView(viewId)).toEqual(screen)
    expect(isWorkView(viewId)).toBe(true)
  })

  test('ids with slashes in them keep everything after the first', () => {
    expect(parseWorkView('default:work:view/a/b')).toEqual({ kind: 'view', viewId: 'a/b' })
  })

  test('other views, unfinished and unknown ids are not work screens', () => {
    for (const viewId of [
      undefined,
      '',
      'default:inbox',
      'default:work:',
      'default:work:project',
      'default:work:project/',
      'default:work:view/',
      'default:work:thing/1',
      'work:inbox',
    ])
      expect(parseWorkView(viewId)).toBeUndefined()
    expect(isWorkView('default:all')).toBe(false)
    expect(isWorkView(undefined)).toBe(false)
  })
})

describe('work items in the item param', () => {
  test('round trip beside the other item ids', () => {
    expect(workItemId('abc')).toBe('work:abc')
    expect(parseWorkItemId('work:abc')).toBe('abc')
  })

  test('other ids and an empty one are not work items', () => {
    expect(parseWorkItemId('record:abc')).toBeUndefined()
    expect(parseWorkItemId('work:')).toBeUndefined()
    expect(parseWorkItemId(undefined)).toBeUndefined()
  })
})

describe('the Index opens a work screen as a program', () => {
  test('a work view id resolves to its own title and program', () => {
    const view = resolveDefaultView('default:work:view/active')
    expect(view?.viewId).toBe('default:work:view/active')
    expect(view?.current.title).toBe('Active')
    expect(view?.current.program).toContain('WorkView("active")')
  })

  test('each screen has a program over the library', () => {
    expect(workProgramFor('default:work:inbox')?.program).toBe('root = WorkInbox()')
    expect(workProgramFor('default:work:projects')?.program).toBe('root = WorkProjects()')
    expect(workProgramFor('default:work:project/p 1')?.program).toBe(
      'root = WorkProject("p 1")',
    )
    expect(workProgramFor('default:other')).toBeUndefined()
  })

  test('an id that is not a work screen is left to the Index', () => {
    expect(workProgramFor('default:work:nope/1')).toBeUndefined()
    expect(resolveDefaultView('default:work:nope/1')).toBeUndefined()
  })
})
