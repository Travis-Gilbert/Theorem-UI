// SOURCING: src/stories/fake-theorem's route map, answered from the committed fixtures. Reviews keep their state in memory so the pane's draft and submit can be scripted.
import type { Theorem } from '@/lib/theorem/client'
import type { Review, ReviewResponse } from '@/lib/theorem/reviews'
import type { FakeRoutes } from './fake-theorem'
import {
  canvasSpaceFixture,
  documentFixtures,
  documentSnapshot,
  nestedSpaceFixture,
  uploadFixtures,
} from './fixtures/notes'
import { organizationFixture } from './fixtures/organization'
import { reviewFixture, reviewShots } from './fixtures/review'
import { threadMessages } from './fixtures/thread'

const BASE = '/api/chat/v1'

const writtenMarkdown = async (request: Request) =>
  ((await request.json()) as { body: { markdownProjection: string } }).body
    .markdownProjection

export type StoryRouteOptions = { reviewless?: boolean }

export function storyRoutes(now: number, options: StoryRouteOptions = {}): FakeRoutes {
  const organization = organizationFixture(now)
  let review: Review = reviewFixture(now)
  const projects = organization.projects.map((project) => ({
    schema: 'theorem.chat.project.v1',
    projectId: project.projectId,
    tenantId: 'story',
    title: project.title,
    instructions: '',
    status: 'regular',
    revision: 1,
    createdAtMs: now,
    updatedAtMs: now,
  }))
  const threadOf = (threadId: string) => {
    const entry = organization.threads.find((t) => t.threadId === threadId)
    return {
      schema: 'theorem.chat.thread.v1',
      threadId,
      tenantId: 'story',
      projectId: entry?.homeProjectId ?? 'project-theorem',
      title: entry?.title ?? 'Thread',
      status: 'regular',
      selectedBranchId: 'branch-main',
      revision: 1,
      createdAtMs: now,
      updatedAtMs: now,
    }
  }
  const branch = (threadId: string) => ({
    schema: 'theorem.chat.branch.v1',
    branchId: 'branch-main',
    tenantId: 'story',
    threadId,
    createdAtMs: now,
  })
  const rootSpace = canvasSpaceFixture('project-theorem')
  const nestedSpace = nestedSpaceFixture(rootSpace.space.id)
  const spaces = new Map([
    [rootSpace.space.id, rootSpace],
    [nestedSpace.space.id, nestedSpace],
  ])
  // Notes and uploads a scripted story writes stay readable for its life.
  const notes = new Map(Object.entries(documentFixtures))
  const uploads = new Map<string, Response>()
  const snapshot = (documentId: string) => {
    const markdown = notes.get(documentId)
    return markdown === undefined
      ? undefined
      : documentSnapshot(documentId, markdown, now)
  }
  const missing = () => new Response(null, { status: 404 })
  const bump = (next: Partial<Review>) => {
    review = { ...review, ...next, revision: review.revision + 1 }
    return review
  }
  return {
    [`GET ${BASE}/bootstrap`]: () => ({
      schema: 'theorem.chat.bootstrap.v1',
      tenantId: 'story',
      csrfToken: 'story',
      principalId: 'story',
      projects: { items: projects },
      uploadLimits: { maxCount: 10, maxTotalBytes: 256 * 1024 * 1024 },
    }),
    [`GET ${BASE}/projects`]: () => ({ items: projects }),
    [`GET ${BASE}/projects/:projectId/threads`]: ({ projectId }) => ({
      items: organization.threads
        .filter((thread) => thread.homeProjectId === projectId)
        .map((thread) => threadOf(thread.threadId)),
    }),
    [`GET ${BASE}/threads/:threadId`]: ({ threadId = '' }) => ({
      thread: threadOf(threadId),
      project: projects[0],
      branches: [branch(threadId)],
      selectedBranch: branch(threadId),
      messages: threadId === 'thread-app-gallery' ? threadMessages(now) : [],
    }),
    [`GET /api/documents/v2/documents`]: () => ({
      documents: [...notes.keys()].map((id) => snapshot(id)?.summary),
    }),
    [`POST /api/documents/v2/documents`]: async (_, request) => {
      const documentId = `doc-new-${notes.size}`
      notes.set(documentId, await writtenMarkdown(request))
      return { document: snapshot(documentId)?.summary }
    },
    [`GET /api/documents/v2/documents/:documentId`]: ({ documentId = '' }) =>
      snapshot(decodeURIComponent(documentId)) ?? missing(),
    [`PUT /api/documents/v2/documents/:documentId`]: async ({ documentId = '' }, request) => {
      const id = decodeURIComponent(documentId)
      notes.set(id, await writtenMarkdown(request))
      return { document: snapshot(id)?.summary }
    },
    [`GET /api/spaces/v1/:spaceId`]: ({ spaceId = '' }) =>
      spaces.get(decodeURIComponent(spaceId)) ?? missing(),
    [`PUT /api/spaces/v1/:spaceId`]: async ({ spaceId = '' }, request) => {
      const body = (await request.json()) as Theorem.SpaceRecord
      const saved = { ...body, revision: body.revision + 1 }
      spaces.set(decodeURIComponent(spaceId), saved)
      return saved
    },
    [`POST ${BASE}/projects/:projectId/uploads`]: async (_, request) => {
      const uploadId = `upload-new-${uploads.size}`
      uploads.set(
        uploadId,
        new Response(await request.arrayBuffer(), {
          headers: { 'content-type': request.headers.get('content-type') ?? '' },
        }),
      )
      return { record: { uploadId, state: 'ready' } }
    },
    [`GET ${BASE}/uploads/:uploadId/content`]: async ({ uploadId = '' }) => {
      const written = uploads.get(uploadId)
      if (written) return written.clone()
      const upload = uploadFixtures[uploadId]
      if (!upload) return missing()
      const bytes = await (await fetch(upload.url)).arrayBuffer()
      return new Response(bytes, { headers: { 'content-type': upload.mime } })
    },
    [`POST ${BASE}/uploads/:uploadId/retain`]: () => ({ retained: true }),
    [`GET ${BASE}/organization`]: () => organization,
    [`GET ${BASE}/librarian/history`]: () => ({
      items: organization.librarian.recent,
    }),
    [`GET ${BASE}/projects/:projectId/outputs`]: () => ({
      items: [
        { outputId: 'output-1', kind: 'app', title: 'Gallery prototype', threadId: 'thread-app-gallery', revisionCount: 3, updatedAtMs: now - 20 * 60_000 },
        { outputId: 'output-2', kind: 'artifact', title: 'SDK surface', threadId: 'thread-python-sdk', revisionCount: 2, updatedAtMs: now - 40 * 60_000 },
        { outputId: 'output-3', kind: 'review', title: 'App gallery', threadId: 'thread-app-gallery', reviewId: review.reviewId, revisionCount: 1, updatedAtMs: now - 8 * 60_000 },
      ],
      total: 5,
    }),
    [`GET ${BASE}/threads/:threadId/reviews`]: ({ threadId }) => ({
      items: !options.reviewless && threadId === review.threadId ? [review] : [],
    }),
    [`GET ${BASE}/reviews/:reviewId`]: () => review,
    [`POST ${BASE}/reviews/:reviewId/open`]: () => bump({ openedAtMs: Date.now() }),
    [`POST ${BASE}/reviews/:reviewId/close`]: () => bump({ closedAtMs: Date.now() }),
    [`PUT ${BASE}/reviews/:reviewId/draft`]: async (_, request) =>
      bump({ draft: (await request.json()) as ReviewResponse }),
    [`POST ${BASE}/reviews/:reviewId/submit`]: async (_, request) =>
      bump({
        status: 'answered',
        answer: {
          ...((await request.json()) as ReviewResponse),
          submittedAtMs: Date.now(),
          messageId: 'message-reply',
        },
      }),
    [`POST ${BASE}/reviews/:reviewId/cancel`]: () => bump({ status: 'cancelled' }),
    [`GET ${BASE}/reviews/:reviewId/shots/:shotId/content`]: ({ shotId = '' }) =>
      new Response(reviewShots[shotId], {
        headers: { 'content-type': 'image/svg+xml' },
      }),
  }
}
