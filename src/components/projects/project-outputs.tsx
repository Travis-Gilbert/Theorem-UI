// SOURCING: lib/theorem/organization's project outputs read, the artifact view and review opener, the owned output marks from components/icons. Moved from the sidebar's "Apps & outputs" fold: what a project produced belongs on its home, not in the conversation tree.
import { useNavigate } from '@tanstack/react-router'
import { Icon } from '@/components/icons'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { useShell } from '@/components/shell/shell-state'
import { describeError } from '@/lib/theorem/client'
import { useProjectOutputs } from '@/lib/theorem/organization'
import { openReview } from '@/lib/theorem/reviews'

const OUTPUT_MARK = {
  app: Icon.Apps,
  artifact: Icon.Artifact,
  upload: Icon.Attachment,
  review: Icon.Compare,
} as const

/** Files, apps and artifact revisions a project's sessions produced; each opens where it was made. */
export function ProjectOutputs({
  projectId,
  limit,
}: {
  projectId: string
  /** How many to list; all when unset. */
  limit?: number
}) {
  const outputs = useProjectOutputs(projectId)
  const navigate = useNavigate()
  const items = outputs.data?.items ?? []
  const shown = limit === undefined ? items : items.slice(0, limit)
  if (outputs.error)
    return (
      <p className="text-sm text-error-ink">{describeError(outputs.error)}</p>
    )
  if (outputs.isPending)
    return <p className="text-sm text-ink-muted">Loading…</p>
  if (!items.length)
    return <p className="text-sm text-ink-muted">Nothing produced yet.</p>
  return (
    <ul className="flex flex-col gap-px">
      {shown.map((item) => {
        const Mark = OUTPUT_MARK[item.kind]
        return (
          <li key={item.outputId}>
            <button
              type="button"
              title={item.title}
              onClick={async () => {
                useShell.getState().setProjectId(projectId)
                await navigate({
                  to: '/c/$threadId',
                  params: { threadId: item.threadId },
                })
                if (item.artifactId)
                  useArtifactView.getState().open(item.artifactId)
                if (item.reviewId) openReview(item.reviewId)
              }}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-start hover:bg-hover"
            >
              <Mark aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span
                data-appearance-recipe="ui.label"
                className="min-w-0 flex-1 truncate"
              >
                {item.title}
              </span>
              {item.revisionCount > 1 && (
                <span className="text-xs text-ink-muted tabular-nums">
                  {item.revisionCount} revisions
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
