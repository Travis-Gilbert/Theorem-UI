// SOURCING: Dockview's serialized grid, public group moves, and always-rendered
// panels. The 35rem reading-space policy is theorem-appearance-v1.
import type { DockviewApi, DockviewGroupPanel, Position } from 'dockview-react'
import { THREAD } from './arrangements'

type Layout = ReturnType<DockviewApi['toJSON']>
type GridNode = Layout['grid']['root']
type GroupState = Exclude<GridNode['data'], GridNode[]>
type Anchor = { groupId: string; position: Position }
type FloatedGroup = {
  width: number
  heightFraction: number
  minimumWidth: number
  anchors: Anchor[]
}

function groupIds(node: GridNode): string[] {
  return Array.isArray(node.data) ? node.data.flatMap(groupIds) : [node.data.id]
}

/** The closest sibling records the split a group belonged to when it left. */
function anchorsOf(grid: Layout['grid'], groupId: string): Anchor[] {
  const visit = (node: GridNode, horizontal: boolean): Anchor[] => {
    if (!Array.isArray(node.data)) return []
    const children = node.data
    const index = children.findIndex((child) =>
      groupIds(child).includes(groupId),
    )
    if (index < 0) return []
    const previous = children.slice(0, index).reverse().flatMap(groupIds)
    const next = children.slice(index + 1).flatMap(groupIds)
    return [
      ...visit(children[index]!, !horizontal),
      ...previous.map((id): Anchor => ({
        groupId: id,
        position: horizontal ? 'right' : 'bottom',
      })),
      ...next.map((id): Anchor => ({
        groupId: id,
        position: horizontal ? 'left' : 'top',
      })),
    ]
  }
  return visit(grid.root, grid.orientation === 'HORIZONTAL')
}

function groupsOf(node: GridNode): GroupState[] {
  return Array.isArray(node.data) ? node.data.flatMap(groupsOf) : [node.data]
}

/** Dockview serializes the live floating location. Save its underlying grid
 * while the responsive overlays are open, with the live panel/tab states.
 */
function preferredLayout(
  current: Layout,
  preferred: Layout,
  temporary: ReadonlySet<string>,
): Layout {
  const currentGridGroups = groupsOf(current.grid.root)
  const groups = new Map(currentGridGroups.map((group) => [group.id, group]))
  const floatingGroups = current.floatingGroups?.filter((floating) => {
    const states = floating.grid
      ? groupsOf(floating.grid.root)
      : floating.data
        ? [floating.data]
        : []
    if (!states.some(({ id }) => temporary.has(id))) return true
    for (const state of states) groups.set(state.id, state)
    return false
  })
  const included = new Set<string>()
  const project = (node: GridNode, root = false): GridNode | undefined => {
    if (!Array.isArray(node.data)) {
      const data = groups.get(node.data.id)
      if (!data) return undefined
      included.add(data.id)
      return { ...node, data }
    }
    const data = node.data.flatMap((child) => project(child) ?? [])
    return root || data.length ? { ...node, data } : undefined
  }
  const root = project(preferred.grid.root, true)!
  if (!Array.isArray(root.data)) return current
  // Keep the splits of new docked groups from the live grid. A new group
  // inside a temporary window gets an adjacent preferred column.
  const appendNew = (node: GridNode): GridNode | undefined => {
    if (!Array.isArray(node.data)) {
      if (included.has(node.data.id)) return undefined
      included.add(node.data.id)
      return node
    }
    const data = node.data.flatMap((child) => appendNew(child) ?? [])
    return data.length ? { ...node, data } : undefined
  }
  const additions = appendNew(current.grid.root)
  if (additions && Array.isArray(additions.data))
    root.data.push(...additions.data)
  for (const data of groups.values())
    if (!included.has(data.id))
      root.data.push({ type: 'leaf', data, size: 300 })
  const result = { ...current, grid: { ...preferred.grid, root } }
  if (floatingGroups?.length) result.floatingGroups = floatingGroups
  else delete result.floatingGroups
  return result
}

