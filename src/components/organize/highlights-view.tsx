// SOURCING: assistant-ui's message state, lib/theorem/highlight-finders (copied from mikecann/threadbear@78b77e1, MIT, Mike Cann), the artifact model and view, lib/theorem/reviews and organization. Its groups, their order and the "Show all" caps are translated from Threadbear's HighlightSections.swift in the same commit. Found in the thread with no model, as Threadbear does.
import { useAuiState } from '@assistant-ui/react'
import { useParams } from '@tanstack/react-router'
import { format } from 'date-fns'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useThreadArtifacts } from '@/components/artifacts/artifact-model'
import { useArtifactView } from '@/components/artifacts/artifact-view'
import { Icon } from '@/components/icons'
import { commitsIn, linksIn } from '@/lib/theorem/highlight-finders'
import type { FoundLink } from '@/lib/theorem/highlight-finders'
import {
  attentionLabel,
  primaryProjectId,
  useOrganization,
  useOrganizedViews,
} from '@/lib/theorem/organization'
import { useThreadReviews } from '@/lib/theorem/reviews'
import { cn } from '@/lib/utils'
import { ReviewCard } from '@/components/review/review-card'

const COMMIT_LIMIT = 5
const LINK_LIMIT = 10

/** The brief's bullets. The Librarian writes "- " lines; an older paragraph is one point. */
const points = (brief: string) =>
  brief
    .split('\n')
    .map((line) => line.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean)

function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-baseline gap-1.5 text-sm font-medium">
        {title}
        {count !== undefined && (
          <span className="text-xs font-normal text-ink-muted tabular-nums">
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  )
}

/** The first few of a long group, and a way to the rest. */
function Capped<T>({
  items,
  limit,
  render,
}: {
  items: readonly T[]
  limit: number
  render: (item: T) => ReactNode
}) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, limit)
  return (
    <>
      <ul className="flex flex-col">{shown.map(render)}</ul>
      {items.length > shown.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="self-start rounded-sm text-xs text-ink-muted underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-focus"
        >
          Show all {items.length}
        </button>
      )}
    </>
  )
}

const row =
  'flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-start text-sm outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus'

type Found = {
  links: FoundLink[]
  commits: Array<{ branch: string; sha: string; message: string }>
  attachments: Array<{ id: string; name: string }>
}

/** What the thread's own messages handed over, newest first. */
function useFoundInMessages(): Found {
  const messages = useAuiState((s) => s.thread.messages)
  return useMemo(() => {
    const links = new Map<string, FoundLink>()
    const commits = new Map<string, Found['commits'][number]>()
    const attachments = new Map<string, Found['attachments'][number]>()
    for (const message of [...messages].reverse()) {
      for (const part of [...message.content].reverse()) {
        if (part.type === 'text' && message.role === 'assistant') {
          for (const link of linksIn(part.text))
            if (!links.has(link.id)) links.set(link.id, link)
          for (const commit of commitsIn(part.text))
            if (!commits.has(commit.sha)) commits.set(commit.sha, commit)
        }
        if (part.type === 'tool-call' && typeof part.result === 'string')
          for (const commit of commitsIn(part.result))
            if (!commits.has(commit.sha)) commits.set(commit.sha, commit)
        if (part.type === 'data' && part.name === 'theorem-attachment') {
          const data = part.data as { uploadId?: string; name?: string }
          if (data.uploadId)
            attachments.set(data.uploadId, {
              id: data.uploadId,
              name: data.name ?? 'File',
            })
        }
      }
    }
    return {
      links: [...links.values()],
      commits: [...commits.values()],
      attachments: [...attachments.values()],
    }
  }, [messages])
}

