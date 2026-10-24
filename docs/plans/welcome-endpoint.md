# New-chat welcome from Theorem

The new-chat view in Theorem UI shows a headline written for the person and two
suggestions below the composer. Theorem writes them with Qwen3.8 Omni Flash,
picked from its model catalog. This plan covers the Theorem endpoint, the SDK,
the UI wiring and the deploy. The checklist in `welcome-endpoint.checklist.json`
tracks it item by item.

## Why an endpoint

Theorem can only reach a catalog model inside a chat thread run today. The UI
first shipped a server route that called OpenRouter directly with its own key
(commit `6b1053d` on `claude/interesting-bohr-cee321`). That route is removed,
and the rule stands: Theorem UI never calls a model provider itself. Driving a
throwaway thread instead would run a full front-role turn per new chat, flash a
thread in the sidebar and leave the JSON unenforced. So Theorem gets a small
endpoint that owns both the context and the model call.

## Settled decisions

- **Route:** `POST /api/chat/v1/projects/{project_id}/welcome`, in
  `rustyredcore_THG/crates/rustyred-thg-server/src/theorem_chat.rs` beside the
  other project routes (`router()`, line ~91).
- **Auth:**
  - Scopes `tenant:read` and `models:invoke`, the way run starts check
    `&["tenant:write", "models:invoke"]` in `theorem_agent_stream.rs` (~506).
  - The chat CSRF token (`x-csrf-token`, validated with `state.chat_sessions`
    the way `mutation_context` does), because the call spends model budget.
  - No `Idempotency-Key`: nothing is written.
- **Owner only:** public visitors stay out. `public_audience::PUBLIC_ROUTES`
  is an allowlist, so leave it unlisted and add a test that an
  `audience:public` bearer is refused.
- **Theorem gathers the conversation context itself**, from the store the chat
  routes already use (`deployment_store`, `LiveTenantGraphStore`):
  - the project title;
  - up to 8 most recent regular threads in the project, using
    `list_chat_threads` in `theorem-harness-runtime/src/theorem_chat.rs`. For
    each thread: title and last activity;
  - for the newest 3, the last user message from `load_chat_thread`. Keep text
    parts only, collapse whitespace and cut to 600 characters.
- **The UI sends only what Theorem cannot see:** the person's local time
  (written out) and the folders open in the desktop app, each with its most
  recently changed files.
- **The model comes from the catalog, never a fallback.**
  - `THEOREMWEB_WELCOME_MODEL` pins it the way `THEOREMWEB_CHAT_MODEL` pins the
    front role. The default is `openrouter/qwen/qwen3.8-omni-flash`.
  - Resolve it with `chat_model_binding::select`, so a missing row or credential
    gives the same `chat_model_not_configured` / `chat_model_credential_missing`
    refusals the chat path uses.
- **Structured output:** strict `json_schema`. Reuse `apply_response_schema` in
  `theorem-harness-runtime/src/head_invoker/api.rs` (~2172) rather than writing
  a second request builder.
  - First check whether `invoke_api_head` can run with one system prompt and
    one user message, with no scratchpad, persona or context membrane. If so,
    use it.
  - If it cannot do that without MoM framing, make `apply_response_schema`
    callable on its own and put the HTTP call behind a small completer trait,
    the way `turn_router.rs` does (`complete` at ~269, a reqwest impl, a stub
    in tests).
- **Call limits:** non-streaming, 20 s timeout, `max_tokens` 1200. The Omni
  Flash row has thinking on and `can_disable_thinking: false`, so leave room
  for reasoning.
- **Observability:** fixed-cardinality outcome counters and latency, like
  `turn_router.rs`. Never log prompts, folder names or replies.

## Wire shape

Request (`WelcomeRequest`):

```json
{
  "localTime": "Friday, October 24 at 9:14 PM",
  "folders": [{ "name": "Notes", "recentFiles": ["inbox.md", "plans/q4.md"] }]
}
```

Limits:

- `localTime`: 80 characters at most.
- `folders`: 3 at most.
- `name`: 200 characters at most.
- `recentFiles`: 10 entries at most, each 300 characters at most.

Response 200 (`Welcome`):

