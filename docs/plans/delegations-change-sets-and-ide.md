# Delegations, change sets and the IDE: contract and plan

Theorem's front role already delegates work to specialist roles, runs
them in isolated overlays, collects receipts and reviews the result. The Theorem
UI shows almost none of it: a delegation is a generic `delegate` tool card, and
what a specialist changed cannot be seen as a diff in the chat or in Theia. This
plan adds the wire contract that exposes those records, the chat surfaces that
show them, and the Theia side: Theia AI's chat and change sets in IDE mode, with
Monaco's diff editor for review.

The backend part is specified for Theorem in
`.harness/specs/SPEC-DELEGATION-REVIEW-WIRE-1.0.md` on the Theorem branch
`claude/delegation-review-wire` (based on PR 898). That spec and this plan
describe the same contract; if they disagree, fix both.

## What exists, verified on 2026-10-28

Against SDK `0.6.0-alpha.1`, PR 898's head `717ab194a`
(`Travis-Gilbert/sdk-foundation-20261025`, open). The UI still vendors SDK 0.4.0.

- **Threads have no links to each other.** `Thread` and `Branch` are unchanged
  from 0.4: a branch has `parentBranchId` and `forkedAfterMessageId`, a thread
  has neither a parent nor an origin. `src/lib/theorem/thread-tree.ts` nests a
  thread's branches under it for that reason.
- **Delegation is a durable record in Theorem.** `DelegationRecord`
  (`theorem-harness-core/src/intent_contract.rs`) has `parent_run_id`,
  `child_run_id`, the intent revision, roles, model, the `WorkContract`
  (objective, file scope, criteria, checks, non-goals), a lifecycle
  (`proposed`, `admitted`, `started`, `published`, `failed`, `cancelled`,
  `stale`, `reviewed`, `refused`) with history, and the review verdict.
  Specialists publish an `ImplementationReceipt` with observed and reported
  work; the front role decides a `ReviewDecision` with per-delegation verdicts
  and per-file admissions (SPEC-AGENT-THEOREM-2.0 D11 to D13, sections 10 and
  11).
- **The chat gets them as untyped tool parts.** `publish_activity`
  (`rustyred-thg-server/src/theorem_agent_stream/organization_runtime.rs:625`)
  emits a `tool_call` named `delegate` with the work contract in
  `safeArguments`, and a `tool_result` whose `safeOutput` is the receipt
  (`kind: implementation_receipt`, snake_case). Review decisions and intent
  contracts are `tool_result` parts whose `toolCallId` matches no tool call.
  The SDK adapter turns all three into tool-call parts, so the UI renders them
  with the generic tool card. The adapter also drops the `messages` the
  delegate part carries, so the task-group path in `thread.aui.tsx` never runs
  for them.
- **The receipt's diff is not a diff.** `observe_changes` stores the changed
  file's new bytes under `diff_ref`, though `ObservedChange` documents it as a
  unified diff. The base content is kept only as `before_hash`. Nothing in the
  OpenAPI document reads a stored object by its ref.
- **Delegation records are readable but not in the SDK.**
  `GET /v1/theorem/runs/{runId}/delegations` and
  `GET /v1/theorem/intents/{intentId}/review` exist and are missing from
  `fern/openapi.json`.
- **Admitted changes bypass the document authority.** `apply_admission` writes
  admitted files with `std::fs::write`. Theia sees them through the checkout
  watcher as `reconcile` revisions with no run. `IdeRevisionRecord.actor` is a
  free string (`"agent"`, `"agent:codex"` in tests), with no run id anywhere.
- **Child runs may already be tailable.** `GET /api/chat/v1/runs/{runId}/events`
  tails any run; `run_visible_to_owner` scopes a run without a thread to its
  tenant. Whether a specialist's child run carries a thread is unchecked.
- **Context references exist.** `SendMessage.contextReferences` takes the SDK's
  `TheoremContextReference`, whose `TheoremResource` has `file`, `artifact`,
  `message`, `run` and `graph-object`.
- **Theia AI can run browser-only.** `@theia/ai-core`, `ai-core-ui` and `ai-mcp`
  1.76.0 are already in the IDE build as dependencies of `@theia/plugin-ext`.
  `@theia/ai-chat` 1.76.0 makes no backend calls of its own (its backend module
  only registers preferences), and its `ChangeSetElement` is an interface with
  optional `open`, `openChange`, `apply` and `revert`. ai-core's language-model
  proxies point at a backend the IDE does not have; they already load today.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| What a delegation is in the UI | A record shown inside the one conversation, with a card in the transcript and a panel for detail. Not a child thread with its own chat. | Theorem already models delegation as `DelegationRecord`, with lifecycle, receipt and review. SPEC-AGENT-THEOREM-2.0 D20 says the transcript shows one agent and specialist work appears as expandable work and receipt surfaces. A chat with each specialist would also bypass the front role's supervision (D3, D13). |
