# Theia on Theorem: integration plan

Theia becomes the editing surface of the Theorem UI. Theorem owns documents,
execution, terminals and agent activity. Theia runs browser-only and reaches
Theorem through `@theoremharness/sdk`. Nothing runs in a Theia Node backend.

## What exists, verified on 2026-10-22

- **SDK 0.3.0 source is not on any branch.** `packages/theorem-sdk`, the host's
  `src/http.rs` and the server's `theorem_environment.rs` were uncommitted
  files in the main Theorem checkout (branch
  `cursor/native-e2e-verification-fc4c`, PR 843's line, 212 commits off main).
  They are preserved on the local branch
  `preserve/sdk-0.3.0-source-2026-10-22`.
- **This work is based on PR 880** (`claude/native-builtin-tools`, 5 commits
  ahead of main). The environment slice is ported onto it: the IDE host, the
  IDE runtime, the IDE authority, the SDK package and the product admission
  module. The written-document store (`theorem-doc-store`, about 5,600 lines)
  is not ported; the IDE does not use it. Its host test stays out with it.
- **No change feed or push channel exists.** `documents.subscribe` and
  `workspace.subscribe` return an acknowledgement and register nothing. The
  authority keeps an ordered revision log per document only.
- **Source-document offsets are Unicode scalar offsets.** Monaco works in UTF-16
  code units, so the client converts. Diagnostics use UTF-8 byte offsets.
- **A repeated `operation_id` is refused, not replayed.** A client recovers an
  uncertain edit by finding its operation id in `documents.history`.
- **Terminals return a full snapshot on every `terminal.attach`**, with no
  offsets.
- **The product forwarder buffers responses and forwards every host route**,
  including the supervisor routes (crash a worker, bind a checkout, attach a
  debug command).

## Decisions

| Decision                      | Choice                                                                                                                                                                                                                                                                                                                                                                          | Why                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live transport                | One server-sent event stream per workspace attachment; mutations and terminal input stay HTTP POST                                                                                                                                                                                                                                                                              | Both existing proxies already pass SSE through, `Last-Event-ID` is the resume cursor, and auth and CSRF stay the same as every other environment call. The plan this replaces proposed a WebSocket; it would need upgrade handling in Nitro and in the axum forwarder for the same recovery semantics. One multiplexed stream stays inside HTTP/1.1's six-connection limit. |
| Event cursor                  | `{epoch}:{seq}`; the epoch changes when the host reopens the workspace                                                                                                                                                                                                                                                                                                          | A cursor from another epoch, or one older than the retained window, gets an explicit `resync` instead of a silent gap                                                                                                                                                                                                                                                       |
| Document events               | Read from the authority's revision records after each accepted mutation                                                                                                                                                                                                                                                                                                         | Every writer that commits through the authority is covered, with actor, provenance, operation id and edits                                                                                                                                                                                                                                                                  |
| Writers outside the authority | A checkout watcher adopts a disk change as a `reconcile` revision when the document has no unsaved edits, and reports a conflict otherwise                                                                                                                                                                                                                                      | Agent tools, formatters, git and shells write files directly                                                                                                                                                                                                                                                                                                                |
| Terminal output               | A byte log per terminal with absolute offsets, carried on the same stream as `terminal.output` frames after the client subscribes                                                                                                                                                                                                                                               | Resume from an offset; document events are sent ahead of queued output                                                                                                                                                                                                                                                                                                      |
| Shared editing                | `ot-text-unicode` transforms pending local edits against accepted remote edits                                                                                                                                                                                                                                                                                                  | It works in Unicode scalar offsets, which is the authority's unit                                                                                                                                                                                                                                                                                                           |
| Undo                          | A per-client undo stack of invertible operations, transformed against remote edits                                                                                                                                                                                                                                                                                              | Monaco's own stack would undo other actors' edits                                                                                                                                                                                                                                                                                                                           |
| Theia target                  | `browser-only` from Theia 1.76, with `FileSystemProvider`, `MonacoEditorModelFactory` and `TerminalFrontendContribution` rebound to Theorem                                                                                                                                                                                                                                     | These are the seams Theia's own browser-only modules use                                                                                                                                                                                                                                                                                                                    |
| Embedding                     | Theia's frontend is served by the Theorem UI at `/theia/` (Nitro `publicAssets`). In IDE mode it fills the sheet beside the rail; the rail's IDE button shows and hides Theia's sidebar, and Theia stays loaded behind the other modes                                                                                                                                          | Same origin, so the frame's SDK calls go through the UI's proxy, which adds the signed-in person's token; `/ide` is already the route of the UI's IDE mode                                                                                                                                                                                                                  |
| Who the UI calls Theorem as   | The signed-in person. With `THEOREM_OAUTH_CLIENT_ID` set, the UI signs people in against Theorem's OAuth server (authorization code with PKCE, `oauth4webapi`), keeps their tokens in a sealed HttpOnly cookie (`iron-session`), refreshes them before they expire, and the proxy forwards the person's access token. Without it the proxy keeps the static `THEOREM_API_TOKEN` | A static token names no principal, and the product server grants execution hosts and agent bindings to principals only. Theorem allows the UI's client `models:invoke` through a per-client `extra_scopes` entry, so other OAuth clients do not gain it                                                                                                                     |
| Bridge                        | Penpal 8 method calls over `postMessage`, typed by one contract (`ide/theia-extensions/theorem-workspace/src/common/ide-bridge.ts`)                                                                                                                                                                                                                                             | Origin-checked, promise-based calls in both directions instead of a hand-written message protocol                                                                                                                                                                                                                                                                           |
| Theia's own state             | Settings, keymaps and plugin storage live in the browser (OPFS) under a `theia-user` scheme                                                                                                                                                                                                                                                                                     | `file` names the Theorem workspace, so nothing of Theia's is written into the checkout                                                                                                                                                                                                                                                                                      |
| Follow the Agent              | On by default. Files the live run's tool calls name open in Theia's preview editor without focus; artifacts the run writes open in their panel. Moving in the IDE pauses it; the eye button beside New chat and the switch in Theia's status bar resume it                                                                                                                      | One switch for every view, so the artifact panel and the IDE behave the same                                                                                                                                                                                                                                                                                                |

## Checklist

The checklist is `theia-theorem-integration.checklist.json`. It is reviewed
against this plan at the end of each phase.

## Phases

1. **Backend and SDK alignment.** Port the environment slice onto PR 880 and
   build it.
2. **Live workspace session.** Host event log and SSE endpoint, checkout
   watcher, terminal byte log, workspace description, product streaming and
   supervisor refusal, SDK live module, Theia file system and editor model.
   Acceptance: a person types in Theia while another writer edits the same
   file through the authority and through the checkout. Both see accepted
   changes, pending input survives, conflicts are explicit, and a reconnect
   does not duplicate edits.
3. **Everyday IDE.** Terminal, one language provider, diagnostics, Git.
4. **The Theorem UI.** Dock panel, theme and navigation bridge, selection to
   chat, Follow the Agent, and one non-file target.
5. **Capabilities and extensions.** Capability search and invocation,
   debugging, testing, extension contribution mappings.

Phases 1 to 4 are done. Phase 5 builds on the live session and follows it; its
items are listed in the checklist as pending so nothing drops silently.

Phase 3 was checked in the browser against a real `theorem-ide-host --http` on
a throwaway git repository, with a small stand-in for the product server's
environment routes (bootstrap and the host credential): Source Control groups,
stage, commit, branch switch, the index-against-working-tree diff, the
dirty-diff gutter, explorer decorations, and host findings in editors and the
Problems view. Language requests reach the host and are accepted; this host
has no language server, so they answer empty (see the gaps).

On 2026-10-22 the whole chain ran for real: the product server built from
`claude/theia-sdk-live-session` on a copy of the local store, the UI's proxy,
and `theorem-ide-host --http` bound to a clone of this repository. The rail's
IDE button opened the panel beside the conversation; the explorer listed the
clone, the title bar showed its branch, and a file opened with `documents.open`,
`scm.show`, language and diagnostics calls all answering 200. This needed a
signed session token, because the static token is refused (first gap below).

Later on 2026-10-22 sign-in ran end to end against the lane server with OAuth
on and a stand-in OIDC provider: Sign in went through Theorem's authorize page,
the provider and both callbacks, and returned to the conversation. The
environment bootstrap named the person's principal (`identity:…`), the IDE
opened the person's workspace on a host bound to that principal (files, scm,
`documents.open`, language and diagnostics all answering 200), a run started
through the proxy with the person's token completed, the session survived a
server restart, an access token refreshed past its five-minute lifetime, and
Sign out returned the UI to the sign-in screen.

