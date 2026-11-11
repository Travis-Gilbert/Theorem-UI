# Thread organization, reviews and media: the wire contract

Theorem UI codes to this; Theorem implements it. Theorem plan `plan:7aae4cc673fd6f49`.

Translated from `mikecann/threadbear@78b77e1dd5644dd0875f5ab49bc6912e171fcc05` (MIT, Mike Cann): `docs/projects-design.md`, `docs/options-review-design/README.md`, `runner/src/{librarian,projects,reviews,highlights}.ts`, `runner/src/runner/reviews.ts`.

## Ownership

| What | Owner |
| --- | --- |
| Project identity, membership, evidence | Theorem graph |
| Librarian scheduling and model calls | Theorem harness, through the model catalog |
| Review state | Theorem backend |
| Web panels, local pane arrangement | Theorem UI |

## Shared rules

All routes sit under `/api/chat/v1`, with the auth, CSRF and `Idempotency-Key` handling chat routes already use. Bodies are camelCase JSON. Refusals use the existing problem body with statuses 400, 404, 409 (revision or state conflict), 415. Times are `…AtMs` integers.

Actors are `"user" | "agent" | "librarian"`.

## Organization

### `GET /organization`

The whole sidebar in one read, tenant-wide. Sidebar order must not depend on activity, so projects sort by title and threads inside a project by `createdAtMs` descending. Archived and deleted threads are left out.

```ts
type Organization = {
  schema: 'theorem-organization/1'
  projects: ProjectEntry[]
  threads: ThreadEntry[]
  librarian: LibrarianStatus
}
type ProjectEntry = {
  projectId: string
  title: string
  /** The tenant's default home for new threads. The tree does not show it as a project. */
  isInbox: boolean
  createdBy: Actor
  threadCount: number      // live memberships
  outputCount: number      // see outputs below
  state?: { text: string; atMs: number; by: Actor } // a few plain sentences about where the project stands
  brief: boolean           // true when instructions or state would go into a member thread's context
  /** What the work is about, chosen by the Librarian when it creates the project. See Glyphs. */
  glyph?: string
}
type ThreadEntry = {
  threadId: string
  title: string
  homeProjectId: string
  revision: number
  createdAtMs: number
  lastMessageAtMs?: number
  /** Thread.origin as stored: the sidebar nests forks and continuations under their source. */
  origin?: ThreadOrigin
  memberships: Membership[] // live only
  summary?: { text: string; atMs: number; by: Actor } // two or three short lines
  attention: Attention
  later?: Later
  /** What the work is about, chosen by the Librarian with its summary. See Glyphs. */
  glyph?: string
}
type Membership = {
  projectId: string
  by: Actor
  pinned: boolean
  why: string
  atMs: number
  /** Comes from homeProjectId rather than a stored record. */
  implicit?: boolean
}
type Attention = {
  /** Non-empty puts the thread in Attention Worthy. */
  reasons: AttentionReason[]
  /** A run is active on the authority. Puts the thread in Running. */
  running: boolean
  runId?: string
}
type AttentionReason =
  | { kind: 'review'; reviewId: string; title: string; optionCount: number; atMs: number }
  | { kind: 'approval'; runId: string; approvalId: string; toolName: string; atMs: number }
  | { kind: 'failed'; runId: string; atMs: number }
  | { kind: 'pending_turn'; messageId: string; atMs: number }
```

**Implicit membership.** A thread whose `homeProjectId` is not the inbox is a member of that project unless a `removed` record says otherwise. A thread with no live membership is Unsorted.

**Attention comes from real state only**: open review records, run approvals from durable run events, `lastRun.outcome` for failures and `pendingTurn`, never model output. `failed` clears once `POST /threads/:id/seen` records a time after the run ended.

**Inbox.** The project with `provenance: "inbox"`, else the tenant's oldest non-deleted project.

**Glyphs.** One of `layout`, `code`, `stack`, `graph`, `doc`, `data`, `image`, `terminal`, `bug`, `research`, `map`, `chat`. Anything else a model answers is dropped, so a bad answer leaves it absent, and the UI falls back to a default icon. Only the Librarian sets one; no route changes it.

### `POST /threads/:threadId/placement`

The one way membership changes. `by` comes from the caller, so this route is always `user`; the Librarian and the agent tool call the same core with their own actor.

```ts
body: { add?: string[]; remove?: string[]; pin?: string[]; unpin?: string[]; why?: string }
returns: { thread: ThreadEntry; event: OrganizeEvent | null; events: OrganizeEvent[]; receipt: Receipt }
```

`event` is the first of `events`, and `null` when nothing changed. A request that adds and removes writes one event per change.

Rules, enforced in the membership core and not in a prompt:

- `user` or `agent` adding: pinned, and clears a `removed` record.
- `user` or `agent` removing: leaves a `removed` record.
- `librarian` adding: refused for a project with a `removed` record, and needs a non-empty `why`.
- `librarian` removing: only its own unpinned memberships, and needs a non-empty `why`.
- Leaving a project out of a Librarian answer changes nothing. Only an explicit `leave` does.

