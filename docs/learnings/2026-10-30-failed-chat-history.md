# Failed chat history and one error display

Theorem-UI base `ea80a3f`; paired backend base `aebf55c3d1`.
A native `web_search` binding was lost when the working set reconstructed its
catalog. The affected run then exhausted eight iterations. The backend emitted
an error part and `RUN.FAILED`, but persisted only the observer's earlier parts.
Reload therefore lost the error; the SDK defaulted the assistant message to
complete. While live, the typed part and assistant-ui error boundary both
rendered the same failure.

The server now replays terminal error parts into saved/read history. UI SDK 0.5
maps only `thread.lastRun` to status, so `message-history.ts` retains its part
conversion and additionally restores each turn's failure from its error part.
Existing authoritative cancellation/interruption status wins. A tool-result
failure alone does not fail a response that subsequently completes.

The existing `MessageError` suppresses its generic boundary only when a matching typed
Theorem error is already in the message. Standalone transport errors still
render. This reuses assistant-ui and the SDK; no new dependency or parallel
message parser is needed.

Verification: 22 focused tests pass, including rendering the actual Thread with
assistant-ui's external runtime, one contextual alert and a standalone connection
error; distinct errors remain visible. Auth regressions also pass. TypeScript and focused ESLint pass. The full Workers build (terminal WASM,
IDE, Vite, Nitro) passes. Deployed acceptance is recorded below.

## Production verification

UI source `6a4b8cb95a1992f69e8991bca752482e323be819` passed 22 focused
tests, TypeScript, focused ESLint and the production build. Worker version
`a7decc77-8f07-4f16-9058-95167b59161c` was promoted to 100% after the paired
backend became ready. Existing bindings and secrets were preserved.

The signed-in search conversation
`chatthread_sha256:04fb665887c749b38115cdb37` returned eight native web-search
results and a final answer linking `https://rust-lang.org/`. Reload retained
Done status and the saved answer, with no active run or pending turn. The
original conversation `chatthread_sha256:d940d3d4a7df327973a0d6a87` now reloads
as Did not finish, displaying one error with its original request reference.

Automatic Cloudflare preview build `d2134ee6-e9b8-4235-b68d-7deb21a00439`
still failed. The manual production build/upload/promotion succeeded; automatic
build diagnosis remains blocked on usable build-log credentials.