## Where the work is

- Theorem: branch `claude/theia-sdk-live-session` (worktree
  `theorem-worktrees/theia-sdk-live-session`), on PR 880. Host live session,
  server forwarding, SDK live, document, terminal, reference, language and scm
  modules.
- Theorem UI: this branch. The SDK is vendored as
  `vendor/theoremharness-sdk-0.4.0.tgz`; `ide/theia-extensions/theorem-workspace`
  is the Theia package; `src/components/ide` is the frame, the bridge's UI
  side and Follow the Agent.

## Known gaps, recorded as they are found

- **Resolved: the UI's server credential named no principal.** The static
  `THEOREM_API_TOKEN` carries a tenant and scopes but no user id, so the
  product server refused it execution (`environment_execution_not_granted`).
  The UI now signs people in and forwards their token (see Decisions). The
  static token remains for deployments without sign-in, with the same limit.
- **Resolved: a signed-in person could not start a run in a chat project.**
  An OAuth token admits one project, the connector's home project
  (`project:home:<hash>`), and `start_run` refused any other requested project
  (`chat_project_scope_refused`), so a run for a `chatproj_*` record was
  refused. `start_run` now also accepts a chat project the token's tenant owns
  and has not deleted, the same rule the chat routes already apply to reads
  and writes. Any other project must still be the admitted one, and a store
  error counts as not owned.
