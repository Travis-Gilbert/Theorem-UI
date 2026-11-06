# Web scopes the turn to RustyRed web instead of asking in text

The Web toggle used to append "Search the web for this." to the message and leave the model to decide (see `2026-11-05-composer-search-submit.md`). The owner's direction is that Web should use RustyRed web directly. The toggle now sends no text: while it is on, each send, edit and regenerate carries the SDK turn option `capabilityScope: ["web_search", "web_read"]`, merged in `useTheoremThreadRuntime` beside the composer's context references and read at send time like the model pick. The chat server (`theorem_agent_stream.rs`, owner turn catalog) keeps only the named native operations plus the person's workspace tool, so the model can answer only from RustyRed web: `web_search` finds pages, `web_read` reads one.

Trade-off: a Web turn has no other tools (recall, documents, files). The SDK has no tool-choice option, so the scope makes web the only route, not a forced first call. The toggle stays on across sends until it is turned off, as before; there is no Tools menu, only the chip beside the attachment button.

The same change fixes a stray "Theorem tools" line above every composer. assistant-ui's `TriggerPopover` renders its children while closed so its behavior child can register; the vendored list parts return nothing when closed, but the heading added for "/" did not check `open`.

## Evidence

1. `runtime.test.ts`: a send through `TheoremRuntimeProvider` with Web on posts `capabilityScope: ["web_search", "web_read"]` and the typed text unchanged; with Web off it posts no scope. Removing the merge from the runtime makes the Web-on case fail.
2. `composer-tools.test.tsx`: the chip toggles `aria-pressed` and the turn option, stays on after a send, and leaves the message as typed. The heading test fails without the `open` check and passes with it.
3. Typecheck and scoped ESLint pass. The full suite has the same 12 failures as unchanged main (media panel, block listener, unsaved marker), none in changed code.

Not exercised against a signed-in deployment: the scope is verified from the SDK types and Theorem server source at `5664d6da`, not observed on the live chat API.
