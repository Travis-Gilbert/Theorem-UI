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

| Decision | Choice | Why |
|---|---|---|
| Live transport | One server-sent event stream per workspace attachment; mutations and terminal input stay HTTP POST | Both existing proxies already pass SSE through, `Last-Event-ID` is the resume cursor, and auth and CSRF stay the same as every other environment call. The plan this replaces proposed a WebSocket; it would need upgrade handling in Nitro and in the axum forwarder for the same recovery semantics. One multiplexed stream stays inside HTTP/1.1's six-connection limit. |
| Event cursor | `{epoch}:{seq}`; the epoch changes when the host reopens the workspace | A cursor from another epoch, or one older than the retained window, gets an explicit `resync` instead of a silent gap |
| Document events | Read from the authority's revision records after each accepted mutation | Every writer that commits through the authority is covered, with actor, provenance, operation id and edits |
| Writers outside the authority | A checkout watcher adopts a disk change as a `reconcile` revision when the document has no unsaved edits, and reports a conflict otherwise | Agent tools, formatters, git and shells write files directly |
| Terminal output | A byte log per terminal with absolute offsets, carried on the same stream as `terminal.output` frames after the client subscribes | Resume from an offset; document events are sent ahead of queued output |
| Shared editing | `ot-text-unicode` transforms pending local edits against accepted remote edits | It works in Unicode scalar offsets, which is the authority's unit |
| Undo | A per-client undo stack of invertible operations, transformed against remote edits | Monaco's own stack would undo other actors' edits |
| Theia target | `browser-only` from Theia 1.76, with `FileSystemProvider`, `MonacoEditorModelFactory` and `TerminalFrontendContribution` rebound to Theorem | These are the seams Theia's own browser-only modules use |
| Embedding | Theia's frontend is served by the Theorem UI at `/theia/` (Nitro `publicAssets`) and shown in a dock panel beside the conversation | Same origin, so the frame's SDK calls go through the UI's proxy, which adds the server token; `/ide` is already the route of the UI's IDE mode |
| Bridge | Penpal 8 method calls over `postMessage`, typed by one contract (`ide/theia-extensions/theorem-workspace/src/common/ide-bridge.ts`) | Origin-checked, promise-based calls in both directions instead of a hand-written message protocol |
| Theia's own state | Settings, keymaps and plugin storage live in the browser (OPFS) under a `theia-user` scheme | `file` names the Theorem workspace, so nothing of Theia's is written into the checkout |
| Follow the Agent | On by default. Files the live run's tool calls name open in Theia's preview editor without focus; artifacts the run writes open in their panel. Moving in the IDE pauses it; the eye button beside New chat and the IDE bar resume it | One switch for every view, so the artifact panel and the IDE behave the same |

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

- **The UI's server credential names no principal, so the product server
  refuses it execution.** The proxy (`src/server/theorem-proxy.ts`) sends
  `THEOREM_API_TOKEN`, a static deployment token. A static token carries a
  tenant and scopes but no user id, and the product server grants a tenant's
  execution host only to principals listed in its host binding
  (`theorem_environment.rs`). With the real local server and the real token,
  bootstrap answers `principalId: null` and opening a workspace answers 403
  `environment_execution_not_granted`. A signed session token (`thm1.`) for
  the same tenant carries the principal and passes. Either the UI forwards a
  signed-in user's session token, or a static token learns to name a principal;
  both change who the product server believes is calling.
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