- **This lane's server has no conversational send.** The SDK's
  `chat.messages.send` posts `{text}`; `claude/theorem-ui-artifact-tools`
  routes that to `turns::send_message`, but main and PR 880 only accept the
  low-level append (`parts`), so the composer answers 400 against this lane.
- The lane server's model catalog declares no credential for Inkling; the
  end-to-end run used `minimax/MiniMax-M3`.
- A refused workspace shows as an empty explorer. Theia does not surface the
  product server's environment errors (403, 503), so the person sees no reason.
- Project ids (`chatproj:sha256-…`) are not host workspace ids, which allow
  only ASCII letters, digits, `_` and `-`. The frame maps one to the other by
  replacing every other character with `-` (`src/components/ide/ide-frame.tsx`);
  the server could instead name the workspace in its bootstrap answer.

- The agent does not edit through the document authority today. Its edits
  reach Theia through the checkout watcher. A native `documents.edit`
  operation on PR 880's binding would put them on the authority path with
  their run attribution.
- Workspace-edit plans skip the authority for documents that are not open.
- Closing a terminal detaches; the host has no operation that ends a shell.
  `terminal.open` takes no working directory, so "Open in Terminal" opens at
  the workspace root.
- Revert in an editor cannot discard edits other writers made to the shared
  document; the editor stays dirty. `documents.reconcile` could carry it.
- Follow the Agent reads file paths from tool-call arguments (`path`,
  `file_path` and similar). Absolute paths are skipped, because the UI does
  not know where the host keeps the checkout. A run attribution on document
  events (see the first gap) would replace this.