| Steering delegated work | Ask the front role about a delegation or a change. "Ask about this" puts a `delegation` or `delegation-change` context reference in the composer. The front can correct, re-delegate or revise the intent. | Keeps the reviewer in the loop and needs only new reference kinds, not a message channel into a running specialist. |
| Thread links | `Thread.origin` for threads a person forks or continues from another thread. Delegations are not thread links. | The only relationships the backend lacks are the ones people make. Delegation, receipt and review already have records. |
| Who accepts a change | The reviewer role, as now. The UI shows each file's admission state. A person override is not in this plan. | The overlay holds generated work until review (spec 18.4). An override is a product decision of its own; see Open decisions. |
| Diffs in the chat | `@pierre/diffs`, from the before and after content of each changed file. | Built on Shiki, which the chat already uses for code. Renders and virtualizes large diffs. Hand-rolling a diff view is what the library exists to avoid. |
| Diffs in the IDE | Monaco's diff editor, opened from Theia AI change-set elements over a read-only `theorem-delegation` scheme. | Theia already ships the diff editor and the change-set UI; the scheme is the only new seam. |
| The conversation in IDE mode | Theia AI's chat view (`@theia/ai-chat`, `@theia/ai-chat-ui`) with a Theorem chat agent bound to the thread the Theorem UI shows. Delegations become Theia change sets. | IDE mode covers the conversation today. Theia AI puts it in Theia's layout next to the editors and brings change sets with diff opening. The cost is a second renderer for Theorem parts; the IDE one shows text, reasoning, tool calls, approvals and change sets, and links artifacts to the Theorem UI. |
| Run attribution | Admitted writes go through the document authority with `actor` `theorem:run:<childRunId>` and `provenance` `delegation:<delegationId>`. Writes by a front or solo run use `theorem:run:<runId>` and `run`. | Without it, nothing in the workspace says which run changed a file. Follow the Agent can then follow document events instead of parsing tool arguments. |

## Wire contract

Field names are camelCase, as in the rest of the chat API. Types are the
OpenAPI schemas to add to `packages/theorem-sdk/fern/openapi.json`; Fern
generates the SDK types from them.

### Message parts

Three new part types. The SDK adapter already turns an unknown part type `x`
into a data part named `theorem-x`, so these reach the UI as
`theorem-delegation`, `theorem-review` and `theorem-intent` with no adapter
change. Each keeps one `partId` for its record, so a later state replaces the
part in place. They replace the `delegate` tool-call and tool-result pair and
the orphan `tool_result` parts in the chat. The front role's own tool results,
which only the model reads, do not change.