```json
{
  "headline": "Back to the retry path?",
  "suggestions": [
    {
      "title": "Pick up",
      "label": "the retry path",
      "prompt": "Where were we on the retry path?"
    },
    {
      "title": "Write up",
      "label": "the batching fix",
      "prompt": "Draft a note on the batching fix."
    }
  ]
}
```

Exactly two suggestions. Keep the first two if the model returns more, and
answer 502 if it returns fewer.

Errors are the chat API's problem+json (`problem` in `theorem_chat.rs`):

| Status | Code                                                         | When                                                                      |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 400    | `welcome_invalid`                                            | body fails the limits above                                               |
| 403    | `csrf_token_required`, `csrf_token_refused`, scope refusal   | as elsewhere in the chat API                                              |
| 404    | `resource_not_found`                                         | unknown project, or another tenant's                                      |
| 503    | `chat_model_not_configured`, `chat_model_credential_missing` | no catalog row for the pin, or its key is unset                           |
| 502    | `welcome_failed`                                             | provider error, timeout, reply off the schema, fewer than two suggestions |

## Prompt

The system prompt is below. It is the text from the removed UI route,
`git show 6b1053d:src/server/welcome.ts` in Theorem UI, adjusted so that
Theorem supplies the conversations. Keep it as a const in the handler module,
the way `turn_router.rs` keeps `ROUTER_SYSTEM_PROMPT`. The user message is the
JSON of `{localTime, project, threads, folders}`.

```text
You write the opening of a new chat in Theorem, a workspace where a person talks with an AI assistant that drafts documents, writes code, makes diagrams and remembers past conversations.

You get what the person has been doing: their recent conversations (titles, when they were last active, and the last thing they asked in the newest few), the project, and any folders they have open with the files they changed most recently.

Write:
- headline: one short line, at most eight words, that meets them where they are. Name the actual work when the context shows it, as a colleague would on sitting down beside them. A question or a statement, never a greeting or a sales line.
- suggestions: exactly two next steps they would plausibly want right now, each grounded in something specific from the context. One can pick up the most recent thread; the other should open something different but related. title is a two or three word verb phrase, label names what it acts on in a few words, and prompt is the full message the person would send, in their own voice.

The assistant can see past conversations but cannot open files in the person's local folders, so a prompt must not depend on reading one. With no recent activity, write a plain inviting headline and two broadly useful suggestions.
```

## Dependencies and order

1. **The Omni Flash catalog row.**
   - It exists only uncommitted, in `/Volumes/SSD Samsung/theorem-terminal-run-mixture`
     (branch `claude/terminal-run-mixture`, under `openrouter` in
     `rustyredcore_THG/crates/theorem-harness-core/data/models.json`). It was
     probed live with a strict `json_schema` request. Do not add a second row:
     build on that branch once its session commits the row, or ask that
     session to.
   - That file still has the `together` group, which Theorem PR 890
     (`claude/openrouter-models`) deletes. Whichever lands second resolves the
     conflict by keeping PR 890's removals and the new OpenRouter rows.
2. **The endpoint PR** in Theorem, based on the branch that carries the row.
3. **The SDK:** regenerate it and vendor it into Theorem UI.
4. **The UI wiring**, on Theorem UI's `claude/interesting-bohr-cee321` (PR 10)
   or on main once that merges.
5. **Deploy.** Ask the user first. Redeploy the personal store
   `travis-theorem-personal-store`:
   - config `infra/fly/personal-core/store/fly.toml`, image from `rustyredcore_THG/Dockerfile`;
   - `OPENROUTER_API_KEY` is already a store secret;
   - the personal app's relay forwards `/api/chat/v1/*rest` (`theorem-mcp-server/src/lib.rs`
     ~865), so it needs no change.

## Work

### Theorem: endpoint

- Handler and route in `theorem_chat.rs`. If the handler outgrows that file,
  put it in a sibling `theorem_chat_welcome.rs`, the way
  `theorem_chat_upload.rs` sits beside it.