- The VS Code built-in extensions are not downloaded (`bun run
download:plugins` in `ide/`), so the editor has no grammars yet. Files then
  have Theia's `plaintext` language id, which language requests leave out so
  the host infers the language from the path.
- The HTTP environment host (`apps/theorem-ide-host`) attaches no language
  server; only the gpui IDE calls `attach_language_server`. Hover, completion,
  navigation, rename and formatting therefore answer empty there, and findings
  come only from the native providers (trailing whitespace). The Theia side
  needs no change once the host attaches servers.
- Locations a provider reports as a VS Code `{uri, range}` are mapped into the
  workspace by path, since the UI does not know where the host keeps the
  checkout.
- Conflicted files open with their conflict markers; staging one marks it
  resolved. There is no merge editor, and the host's `scm.resolve` (take ours
  or theirs) has no command yet.
- Fetch and push use the host's defaults: no remote or branch picker.
- Host test targets that do not build at this branch's base, unrelated to
  this work: `theorem-ide-host`'s `document_transactions` (calls a
  `DocumentProduct::transact` that does not exist) and `theorem-ide-runtime`'s
  `intellij_live` (needs a feature this build leaves out).
- `ide/patches` holds patches for the Bun-hosted Theia backend that no longer
  runs. They are left in place for whoever removes that backend's tooling.
- `@theia/notebook` and `@theia/test` stay in the app: their backend modules
  only bind preferences.
- The host test `a11_installed_host_coding_loop_edit_test_debug_scm_conflict_reopen`
  fails at `tests/common/mod.rs:126`; the other host tests pass. Not yet
  diagnosed.

## Conversational-send repair, 2026-10-29

The deployed personal backend reproduces the known `{text}` versus `{parts}`
contract mismatch above. The backend repair is being integrated separately on
Theorem main (branch `Travis-Gilbert/chat-send-errors`), preserving the old
append API and adding the send/run path with pending-turn replay.

The UI now presents structured API details and correlation references instead
of the SDK exception dump. If the response body is absent or malformed, HTTP
status selects the fallback. A partial send explicitly says the message was
saved. Error text wraps without a two-line truncation. The runtime formats only
after reconnect handling, retaining the original exception as its cause.

Run failures also use the public event's stage-specific explanation and
request reference, including saved error parts. The SDK fetch hook journals
only the send body, idempotency key and revision in sessionStorage. Reload and
retry reuse them with fresh CSRF, finite timeout and cancellation. Known
precommit model refusals clear the journal; ambiguous network failures retain
it. Failed recovery still allows saved history to load. This is a narrow
compatibility layer for the installed SDK, which discards a failed send's key.

Verification: the formatter and recovery suites pass 15 tests, including an
actual SDK adapter send followed by recovery through a fresh journal owner.
The initial formatter regression failed 8 tests before the implementation. After `sh terminal/build.sh` generated
the required WASM bindings, `bun run typecheck` and focused ESLint passed.
The real Thread and TheoremRuntimeProvider were also exercised in the in-app
browser against a temporary 403 response fixture. Sending through the real SDK
rendered the permission explanation and `chatreq-render-check` reference; it
showed no raw SDK/JSON dump and the full explanation wrapped visibly. This is
rendering evidence, not a live backend/provider acceptance test. The temporary
fixture files were removed. No UI deployment has been performed by this repair.


Release checks: `NITRO_PRESET=cloudflare_module bun --bun vite build` also
completed successfully in the isolated checkout. Cloudflare's automatic
Workers build for PR #19 reported failure (build
`0169025f-e42c-4ef5-b798-689bb00848e6`). Its dashboard requires sign-in and the
available Wrangler OAuth token receives 403 from the build-log API, so the
remote failure's cause is unverified. Do not treat the local build as a
successful remote build or deployment.

### 2026-10-29 Cloudflare release repair

