# Composer requests share the form submission boundary

Superseded on 2026-11-06 for Web: the toggle now scopes the turn to RustyRed web rather than adding a text line; see `2026-11-06-composer-web-scope.md`. The submission-boundary finding below still holds.

The web toggle was pressed, but the actual chat POST contained only the user's original text. Web and diagram requests are durable text instructions, not separate SDK flags. The composer appended them in `ComposerPrimitive.Root.onSubmit`, while the visible `ComposerPrimitive.Send` invoked the runtime directly in its click handler before the form submitted. Enter used the form and worked.

The visible control is now a native submit button. The existing assistant-ui form remains the only owner of ordinary click/Enter submission, and the public `useComposerSend` hook supplies the same disabled semantics. The already-installed `@assistant-ui/core` version is declared directly rather than copying its predicate. Request-line deduplication handles both toggles together. Model/configuration, context references, attachment preparation, edit/retry, and send recovery remain with their existing runtime owners.

## Action log and evidence

1. Captured the live request without a search instruction and reproduced it using the actual Thread UI. Click/web, click/diagram, and click/both failed; Enter and off controls passed (3 RED, 3 controls GREEN).
2. Routed the visible send control through the native form. A second regression exposed duplicate web instructions when both request lines already existed; deduplication now recognizes existing complete lines.
3. Verified 41 tests across the composer, runtime, and send-recovery suites. Click and Enter submit exactly once, keep model/context configuration, clear the sent draft, preserve existing instructions, and leave blank/Shift+Enter drafts alone.
4. Five tool-request mutations were killed. Restoring the old direct Send component as an actual mutation made the click-path tests fail; the source was restored byte-for-byte.
5. Changed owners have 100% reported coverage and CRAP 3–9. Dryer at 0.8 reports only the pre-existing, unchanged UserFilePart/UserImagePart wrapper pair, outside this repair; no new duplicate was introduced.
6. Typecheck, scoped ESLint, and the Cloudflare Vite/Nitro build passed. The build reused unchanged terminal/Theia assets and ran no local Rust compiler.

Private evidence uses the `composer-search-*` prefix under `/Volumes/SSD Samsung/theorem-chat-search-evidence`. The parent task performed the signed-in acceptance below.

## Production acceptance

The automatic Cloudflare build `6f55aec4-9e23-4e65-be9f-6c5d106f769e` succeeded for exact source `f52494c691dc352fb2e44747cd59d0b86c38d21d`. Its logged version `f3653583-c64f-4fa6-8ebc-fe6549a54b7b` matches production deployment `668551b5-d4ee-4540-ad5d-5a4f2ee5bcd9` at 100%, created 2026-11-06 04:15:45 UTC. The automatic build also rebuilt the terminal and Theia assets. `composer-search-auto-production.json` records this mapping; all 9 log pages (10,523 lines) were preserved without truncation.

After a fresh signed-in reload, the parent captured both click and Enter requests containing exactly one search instruction and observed the sent draft empty. `live-composer-click-green.json` and `live-composer-enter-green.json` preserve those wire checks. The Enter run completed actual web search and `web_read` of a SQLite primary page with a source link; `live-composer-enter-success.txt` and `.jpg` preserve the rendered result. The search toggle was restored to off afterward.

The initial comparison click run did execute search but later encountered a provider HTTP 400. Its cause remains a separate backend investigation; the correctly augmented wire request establishes that it was not this composer bypass. Answer-quality concerns, including an insufficiently qualified backup claim in the SQLite answer, remain with the backend conversation work and are not claimed resolved by this UI fix.
