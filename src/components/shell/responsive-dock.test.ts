// Real Dockview engine: resizing must move existing groups, never recreate drafts.
import { afterEach, expect, test } from 'bun:test'
import { DockviewComponent } from 'dockview-core'
import { adaptDock } from './responsive-dock'
import { waitFor } from '../../../test/workspace'

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((fn) => fn())
  document.body.innerHTML = ''
  document.documentElement.style.fontSize = ''
})
const frame = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
function setup(stacked = false) {
  document.documentElement.style.fontSize = '16px'
  const host = document.createElement('div')
  document.body.append(host)
  const component = new DockviewComponent(host, {
    createComponent: () => ({
      element: document.createElement('div'),
      init: () => undefined,
    }),
  })
  component.layout(1200, 800)
  const api = component.api
  const thread = api.addPanel({
    id: 'thread',
    component: 'thread',
    renderer: 'always',
  })
  const inspector = api.addPanel({
    id: 'outline',
    component: 'outline',
    initialWidth: 400,
    minimumWidth: 340,
    position: { referencePanel: 'thread', direction: 'right' },
  })
  const graph = stacked
    ? api.addPanel({
        id: 'graph',
        component: 'graph',
        initialHeight: 300,
        position: { referencePanel: 'outline', direction: 'below' },
      })
    : undefined
  const adapter = adaptDock(api, host)
  cleanups.push(
    () => component.dispose(),
    () => adapter.dispose(),
  )
  return { api, component, thread, inspector, graph, adapter }
}
test('a constrained reading track floats the inspector and restores the same panel when room returns', async () => {
  const { api, component, thread, inspector } = setup()
  await frame()
  component.layout(700, 800)
  await waitFor(() => inspector.api.location.type === 'floating')
  expect(inspector.api.location.type).toBe('floating')
  expect(api.getPanel('thread')).toBe(thread)
  expect(thread.api.width).toBeGreaterThanOrEqual(560)
  component.layout(320, 800)
  await frame()
  expect(inspector.group.minimumWidth).toBe(0)
  expect(inspector.group.api.width).toBeLessThanOrEqual(320)
  component.layout(1400, 800)
  await waitFor(() => inspector.api.location.type === 'grid')
  expect(inspector.api.location.type).toBe('grid')
  expect(api.getPanel('outline')).toBe(inspector)
  expect(inspector.group.minimumWidth).toBe(340)
})
test('a closed responsive inspector is not resurrected by widening the window', async () => {
  const { api, component, inspector } = setup()
  component.layout(700, 800)
  await waitFor(() => inspector.api.location.type === 'floating')
  expect(inspector.api.location.type).toBe('floating')
  api.removePanel(inspector)
  component.layout(1400, 800)
  await frame()
  expect(api.getPanel('outline')).toBeUndefined()
  expect(api.panels).toHaveLength(1)
})

function shape(
  node: ReturnType<ReturnType<typeof setup>['api']['toJSON']>['grid']['root'],
): unknown {
  return Array.isArray(node.data) ? node.data.map(shape) : node.data.views
}

test('stacked inspectors recover their preferred split, size and mounted panels', async () => {
  const { api, component, inspector, graph } = setup(true)
  await frame()
  const upper = inspector.group
  const lower = graph!.group
  const before = {
    width: upper.api.width,
    top: upper.api.height,
    bottom: lower.api.height,
  }
  const expected = shape(api.toJSON().grid.root)
  component.layout(700, 800)
  await waitFor(() =>
    [inspector, graph!].every(
      (panel) => panel.api.location.type === 'floating',
    ),
  )
  component.layout(1200, 800)
  await waitFor(() =>
    [inspector, graph!].every((panel) => panel.api.location.type === 'grid'),
  )
  expect(shape(api.toJSON().grid.root)).toEqual(expected)
  expect(api.getPanel('outline')).toBe(inspector)
  expect(api.getPanel('graph')).toBe(graph)
  expect(inspector.group).toBe(upper)
  expect(graph!.group).toBe(lower)
  expect(Math.abs(upper.api.width - before.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(lower.api.width - before.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(upper.api.height - before.top)).toBeLessThanOrEqual(1)
  expect(Math.abs(lower.api.height - before.bottom)).toBeLessThanOrEqual(1)
})

test('preferred saves while overlaid preserve closures and additions without saving temporary windows', async () => {
  const { api, component, inspector, graph, adapter } = setup(true)
  await frame()
  const wide = adapter.layoutForSave()!
  component.layout(700, 800)
  await waitFor(() =>
    [inspector, graph!].every(
      (panel) => panel.api.location.type === 'floating',
    ),
  )
  expect(shape(adapter.layoutForSave()!.grid.root)).toEqual(
    shape(wide.grid.root),
  )
  expect(adapter.layoutForSave()!.floatingGroups).toBeUndefined()
  const extra = api.addPanel({
    id: 'links',
    component: 'links',
    position: { referenceGroup: graph!.group },
  })
  api.removePanel(inspector)
  expect(graph!.api.location.type).toBe('floating')
  const saved = adapter.layoutForSave()!
  expect(Object.keys(saved.panels).sort()).toEqual(['graph', 'links', 'thread'])
  expect(JSON.stringify(shape(saved.grid.root))).not.toContain('outline')
  expect(JSON.stringify(shape(saved.grid.root))).toContain('links')
  expect(saved.floatingGroups).toBeUndefined()
  expect(saved.grid.width).toBe(wide.grid.width)
  expect(api.getPanel('links')).toBe(extra)
  const reloaded = new DockviewComponent(document.createElement('div'), {
    createComponent: () => ({
      element: document.createElement('div'),
      init: () => undefined,
    }),
  })
  cleanups.push(() => reloaded.dispose())
  reloaded.layout(1200, 800)
  reloaded.api.fromJSON(saved)
  expect(reloaded.api.getPanel('outline')).toBeUndefined()
  expect(reloaded.api.getPanel('links')?.api.location.type).toBe('grid')
})