The clean-checkout build referenced the removed IDE SDK 0.4.0 archive and relied
on generated terminal WASM and IDE output. The IDE manifest/lockfile now use the
checked-in 0.5.0 archive. `build:cloudflare` installs locked IDE dependencies,
builds terminal WASM, IDE extensions and Theia, then the Worker. `bun run build`
selects this pipeline under `WORKERS_CI=1`, provisioning pinned Rust 1.96.1 and
the matching wasm-bindgen CLI. Terminal compilation uses `--locked`.

Production had deployed `cb63a36` from still-open PR #18; this branch preserves
its sign-in recovery and HTTPS callback behavior. PR #18's target is unchanged.
PR #21 carries the complete build repair and deployed sign-in source. A live
chat also exposed a completion-label bug: a stale running progress part rendered
"Did not finish" after a completed message. The message's terminal status now
takes precedence; cancellation and error states retain their own outcomes.

Final UI source: `89f1a85`. Validation passed:

- `WORKERS_CI=1 bun run build` with the isolated terminal target and two Cargo jobs.
- `bun run typecheck`.
- 31 tests / 84 assertions across client, send recovery, server auth and sign-in.
- Cloudflare version upload and production promotion.

Production Worker `theorem-ui` now routes 100% to version
`e9cdcafa-8ae3-455e-9326-e46d9bf8df34`, deployed 2026-10-29 20:16:52 UTC.
The live chat client and terminal WASM match local artifacts byte for byte.
The earlier preview-only version `fd19f6fc-bf91-43dc-976f-7b6c07da2053` was
superseded by this version after the completion-label correction.

Backend source `1ee5490bca` (merged PR #903) is deployed on store machine
`8147d9b9996e58` in `travis-theorem-personal-store` as image digest
`sha256:535d29fde0f429aa4b1395e424b976dbb0a55d2213a20e3d0ee8974329af71e8`.
The public harness proxies `/api/chat/v1/*` to this private store; it was not
redeployed. An initial public-harness build was canceled before rollout.
The backend server release compiled successfully; the optional CLI retains the
same unavailable placeholder that was already present in production.

Only the store image changed. Environment, injected `/mott-models.json`, services,
checks, machine size and volume `vol_v8epl5k7njj7zd5v` were verified unchanged.
This matters because the checked-in Fly manifest omits the deployed model file
and its environment setting. The existing OpenRouter model/key remain in use.
The two detached recovery machines were untouched.

Startup exceeded the existing 180-second timeout. The first candidate was
rolled back when its readiness probe failed; later logs showed it completed
recovery after 248 seconds just before rollback. The previous image recovered
in 244 seconds. The candidate was reapplied and verified ready, with Fly's
`store_ready` passing. This is an existing slow recovery condition, not proof of
a regression caused by the chat patch. No timeout or readiness assertion was
weakened. Previous image for recovery:
`sha256:edcde9c8f31f44ee843632849514d7842472f2651add6e0ce422b9da71f64a6d`.

Live acceptance: in a signed-in browser on theorem.rs, a new conversation
returned "Chat is working." Reload preserved the answer. After frontend
promotion, it showed "Done", and a follow-up returned "Second message received."
with "Done". Thread `chatthread_sha256:a3fe7d1ff0a8e0a942578f29c` holds this
verification. An unauthenticated SDK-shaped POST now returns 401 with relative
`/problems/authentication_required`, rather than the former unknown-field 400.
This verifies conversational sends and continuation, not every artifact/tool flow.

Automatic Workers Builds remains a separate unresolved gate. Build
`039c979a-8d35-4997-97fc-bacb753e1f16` failed; GitHub supplied no error details and
Wrangler OAuth receives 403 from the Builds API. A user-scoped token file was
provided but contained an incomplete value, so logs are still inaccessible.
The secure token-entry command was supplied again. Next step: retrieve the
failed build log with a valid user-scoped Workers Builds Configuration token,
repair its specific failure, and verify an automatic remote build. Manual
production deployment and live chat success do not establish automatic CI success.