### `POST /threads/:threadId/seen`, `PUT` and `DELETE /threads/:threadId/later`

```ts
type Later = {
  condition: { kind: 'time'; atMs: number } | { kind: 'thread'; threadId: string; event: 'run_ended' }
  note?: string
  setAtMs: number
  by: Actor
}
```

`seen` returns `{ thread: ThreadEntry }`. `PUT` body is `{ condition, note? }`; `DELETE` wakes; both return `{ thread: ThreadEntry; event: OrganizeEvent | null }`. The tick clears a met condition and records a `woke` event. A thread with `later` set shows in Later. If it also has attention reasons, it shows in Attention Worthy too, since a review does not wait. Semantic conditions wait for a later Librarian scope.

### `PATCH /projects/:projectId/state`

Body `{ text: string }`, or `{ text: null }` to hand it back. A `user` state is not overwritten by the Librarian until it is handed back. Returns `{ project: ProjectEntry }`.

### `GET /projects/:projectId/outputs`

Files and artifact revisions, kept out of the conversation tree. Latest revision per artifact across the project's member threads.

```ts
{ items: Array<{ outputId: string; kind: 'app' | 'artifact' | 'upload' | 'review'; title: string;
    threadId: string; artifactId?: string; revision?: unknown; revisionCount: number;
    updatedAtMs: number; documentId?: string; uploadId?: string; reviewId?: string }>;
  total: number }
```

## The Librarian

An event-driven background role with bounded input and structured output. The queue and its cursors are durable, so a restart loses nothing.

**When it looks.**

| Trigger | Wait |
| --- | --- |
| A thread's first message | settle a few seconds |
| A completed turn (`activeRunId` clears, new messages) | settle about 10s, then gated |
| A moved thread (`homeProjectId` or placement changed) | settle a few seconds |
| A new repo in a thread's work, where Theorem can see one | settle a few seconds |

A completed turn is gated: at most one look about every 20 minutes per thread, and fewer than about 400 new characters skips the model and records nothing.

**What it reads.** Project list (title, first lines of instructions, one line of state), thread title, first message, last few messages, each clipped. Input has a fixed character ceiling.

**What it answers.** JSON, asked for in the prompt and parsed tolerantly, as Threadbear does. Strict structured output cannot express the maps below, so no schema is sent. An answer that is not JSON counts as a look and is not retried.

```ts
{ projects: string[], reasons: Record<string, string>, leave: Record<string, string>,
  new: null | { title: string, goal: string, why: string, state?: string, glyph?: string },
  state: Record<string, string>, thread: string, why: string, glyph?: string }
```

Projects are named by id. `glyph` is the thread's; `new.glyph` is the new project's.

A pick with no reason is dropped. A reason is under 12 plain words about this thread. An empty answer is right far more often than a guess. Never put a thread back where it was removed.

**Model.** A small model from Theorem's catalog, named `provider/model` per job. One look answers both jobs, on the membership job's model, or the summary job's when membership is off. No model or no key puts the Librarian in `off` with a plain reason, and the queue waits. A model the catalog does not have is a 400 on `PATCH`; one whose key is not set yet is accepted and reads as `off`.

### `GET /librarian`, `PATCH /librarian`, `GET /librarian/history`, `POST /librarian/events/:eventId/undo`

```ts
type LibrarianStatus = {
  state: 'idle' | 'working' | 'paused' | 'off'
  paused: boolean
  offReason?: string
  jobs: { membership: { enabled: boolean; model?: string }; summary: { enabled: boolean; model?: string } }
  queued: number
  /** The last look that failed, until one succeeds. */
  lastFailure?: { atMs: number; reason: string }
  /** The last time a look reached a model. */
  lastCallAtMs?: number
  /** Newest first, at most 20. */
  recent: OrganizeEvent[]
}
type OrganizeEvent = {
  eventId: string
  atMs: number
  actor: Actor
  kind: 'joined' | 'left' | 'project_created' | 'state_updated' | 'thread_summarized'
      | 'set_later' | 'woke' | 'undone'
  threadId?: string; threadTitle?: string
  projectId?: string; projectTitle?: string
  /** One plain line the sidebar can show as is: "Filed Python SDK in Theorem". */
  text: string
  /** The reason, in plain words. */
  why: string
  trigger?: 'first_message' | 'turn_completed' | 'moved' | 'new_repo' | 'catch_up' | 'placement'
  /** Stays when organization changes: provenance is never rewritten. */
  evidence?: { messageIds: string[]; inputChars: number; model?: string }
  reversible: boolean
  undoneByEventId?: string
}
```

`PATCH` takes `{ paused?, jobs? }` and returns `LibrarianStatus`. `history` takes `threadId`, `projectId`, `cursor`, `limit` and returns `{ items: OrganizeEvent[]; nextCursor?: string }`. `undo` returns `{ thread: ThreadEntry | null; event: OrganizeEvent; original: OrganizeEvent; reused: boolean }`. **Undo** reverses the event's placement, records the correction (a removal for a `joined`, a pinned membership for a `left`), appends an `undone` event, and is idempotent.