```ts
type DelegationState =
  | 'proposed' | 'admitted' | 'started' | 'published' | 'failed'
  | 'cancelled' | 'stale' | 'reviewed' | 'refused'

type ReviewVerdict =
  | 'accept' | 'reject' | 'correct' | 'request_verification'
  | 'request_clarification' | 'revise_intent' | 'close_incomplete'

type ChangeAdmission =
  | { state: 'pending' }
  | { state: 'admitted' }
  | { state: 'conflict'; detail: string }
  | { state: 'out_of_scope' }
  | { state: 'refused'; detail: string }
  | { state: 'direct' }

interface DelegationPart {
  delegationId: string
  parentRunId: string
  childRunId: string
  roleId: string
  roleLabel: string
  /** Qualified model id, e.g. "openrouter/minimax/minimax-m3". */
  model: string
  state: DelegationState
  objective: string
  fileScope: string[]
  criteria: string[]
  intent: { intentId: string; revision: number }
  /** Present once the specialist publishes. */
  receipt?: ReceiptSummary
  verdict?: ReviewVerdict
  reviewId?: string
  /** Why it failed, was refused or went stale. */
  problem?: string
  updatedAtMs: number
}

interface ReceiptSummary {
  terminal:
    | { kind: 'completed' }
    | { kind: 'failed'; code: string; message: string }
    | { kind: 'cancelled' }
    | { kind: 'interrupted'; lastHostCall: string }
  changes: ChangeSetEntry[]
  checks: {
    checkId: string
    argv: string[]
    status: 'passed' | 'failed' | 'not_run' | 'timed_out'
    exitCode?: number
    outputRef?: string
  }[]
  commandCount: number
  reported: {
    summary: string
    completedCriteria: string[]
    skipped: { requirement: string; reason: string }[]
    deviations: string[]
    assumptions: string[]
    unresolved: string[]
  }
  usage?: {
    promptTokens?: number
    completionTokens?: number
    reasoningTokens?: number
    /** From catalog pricing, when the catalog prices the model. */
    costMicrounits?: number
  }
  contentHash: string
}

interface ChangeSetEntry {
  path: string
  change: 'add' | 'modify' | 'delete'
  /** The overlay base's bytes; absent for an added file. */
  beforeRef?: string
  /** The specialist's bytes; absent for a deleted file. */
  afterRef?: string
  /** A unified diff of the two, when the content is text. */
  diffRef?: string
  linesAdded?: number
  linesRemoved?: number
  binary: boolean
  admission: ChangeAdmission
}

interface ReviewPart {
  reviewId: string
  intent: { intentId: string; revision: number }
  intentOutcome: 'accepted' | 'remains_open' | 'closed_incomplete'
  verdicts: { delegationId: string; verdict: ReviewVerdict; rationale: string }[]
  admissions: { delegationId: string; path: string; admission: ChangeAdmission }[]
  summary: string
  reviewerRole: string
  decidedAtMs: number
}

interface IntentPart {
  intentId: string
  revision: number
  status: 'open' | 'accepted' | 'superseded' | 'closed_incomplete'
  goal: string
  successCriteria: { id: string; text: string }[]
  nonGoals: { id: string; text: string; protectedPaths: string[] }[]
  constraints: string[]
  /** The revision this one replaced. */
  supersedes?: number
}
```

### Routes

- `GET /api/chat/v1/runs/{runId}/delegations` returns
  `{ runId, delegations: DelegationPart[] }`, the delegations whose
  `parentRunId` is `runId`, with their receipts. Authorized like
  `chat_run_events`: the parent run must be visible to the caller. It replaces
  `/v1/theorem/runs/{runId}/delegations`.
