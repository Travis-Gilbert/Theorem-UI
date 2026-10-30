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

The existing `MessageError` suppresses its generic boundary only when a typed
Theorem error is already in the message. Standalone transport errors still
render. This reuses assistant-ui and the SDK; no new dependency or parallel
message parser is needed.

Verification: 19 focused tests pass, including rendering the actual Thread with
assistant-ui's external runtime, one contextual alert and a standalone connection
error. TypeScript and focused ESLint pass. The full Workers build (terminal WASM,
IDE, Vite, Nitro) passes. Live search and deployed reload acceptance remain
pending until both artifacts are promoted.