/** Release inspector columns before navigation releases its own column. */
export function adaptDock(api: DockviewApi, host: HTMLElement) {
  const floated = new Map<DockviewGroupPanel, FloatedGroup>()
  const preferredSizes = new WeakMap<
    DockviewGroupPanel,
    { width: number; heightFraction: number }
  >()
  let preferred: Layout | undefined
  let lastDocked: Layout | undefined
  let capturedWidth = host.clientWidth || api.width
  let capturedViewport = window.innerWidth
  let scheduled = 0
  let settleFrame = 0
  const restoredSizes = new Map<
    DockviewGroupPanel,
    { width?: number; heightFraction?: number }
  >()
  // Keep the conversation header exposed while an inspector overlays the body.
  const overlayTop = () => {
    const header = host.querySelector('[data-appearance-part="main"] header')
    if (!header) return 48
    const edge =
      header.getBoundingClientRect().bottom - host.getBoundingClientRect().top
    return edge > 0 ? edge : 48
  }
  const overlayHeight = () =>
    Math.min(640, Math.max(0, api.height - overlayTop()))
  let changing = false
  const update = () => {
    scheduled = 0
    const thread = api.getPanel(THREAD)
    if (!thread || thread.api.location.type !== 'grid' || changing) return
    changing = true
    try {
      const minimum =
        35 * parseFloat(getComputedStyle(document.documentElement).fontSize)
      if (thread.group.minimumWidth !== 0)
        thread.group.api.setConstraints({ minimumWidth: 0 })
      for (const [group] of floated) {
        if (
          !api.groups.includes(group) ||
          group.api.location.type !== 'floating'
        )
          floated.delete(group)
      }
      if (!floated.size) preferred = undefined
      const candidates = api.groups.filter(
        (group) => group !== thread.group && group.api.location.type === 'grid',
      )
      // The shell can change its header height before the splitview reports
      // the new width. Keep the settled geometry through that intermediate frame.
      const layoutWidth = host.clientWidth || api.width
      if (
        thread.api.width >= minimum &&
        (capturedViewport === window.innerWidth || capturedWidth !== layoutWidth)
      ) {
        capturedWidth = layoutWidth
        capturedViewport = window.innerWidth
        const snapshot = api.toJSON()
        lastDocked = preferred
          ? preferredLayout(
              snapshot,
              preferred,
              new Set([...floated.keys()].map((group) => group.id)),
            )
          : snapshot
        if (preferred) preferred = lastDocked
        for (const group of candidates)
          preferredSizes.set(group, {
            width: group.api.width || Math.max(300, group.minimumWidth),
            heightFraction: group.api.height / api.height || 0.5,
          })
      }
      const sizesBeforeMoving = new Map(
        candidates.map((group) => [
          group,
          {
            width: group.api.width,
            heightFraction: group.api.height / api.height,
          },
        ]),
      )
      // Removing a leaf collapses its split. Reversing the moves rebuilds
      // that split around a sibling still in the grid, with no remounts.
      for (const [group, { width, heightFraction, minimumWidth, anchors }] of [
        ...floated,
      ].reverse()) {
        const gridGroups = new Map(
          api.groups
            .filter((candidate) => candidate.api.location.type === 'grid')
            .map((candidate) => [candidate.id, candidate]),
        )
        const anchor = anchors.find(({ groupId }) => gridGroups.has(groupId))
        const reference = anchor
          ? gridGroups.get(anchor.groupId)!
          : thread.group
        const position = anchor?.position ?? 'right'
        const vertical = position === 'top' || position === 'bottom'
        const addsWidth = !vertical
        if (thread.api.width >= minimum + (addsWidth ? width + 4 : 0)) {
          group.api.moveTo({ group: reference, position, skipSetActive: true })
          group.api.setConstraints({ minimumWidth })
          group.api.setSize(
            vertical
              ? { height: Math.round(heightFraction * api.height) }
              : { width },
          )
          restoredSizes.set(group, vertical ? { heightFraction } : { width })
          floated.delete(group)
        } else {
          group.api.setSize({
            width: Math.min(width, api.width),
            height: overlayHeight(),
          })
        }
      }
      for (const group of candidates) {
        if (thread.api.width >= minimum) break
        const snapshot = api.toJSON()
        preferred ??= lastDocked ?? snapshot
        const prior = preferredSizes.get(group)
        const measured = sizesBeforeMoving.get(group)!
        const width =
          prior?.width ?? (measured.width || Math.max(300, group.minimumWidth))
        const heightFraction =
          prior?.heightFraction ?? (measured.heightFraction || 0.5)
        const minimumWidth = group.minimumWidth
        const anchors = anchorsOf(snapshot.grid, group.id)
        group.api.setConstraints({ minimumWidth: 0 })
        floated.set(group, { width, heightFraction, minimumWidth, anchors })
        api.addFloatingGroup(group, {
          width: Math.min(width, api.width),
          height: overlayHeight(),
          position: { left: 0, top: overlayTop() },
        })
      }
      for (const group of api.groups) {
        if (group !== thread.group) {
          group.element.dataset.appearanceWidthRole = 'inspector'
          group.element.dataset.appearancePart = 'inspector'
          group.element.dataset.overlay = String(
            group.api.location.type !== 'grid',
          )
        }
      }
      host.dataset.inspectorPresentation = floated.size ? 'overlay' : 'docked'
      // Always-rendered Dockview panels use positioned overlays. Refresh their
      // boxes after the split/floating DOM has reached its new dimensions.
      cancelAnimationFrame(settleFrame)
      settleFrame = requestAnimationFrame(() => {
        changing = true
        try {
          api.layout(
            host.clientWidth || api.width,
            host.clientHeight || api.height,
            true,
          )
          for (const [group, { width, heightFraction }] of restoredSizes)
            if (group.api.location.type === 'grid')
              group.api.setSize({
                width,
                height:
                  heightFraction === undefined
                    ? undefined
                    : Math.round(heightFraction * api.height),
              })
          restoredSizes.clear()
        } finally {
          changing = false
        }
      })
    } finally {
      changing = false
    }
  }
  const schedule = () => {
    if (!scheduled && !changing) scheduled = requestAnimationFrame(update)
  }
  const listener = api.onDidLayoutChange(schedule)
  const dimensions = api.getPanel(THREAD)?.api.onDidDimensionsChange(schedule)
  const observer = new ResizeObserver(schedule)
  observer.observe(host)
  observer.observe(document.documentElement)
  schedule()
  return {
    layoutForSave: () => {
      if (changing) return undefined
      const current = api.toJSON()
      return preferred && floated.size
        ? preferredLayout(
            current,
            preferred,
            new Set([...floated.keys()].map((group) => group.id)),
          )
        : current
    },
    dispose: () => {
      cancelAnimationFrame(scheduled)
      cancelAnimationFrame(settleFrame)
      listener.dispose()
      dimensions?.dispose()
      observer.disconnect()
    },
  }
}
