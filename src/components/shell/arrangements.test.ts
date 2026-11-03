// SOURCING: bun:test over a headless dockview-core DockviewComponent, the
// engine under DockviewReact, so the arrangements move real groups.
import { afterEach, expect, test } from 'bun:test'
import { DockviewComponent } from 'dockview-core'
import type { AddPanelPositionOptions, DockviewApi } from 'dockview-core'
import { WORKSPACE_FILE_COMPONENT } from '@/components/workspace/workspace-file-panel'
import { useInspectedFile } from '@/components/inspector/inspector-state'
import {
  addInspector,
  arrange,
  followFront,
  holdsPanelsMenu,
} from './arrangements'

const opened: Array<DockviewComponent> = []
afterEach(() => {
  for (const component of opened.splice(0)) component.dispose()
  useInspectedFile.setState({ file: undefined })
  document.body.innerHTML = ''
})

/** A dock holding the conversation, as the shell starts it. */
function dock(): DockviewApi {
  const element = document.createElement('div')
  document.body.append(element)
  const component = new DockviewComponent(element, {
    createComponent: () => ({
      element: document.createElement('div'),
      init: () => undefined,
    }),
  })
  component.layout(1200, 800)
  opened.push(component)
  component.api.addPanel({ id: 'thread', component: 'thread' })
  return component.api
}

function openFile(
  api: DockviewApi,
  entryId: string,
  position?: AddPanelPositionOptions,
) {
  api.addPanel({
    id: `workspace-file:ws:${entryId}`,
    component: WORKSPACE_FILE_COMPONENT,
    params: { workspaceId: 'ws', entryId, path: `${entryId}.md` },
    position,
  })
}

type Node = ReturnType<DockviewApi['toJSON']>['grid']['root']

/** The grid's groups in reading order, each as its panel ids. */
function columns(api: DockviewApi) {
  const leaves = (node: Node): Array<Array<string>> =>
    Array.isArray(node.data) ? node.data.flatMap(leaves) : [node.data.views]
  return leaves(api.toJSON().grid.root)
}

const panelIds = (api: DockviewApi) => api.panels.map((p) => p.id).sort()

test('Work together puts the conversation left and the documents right', () => {
  const api = dock()
  // Files opened as tabs beside the conversation, in its group.
  openFile(api, 'a', { referencePanel: 'thread' })
  openFile(api, 'b', { referencePanel: 'thread' })
  const before = panelIds(api)

  expect(arrange(api, 'together')).toEqual({ navigator: 'open' })
  expect(columns(api)).toEqual([
    ['thread'],
    ['workspace-file:ws:a', 'workspace-file:ws:b'],
  ])
  expect(panelIds(api)).toEqual(before)
})

test('Work together brings the conversation back left of the documents', () => {
  const api = dock()
  openFile(api, 'a', { direction: 'left' })
  arrange(api, 'together')
  expect(columns(api)).toEqual([['thread'], ['workspace-file:ws:a']])
})

test('Focus fills the dock with the document and closes the navigator', () => {
  const api = dock()
  openFile(api, 'a', { direction: 'right' })
  api.getPanel('thread')!.api.setActive()

  expect(arrange(api, 'focus')).toEqual({ navigator: 'closed' })
  expect(api.hasMaximizedGroup()).toBe(true)
  expect(api.getPanel('workspace-file:ws:a')!.api.isMaximized()).toBe(true)
})

test('Focus with no document open fills the dock with the conversation', () => {
  const api = dock()
  arrange(api, 'focus')
  expect(api.getPanel('thread')!.api.isMaximized()).toBe(true)
})

test('leaving Focus restores the arrangement under it', () => {
  const api = dock()
  openFile(api, 'a', { direction: 'right' })
  arrange(api, 'focus')
  arrange(api, 'together')
  expect(api.hasMaximizedGroup()).toBe(false)
  expect(columns(api)).toEqual([['thread'], ['workspace-file:ws:a']])
})

test('Explore shows the files and opens the links and the graph beside them', () => {
  const api = dock()
  openFile(api, 'a', { direction: 'right' })
  const before = panelIds(api)

  expect(arrange(api, 'explore')).toEqual({ navigator: 'files' })
  expect(columns(api)).toEqual([
    ['thread'],
    ['workspace-file:ws:a'],
    ['links'],
    ['graph'],
  ])
  expect(panelIds(api)).toEqual([...before, 'graph', 'links'].sort())
})

test('Explore keeps an inspector already open, wherever it was put', () => {
  const api = dock()
  addInspector(api, 'links')
  api.getPanel('links')!.api.moveTo({
    group: api.getPanel('thread')!.group,
  })
  arrange(api, 'explore')
  expect(api.panels.filter((p) => p.id === 'links')).toHaveLength(1)
  expect(api.getPanel('links')!.group).toBe(api.getPanel('thread')!.group)
})

test('the outline and links share a group; the graph goes below them', () => {
  const api = dock()
  addInspector(api, 'outline')
  addInspector(api, 'graph')
  addInspector(api, 'links')
  expect(columns(api)).toEqual([['thread'], ['outline', 'links'], ['graph']])
})

test('the panels menu sits with the conversation, and on the group Focus fills', () => {
  const api = dock()
  openFile(api, 'a', { direction: 'right' })
  const thread = api.getPanel('thread')!.group
  const file = api.getPanel('workspace-file:ws:a')!.group
  expect([holdsPanelsMenu(thread), holdsPanelsMenu(file)]).toEqual([
    true,
    false,
  ])
  arrange(api, 'focus')
  expect(holdsPanelsMenu(file)).toBe(true)
})

const ref = (entryId: string, path: string) => ({
  workspaceId: 'ws',
  entryId,
  path,
})
const inspected = () => useInspectedFile.getState().file

test('the inspector follows the file in front as it learns its entry and moves', () => {
  const api = dock()
  api.addPanel({
    id: 'f',
    component: WORKSPACE_FILE_COMPONENT,
    params: ref('', 'a.md'),
    position: { direction: 'right' },
  })
  const stop = followFront(api)
  expect(inspected()).toEqual(ref('', 'a.md'))
  const file = api.getPanel('f')!.api
  file.updateParameters(ref('e1', 'a.md'))
  file.updateParameters(ref('e1', 'b.md'))
  expect(inspected()).toEqual(ref('e1', 'b.md'))
  stop()
})

test('the inspector keeps a file another panel has focus over, through a rename', () => {
  const api = dock()
  openFile(api, 'a', { direction: 'right' })
  openFile(api, 'b', { referencePanel: 'workspace-file:ws:a' })
  const stop = followFront(api)
  expect(inspected()?.entryId).toBe('b')
  api.getPanel('thread')!.api.setActive()
  api
    .getPanel('workspace-file:ws:b')!
    .api.updateParameters(ref('b', 'renamed.md'))
  expect(inspected()).toEqual(ref('b', 'renamed.md'))
  stop()
})
