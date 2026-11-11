// SOURCING: bun:test over a headless dockview-core DockviewComponent, the
// engine under DockviewReact, so the Vault's layout moves real groups.
import { afterEach, expect, test } from 'bun:test'
import { DockviewComponent } from 'dockview-core'
import type { DockviewApi } from 'dockview-core'
import { useInspectedFile } from '@/components/inspector/inspector-state'
import { followFront } from '@/components/shell/arrangements'
import {
  START,
  addTool,
  buildDefaultLayout,
  keepEditorPlace,
  keepSideWidths,
  openVaultFile,
} from './vault-layout'
import { useVaultFile } from './vault-state'

const opened: Array<DockviewComponent> = []
afterEach(() => {
  for (const component of opened.splice(0)) component.dispose()
  useInspectedFile.setState({ file: undefined })
  useVaultFile.setState({ file: undefined })
  document.body.innerHTML = ''
})

/** An empty Vault dock, as wide as a laptop's sheet. */
function vault(): DockviewApi {
  const element = document.createElement('div')
  document.body.append(element)
  const component = new DockviewComponent(element, {
    createComponent: () => ({
      element: document.createElement('div'),
      init: () => undefined,
    }),
  })
  component.layout(1400, 800)
  opened.push(component)
  return component.api
}

const note = (entryId: string, path = `${entryId}.md`) => ({
  workspaceId: 'ws',
  entryId,
  path,
})

type Node = ReturnType<DockviewApi['toJSON']>['grid']['root']

/** The grid's groups in reading order, each as its panel ids. */
function columns(api: DockviewApi) {
  const leaves = (node: Node): Array<Array<string>> =>
    Array.isArray(node.data) ? node.data.flatMap(leaves) : [node.data.views]
  return leaves(api.toJSON().grid.root)
}

const widthOf = (api: DockviewApi, panelId: string) =>
  api.getPanel(panelId)!.group.api.width

test('the Vault starts as Obsidian does: files, the empty tab, outline and links over the graph', () => {
  const api = vault()
  buildDefaultLayout(api)
  expect(columns(api)).toEqual([
    ['files'],
    [START],
    ['outline', 'links'],
    ['graph'],
  ])
  expect(widthOf(api, 'files')).toBe(300)
  expect(widthOf(api, 'outline')).toBe(320)
  // The graph sits below the tabs, in the same right-hand column.
  expect(widthOf(api, 'graph')).toBe(320)
})

test('a file takes the empty tab’s place, and later files join its tabs', () => {
  const api = vault()
  buildDefaultLayout(api)
  openVaultFile(api, note('a'))
  openVaultFile(api, note('b'))
  expect(columns(api)).toEqual([
    ['files'],
    ['workspace-file:ws:a', 'workspace-file:ws:b'],
    ['outline', 'links'],
    ['graph'],
  ])
})

test('a file that took another’s place opens in its tab', () => {
  const api = vault()
  buildDefaultLayout(api)
  openVaultFile(api, note('a'))
  openVaultFile(api, note('b'))
  openVaultFile(api, note('n', 'new.md'), 'a.md')
  expect(columns(api)[1]?.toSorted()).toEqual([
    'workspace-file:ws:b',
    'workspace-file:ws:n',
  ])
  expect(api.activePanel?.id).toBe('workspace-file:ws:n')
})

test('the last file closing brings back the empty tab in the editor’s column', () => {
  const api = vault()
  buildDefaultLayout(api)
  openVaultFile(api, note('a'))
  api.removePanel(api.getPanel('workspace-file:ws:a')!)
  keepEditorPlace(api)
  expect(columns(api)).toEqual([
    ['files'],
    [START],
    ['outline', 'links'],
    ['graph'],
  ])
})

test('a closed tool comes back where the default layout has it', () => {
  const api = vault()
  buildDefaultLayout(api)
  for (const id of ['files', 'graph', 'links'])
    api.removePanel(api.getPanel(id)!)
  addTool(api, 'graph')
  addTool(api, 'links')
  addTool(api, 'files')
  expect(columns(api)).toEqual([
    ['files'],
    [START],
    ['outline', 'links'],
    ['graph'],
  ])
})

test('only the editor gives or takes the space when a column comes or goes', () => {
  const api = vault()
  buildDefaultLayout(api)
  const stop = keepSideWidths(api)
  api.removePanel(api.getPanel('files')!)
  expect(widthOf(api, 'outline')).toBe(320)
  addTool(api, 'files')
  expect(widthOf(api, 'outline')).toBe(320)
  stop()
})

test('the Vault’s panels follow its own front file, and the dock’s stays inspected', () => {
  const api = vault()
  buildDefaultLayout(api)
  const docked = note('d')
  useInspectedFile.setState({ file: docked })
  const stop = followFront(api, useVaultFile)
  openVaultFile(api, note('a'))
  openVaultFile(api, note('b'))
  expect(useVaultFile.getState().file).toEqual(note('b'))
  expect(useInspectedFile.getState().file).toBe(docked)
  stop()
})
