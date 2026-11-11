# A fresh worktree needs the terminal WASM copied in, and a stub Theorem API makes the shell checkable with no backend

**Kind:** gotcha
**Captured:** 2026-11-03T00:00:00Z
**Session signature:** `f2113cfa-10e6-4796-b37e-ab79a5b35fbd`
**Domain tags:** dev-server, worktree, theorem-api, verification

## Trigger

To check PR #25 in a browser, I ran the dev server from a new worktree. Three things got in the way.

1. Vite failed on the import of `src/terminal-wasm`. That directory holds generated bindings, which are gitignored, so a worktree does not have it.
2. No Theorem was listening on 8084 or 8380, so the UI only showed "Theorem is unreachable". Checking live Home on theorem.rs needs the user's sign-in.
3. My first stub returned 404s. The SDK calls chat under `/api/chat/v1/...`, files under `/api/files/v1/...` and project files under `/api/project-files/v1/...`.

## Rule

- In a new worktree, copy the main checkout's `src/terminal-wasm` (gitignored) before you run `vite dev`.
- When no backend is running, use a stub Theorem written in Bun. Point the dev server at it with `THEOREM_API_URL=http://127.0.0.1:<port>` and `THEOREM_API_TOKEN=local-dev`, set in a temporary `.claude/launch.json` entry. Remove that entry afterwards, because the file holds the user's uncommitted edits.
- What the stub has to serve:
  - chat: `bootstrap`, `projects`, `projects/{id}/threads`;
  - files: `vault`, `entries`, `content` (GET and PUT, with `If-Match` against `contentHash`), `moves`, `events` (long poll on `after`/`waitMs`, emitting `changed` and `renamed`), `links`, `backlinks` and `graph`;
  - empty responses for `properties`, `settings`, `tags`, `search`, `suggestions` and `resolve`.
- Say plainly that the check ran against a stub, not live Home.

## Evidence

- The stub used here was a session scratchpad file, `stub-theorem/server.ts`, not committed.
- `src/lib/workspace/theorem-client.ts` (the paths the client calls)

## Encoded in

- `docs/learnings/2026-11-03-run-a-worktree-against-a-stub-theorem.md` (this file)