/** What did this work produce, and what still needs attention? */
export function HighlightsView({ className }: { className?: string }) {
  const { threadId } = useParams({ strict: false })
  const views = useOrganizedViews()
  const { data: organization } = useOrganization()
  const thread = threadId ? views.byId.get(threadId) : undefined
  const project = organization?.projects.find(
    (p) => thread && p.projectId === primaryProjectId(thread),
  )
  const { data: reviews = [] } = useThreadReviews(threadId)
  const artifacts = useThreadArtifacts()
  const openArtifact = useArtifactView((s) => s.open)
  const { links, commits, attachments } = useFoundInMessages()

  const reasons = (thread?.attention.reasons ?? []).filter(
    (reason) => reason.kind !== 'review',
  )
  const artifactRows = [...artifacts.entries()]
    .map(([artifactId, versions]) => ({
      artifactId,
      title: versions.at(-1)?.title ?? 'Artifact',
      revisions: versions.length,
    }))
    .reverse()

  const empty =
    !thread?.summary &&
    !project?.state &&
    reasons.length === 0 &&
    reviews.length === 0 &&
    artifactRows.length === 0 &&
    attachments.length === 0 &&
    links.length === 0 &&
    commits.length === 0

  return (
    <div className={cn('h-full overflow-y-auto', className)}>
      <div className="mx-auto flex w-full max-w-(--spacing-reading) flex-col gap-6 px-4 py-6">
        {empty && (
          <p className="text-sm text-ink-muted">
            Nothing yet. What this thread makes and shares collects here.
          </p>
        )}
        {reasons.length > 0 && (
          <Section title="Needs attention" count={reasons.length}>
            <ul className="flex flex-col">
              {reasons.map((reason) => (
                <li key={`${reason.kind}:${reason.atMs}`} className={row}>
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-attention"
                  />
                  {attentionLabel(reason)}
                  <span className="ms-auto text-xs text-ink-muted">
                    {format(reason.atMs, 'MMM d, p')}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {reviews.length > 0 && (
          <Section title="Reviews" count={reviews.length}>
            <div className="flex flex-col gap-2">
              {reviews.map((review) => (
                <ReviewCard key={review.reviewId} review={review} />
              ))}
            </div>
          </Section>
        )}
        {thread?.summary && (
          <Section title="Where it stands">
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm">
              {points(thread.summary.text).map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </Section>
        )}
        {project?.state && (
          <Section title={project.title}>
            <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-ink-muted">
              {points(project.state.text).map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </Section>
        )}
        {artifactRows.length > 0 && (
          <Section title="Apps and artifacts" count={artifactRows.length}>
            <ul className="flex flex-col">
              {artifactRows.map(({ artifactId, title, revisions }) => (
                <li key={artifactId}>
                  <button
                    type="button"
                    className={row}
                    onClick={() => openArtifact(artifactId)}
                  >
                    <Icon.Artifact className="size-4 shrink-0 text-ink-muted" />
                    <span className="min-w-0 flex-1 truncate">{title}</span>
                    {revisions > 1 && (
                      <span className="text-xs text-ink-muted tabular-nums">
                        {revisions} versions
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {attachments.length > 0 && (
          <Section title="Files" count={attachments.length}>
            <ul className="flex flex-col">
              {attachments.map((file) => (
                <li key={file.id} className={row}>
                  <Icon.Attachment className="size-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 truncate">{file.name}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {links.length > 0 && (
          <Section title="Links and pull requests" count={links.length}>
            <Capped
              items={links}
              limit={LINK_LIMIT}
              render={(link) => (
                <li key={link.id}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className={row}
                  >
                    {link.kind === 'pr' ? (
                      <Icon.Fork className="size-4 shrink-0 text-ink-muted" />
                    ) : (
                      <Icon.Link className="size-4 shrink-0 text-ink-muted" />
                    )}
                    <span className="min-w-0 truncate">{link.title}</span>
                  </a>
                </li>
              )}
            />
          </Section>
        )}
        {commits.length > 0 && (
          <Section title="Commits" count={commits.length}>
            <Capped
              items={commits}
              limit={COMMIT_LIMIT}
              render={(commit) => (
                <li key={commit.sha} className={row}>
                  <code className="shrink-0 text-xs text-ink-muted">
                    {commit.sha}
                  </code>
                  <span className="min-w-0 truncate">{commit.message}</span>
                  <span className="ms-auto shrink-0 text-xs text-ink-muted">
                    {commit.branch}
                  </span>
                </li>
              )}
            />
          </Section>
        )}
      </div>
    </div>
  )
}
