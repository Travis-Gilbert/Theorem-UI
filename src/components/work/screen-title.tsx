// SOURCING: none — the Index header's title for a work screen: a saved view's or a project's own name once it is known, else the built-in title; reads the tracker only while it is on
import { useWorkProject, useWorkViews } from './queries'
import { parseWorkView } from './route'
import { useWorkTracker } from './settings'

function Named({ viewId, fallback }: { viewId: string; fallback: string }) {
  const screen = parseWorkView(viewId)
  const views = useWorkViews()
  const project = useWorkProject(
    screen?.kind === 'project' ? screen.projectId : undefined,
  )
  if (screen?.kind === 'view')
    return views.data?.find((v) => v.id === screen.viewId)?.name ?? fallback
  if (screen?.kind === 'project') return project.data?.project.name ?? fallback
  return fallback
}

/** The name a work screen shows in the Index header. */
export function WorkScreenTitle({
  viewId,
  fallback,
}: {
  viewId: string
  fallback: string
}) {
  const tracker = useWorkTracker()
  return tracker.state === 'on' ? (
    <Named viewId={viewId} fallback={fallback} />
  ) : (
    fallback
  )
}
