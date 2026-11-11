// SOURCING: none — pure logic: how the work tracker's screens and items are named in the Index's existing `view` and `item` search params (no second navigation model)
export const WORK_VIEW_PREFIX = 'default:work:'
export const WORK_ITEM_PREFIX = 'work:'

/** The screens the tracker adds to the Index. A view is a saved or built-in filter over the items. */
export type WorkScreen =
  | { kind: 'inbox' }
  | { kind: 'projects' }
  | { kind: 'project'; projectId: string }
  | { kind: 'view'; viewId: string }

/** The Index view id a screen opens as: `view=default:work:inbox`, `.../project/<id>`, `.../view/<id>`. */
export function workViewId(screen: WorkScreen): string {
  switch (screen.kind) {
    case 'inbox':
      return `${WORK_VIEW_PREFIX}inbox`
    case 'projects':
      return `${WORK_VIEW_PREFIX}projects`
    case 'project':
      return `${WORK_VIEW_PREFIX}project/${screen.projectId}`
    case 'view':
      return `${WORK_VIEW_PREFIX}view/${screen.viewId}`
  }
}

export const isWorkView = (viewId: string | undefined): boolean =>
  !!viewId && viewId.startsWith(WORK_VIEW_PREFIX)

/** The screen a view id names; anything else, including an unfinished id, is not one. */
export function parseWorkView(viewId: string | undefined): WorkScreen | undefined {
  if (!viewId || !isWorkView(viewId)) return undefined
  const rest = viewId.slice(WORK_VIEW_PREFIX.length)
  if (rest === 'inbox') return { kind: 'inbox' }
  if (rest === 'projects') return { kind: 'projects' }
  const slash = rest.indexOf('/')
  if (slash < 0) return undefined
  const id = rest.slice(slash + 1)
  if (!id) return undefined
  switch (rest.slice(0, slash)) {
    case 'project':
      return { kind: 'project', projectId: id }
    case 'view':
      return { kind: 'view', viewId: id }
    default:
      return undefined
  }
}

/** The `item` param for a work item: `work:<id>`, beside the documents and `record:` ids. */
export const workItemId = (itemId: string) => `${WORK_ITEM_PREFIX}${itemId}`

export function parseWorkItemId(item: string | undefined): string | undefined {
  if (!item?.startsWith(WORK_ITEM_PREFIX)) return undefined
  return item.slice(WORK_ITEM_PREFIX.length) || undefined
}