- `GET /api/chat/v1/runs/{runId}/delegations/{delegationId}/content?ref={ref}`
  returns the stored bytes for a ref named in that delegation's receipt
  (`beforeRef`, `afterRef`, `diffRef`, or a check's `outputRef`), with
  `Content-Type` from the file name and `ETag` the ref. Any other ref is 404.
- `GET /api/chat/v1/intents/{intentId}/review` returns
  `{ packet, reviews: ReviewPart[] }`, replacing
  `/v1/theorem/intents/{intentId}/review`.
- `GET /api/chat/v1/runs/{childRunId}/events` must be readable by whoever can
  read the parent run, so the UI can show a specialist's live activity.

### Receipts

`observe_changes` stores the base bytes at the overlay's creation as
`beforeRef`, the new bytes as `afterRef`, and a unified diff as `diffRef` for
text files. `binary` is true when either side is not UTF-8. The Rust
`ObservedChange` gains `before_ref` and `after_ref`; `diff_ref` then holds a
diff, as documented.

### Attribution

Amended 2026-10-28. The first version assumed a chat workspace already had a
document authority and that one transaction could carry one actor. Neither
holds: the authority's commit has one actor and provenance for all its
documents, a review can admit delegations from several child runs, and native
chat writes the local disk through `RecordingHostFs`. A workspace id is not a
grant to a remote IDE host. So:

1. **A chat workspace binds to the IDE host that owns its document authority**,
   through an existing host grant. Without a binding, writes go to disk as now.
2. **Authority transactions carry `actor` and `provenance` per document**,
   covering creates, deletes and binary files. A transaction keeps one
   identity and stays atomic.
3. **Admissions write through the bound authority**, one transaction per review
   decision with `transaction_id` the review id. Each document carries `actor`
   `theorem:run:<childRunId>` and `provenance` `delegation:<delegationId>`.
4. **Front and solo runs' workspace-tool writes** go through the bound authority
   with `theorem:run:<runId>` and provenance `run`.
5. **Tests**: atomicity across documents with different actors, attribution on
   the live stream's `document.changed`, refusal without a grant, and the disk
   fallback.

No transaction per delegation and no attribution added after the fact.

### Context references

`TheoremResource` gains two kinds:

```ts
| { kind: 'delegation'; runId: string; delegationId: string }
| { kind: 'delegation-change'; runId: string; delegationId: string; path: string; side: 'before' | 'after' }
```

A `TheoremLocation` on a `delegation-change` may carry a `range` (lines of that
side). The front turn's context assembly resolves both: the receipt summary for
a delegation; the path, the hunk around the range and the admission for a
change. `resourceKey` and `isTheoremResource` cover them.

### Thread origins

```ts
type ThreadOrigin =
  | { kind: 'forked'; threadId: string; branchId: string; messageId: string }
  | { kind: 'continued'; threadId: string }
```

`Thread.origin?: ThreadOrigin`. `chat.threads.create` accepts `origin`. A
`forked` thread starts with the source branch's history up to and including
`messageId` as its root branch, and the source thread is unchanged. A
`continued` thread starts empty, with the source thread available as context.
`ListThreadsRequest` accepts `originThreadId`, and `ThreadPage` items carry
`origin`.

### IDE bridge

Additions to `ide/theia-extensions/theorem-workspace/src/common/ide-bridge.ts`:

```ts
// IdeFrameMethods
/** Open the diff of one change, or of every change in the delegation. */
openChanges(target: { runId: string; delegationId: string; path?: string }): Promise<boolean>
/** The thread the Theorem UI shows, for Theia's chat; null for a new chat. */
setThread(threadId: string | null): void
```

`addToChat` already carries a `TheoremContextReference`, so "Ask about this
change" in Theia sends a `delegation-change` reference through it.

The `theorem-delegation` scheme names one side of one change:
`theorem-delegation:/<runId>/<delegationId>/<before|after>/<path>`. Its
read-only `FileSystemProvider` reads the content route.

## Phases

### Phase 1: contract (Theorem, Codex)

1. Typed `delegation`, `review` and `intent` parts in place of the tool-part
   pairs, with schemas in `openapi.json`.
2. Before and after refs and a real diff in receipts.
3. The delegations, content and review routes under `/api/chat/v1`, in
   `openapi.json`; child run events readable by the parent's reader.
4. Admissions and run writes attributed through the document authority.
5. The two context reference kinds, resolved in front-turn context assembly.
6. `Thread.origin`, origin on create, the list filter.
7. Regenerate the TypeScript SDK and publish a tarball for the UI.

### Phase 2: chat surfaces (Theorem UI)

1. Vendor the new SDK and move the UI from 0.4.0 to it.
2. Delegation card: role, objective, live state, criteria, checks, changed
   files with admission, an expandable diff per file, Open in IDE, Ask about
   this.
3. Review card and intent card.
4. "Ask about this" adds the reference to the composer.

### Phase 3: review in the IDE (Theorem UI, Theia)

1. The `theorem-delegation` file system provider.
2. `openChanges` and `setThread` on the bridge.
3. Delegation panel in the dock: the full receipt, check output, and the
   child run's live events.

### Phase 4: Theia AI (Theia)

1. Add `@theia/ai-chat` and `@theia/ai-chat-ui` 1.76.0 to
   `applications/browser`, and leave out Theia's own agents and model
   providers.
2. A Theorem chat agent that sends and streams through the SDK on the thread
   from `setThread`, rendering text, reasoning, tool calls and approvals.
3. Delegation parts as a change set per delegation, with a
   `ChangeSetElement` whose `openChange` opens the diff over
   `theorem-delegation`, `open` reveals the file, and state follows admission
   (`pending`, `admitted` as `applied`, `conflict` and `refused` as `stale`
   with the detail). No `apply` or `revert` while admission belongs to the
   reviewer.
4. Follow the Agent follows `document.changed` events whose actor is the active
   run or one of its delegations' child runs, instead of tool-call arguments.
   The frame already holds the workspace's live stream, so the Theorem UI tells
   it which runs to follow and the frame reveals their edits.

### Phase 5: thread origins (Theorem UI)

1. "Fork into new thread" and "Continue in new thread" on messages and threads.
2. The sidebar nests origin children under their source, beside branches.

## Open decisions

- **A person override of admissions.** Should a person be able to admit or
  refuse a file the reviewer decided? It would need a Theorem operation and a
  record of who overrode what. With it, the Theia change-set elements get
  `apply` and `revert`.
- **Theia AI or a split layout.** If ai-core's backend proxies break the chat
  view browser-only, IDE mode shows the Theorem UI's conversation beside the
  frame instead, and Phase 4 is replaced by that layout change.
- **PR 898's base.** The contract branch builds on PR 898's head, which has two
  open P1 review findings. It rebases when PR 898 lands.