- Add the pin to `chat_model_binding.rs`, next to the `THEOREMWEB_CHAT_MODEL`
  pin, together with this test (it passed against the row on 2026-10-24):

  ```rust
  #[test]
  fn a_requested_omni_flash_is_reached_through_openrouter() {
      let catalog = ModelCatalog::shipped();
      let bound = select_requested(
          &catalog,
          "openrouter",
          "qwen/qwen3.8-omni-flash",
          &only("OPENROUTER_API_KEY"),
      )
      .expect("the row is reachable");
      assert_eq!(bound.provider_model(), "openrouter/qwen/qwen3.8-omni-flash");
      assert_eq!(bound.binding.api_key_env.as_deref(), Some("OPENROUTER_API_KEY"));
      assert_eq!(bound.binding.base_url.as_deref(), Some("https://openrouter.ai/api/v1"));
      assert_eq!(bound.source, ChatModelSource::Request);
  }
  ```

- Handler tests, with the model stubbed:
  - the happy path returns the headline and two suggestions;
  - the request carries `response_format.type = "json_schema"` with `strict: true`;
  - the user message holds the project title, recent thread titles, the
    newest three last asks, the local time and the folders;
  - a project in another tenant gives 404;
  - a missing or refused CSRF token gives 403;
  - an `audience:public` bearer is refused;
  - a bad body gives 400;
  - a pin with no row or no key gives 503 with the binding's code;
  - an off-schema reply or a single suggestion gives 502;
  - a timeout gives 502.
- Contract:
  - add the endpoint row to `apps/theoremweb/contracts/theorem-chat-v1.json`,
    with `scope: tenant:read` and `service_scope: models:invoke`;
  - add a section to `apps/theoremweb/contracts/THEOREM-CHAT-WIRE-1.0.md`;
  - run `node apps/theoremweb/oracles/theorem-chat-contract.mjs` until it passes.

### Theorem: SDK

- Add the operation and the `WelcomeRequest`, `Welcome` and
  `WelcomeSuggestion` schemas to `packages/theorem-sdk/fern/openapi.json`,
  under the chat projects group. The generated method should be
  `theorem().chat.projects.welcome({ projectId, "X-CSRF-Token", localTime, folders })`.
  Match how the neighbouring project operations name themselves.
- Generate and check, in `packages/theorem-sdk`:
  - `npm run generate:node` (Docker-free) or `npm run generate`;
  - `npm run typecheck`;
  - `npm test`.
- Bump to `0.4.1` and `npm pack`.

### Theorem UI: wiring

- Vendor the tarball:
  - copy it to `vendor/theoremharness-sdk-0.4.1.tgz`;
  - point `package.json` at it;
  - delete the 0.4.0 tarball;
  - run `bun install`.
- In `src/components/chat/welcome.ts`, replace `queryFn: skipToken` with the
  SDK call, and update the hook's doc comment.
  - The hook already gathers exactly the request (`request`: local time and
    the open folders' recent files), waits for it to settle (`enabled`), and
    keys the cache on the project, its newest thread activity and the folders.
  - Take the CSRF token from `bootstrap()` in `src/lib/theorem/client.ts`, and
    re-bootstrap once on 403. Do that by factoring the CSRF half of `mutate()`
    into a helper both use, not by copying it.
- Delete `src/lib/theorem/welcome-schema.ts`, and use `Theorem.Welcome` and
  `Theorem.WelcomeRequest` from the SDK.
- In `src/components/assistant-ui/elements/thread.aui.tsx`, remove the
  `!welcome.isEnabled` check from `ThreadWelcome` and `ThreadSuggestions`, and
  the comment line about the dormant query. The check hides the welcome while
  the query has no endpoint. With the endpoint, the skeletons must hold the
  composer's place while the request settles and runs; the composer stands
  alone only on error.
- Verify in the desktop host. That means a Bun build in `.output` and the
  host's drive harness against a Theorem with the endpoint:
  - the headline and two suggestions render, grounded in real threads;
  - clicking a suggestion sends its prompt;
  - with the welcome model unconfigured (503), the composer stands alone.

### Local server

The local `rustyred-thg-server` at `~/.theorem/theorem-ui-local` runs from
another branch (see its notes before rebuilding). Test the endpoint on a
binary built from the endpoint branch. Point `CARGO_TARGET_DIR` at
`/Volumes/SSD Samsung/cargo-targets/<lane>/`.

## Out of scope

- Caching welcomes on the server. The UI caches each answer for ten minutes,
  keyed on the project, its latest thread activity and the open folders.
- Letting a client pick the welcome model per request.
- Opening the endpoint to public visitors.