**Project brief in context.** At turn start every member project's title, instructions and state go into context, bounded to about 2000 characters across projects. Membership grants relevance and no authority: capability checks are unchanged.

## Reviews

A durable comparison the agent asks for and a person answers.

```ts
type Review = {
  schema: 'theorem-review/1'
  reviewId: string
  threadId: string
  runId?: string
  messageId?: string
  title: string
  note?: string
  status: 'open' | 'answered' | 'cancelled'
  revision: number
  createdAtMs: number
  openedAtMs?: number
  closedAtMs?: number
  options: ReviewOption[]
  draft?: ReviewResponse
  answer?: ReviewResponse & { submittedAtMs: number; messageId: string }
}
type ReviewOption = {
  id: string        // stable, unique in the review
  title: string
  note?: string
  /** Context a person can look at but not pick. */
  reference?: boolean
  /** The thing being compared against. */
  baseline?: boolean
  /** Live preview. Shots stay the record of what was shown. */
  url?: string
  shots: ReviewShot[]
}
type ReviewShot = {
  shotId: string
  title?: string
  mime: string
  width?: number
  height?: number
  sha256: string
  /** The version this was taken from. */
  source: { uploadId: string } | { artifactId: string; artifactRevision: unknown; documentId?: string }
}
type ReviewResponse = {
  pickedIds: string[]
  none: boolean
  reply?: string
  /** A preference, a test result and a bug report are different kinds of evidence. */
  observations: Array<{ kind: 'preference' | 'test_result' | 'bug_report'; optionId?: string; text: string }>
}
```

| Route | What it does |
| --- | --- |
| `POST /threads/:threadId/reviews` | Create. Every option carries at least one shot: `shots: [{ title?, uploadId }]` or `{ title?, artifactId, artifactRevision }`. Bytes are snapshotted now, so later edits change nothing. Returns the `Review` plus `receipt`, 201. |
| `GET /threads/:threadId/reviews` | `{ items: Review[] }`, newest first |
| `GET /reviews/:reviewId` | One review |
| `POST /reviews/:reviewId/open`, `/close` | Stamp the time. They never submit, and the draft stays. |
| `PUT /reviews/:reviewId/draft` | `If-Match: <revision>`, body `ReviewResponse`. A page going away leaves `If-Match` out, and its words win. |
| `POST /reviews/:reviewId/submit` | Body `ReviewResponse`, plus the run options a send takes (`model` and so on), `Idempotency-Key` required. Returns the `Review` plus the fields below. |
| `POST /reviews/:reviewId/cancel` | Closes it without messaging the agent |
| `GET /reviews/:reviewId/shots/:shotId/content` | The snapshot's bytes, with `Range` |

**Submit** writes the answer and the queued reply in one atomic batch: the review becomes `answered`, one user message lands in the thread, and the thread's pending turn is queued and woken exactly once. A replay of the same key returns the same result. Another key on an answered review is a 409.

The message reads:

```
Review: your options "<title>" are answered. The review is closed.

Picked <title> + <title>.      or: Picked none of them.

<reply>

Preference on <title>: <text>
Test result on <title>: <text>
Bug on <title>: <text>
```

It also carries a structured `review_answer` part with the review id and response, so several outstanding reviews stay unambiguous.

**The submit response** is the `Review` at the top level, with beside it:

```ts
{ message: ChatMessage; receipt: Receipt; threadRevision: number;
  /** Waiting on a live run. The server starts it when the thread is free. */
  queued: boolean;
  run: ChatRun | null;
  /** The run could not start yet, and the server keeps trying. */
  runStartError?: string }
```

Open, close, draft and cancel return the `Review` at the top level.

**Validation** follows Threadbear's `reviewInput` and `reviewDraft`: 1 to 12 options, stable unique ids, at most 8 shots per option and 40 in all, a reference cannot be picked, picks and none are exclusive, and an empty submission is refused.

**The agent tools.** `show_options({ title, note?, options })` creates a review and returns `{ reviewId, message }` at once, so the run can end instead of holding open. The answer arrives as a later message. `place_thread({ add?, remove?, why? })` files the thread by project name or id, as actor `agent`.

## Media

For canvas notes and review shots.

- `POST /projects/:id/uploads` also admits `application/pdf`, `audio/{mpeg,wav,ogg,mp4,webm,flac}` and `video/{mp4,webm,quicktime}`, checked by magic bytes, with a media size limit and tenant quota that are deployment config. Media skips text extraction.
- `GET /uploads/:uploadId/content` serves the bytes with `Content-Type`, `ETag` and `Range`, to the upload's owner.
- `POST /uploads/:uploadId/retain` keeps an upload past the 24-hour purge, using the existing Library retention.

## What waits

- Contextual panels and actions, and native GPUI: 4 and 5 in the direction's priority order.
- Semantic Later conditions, and Librarian jobs past membership and summaries (retitling, links, notes tidying).
