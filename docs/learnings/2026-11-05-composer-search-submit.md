# Composer requests share the form submission boundary

The web toggle was pressed, but the actual chat POST contained only the user's original text. Web and diagram requests are durable text instructions, not separate SDK flags. The composer appended them in `ComposerPrimitive.Root.onSubmit`, while the visible `ComposerPrimitive.Send` invoked the runtime directly in its click handler before the form submitted. Enter used the form and worked.

The visible control is now a native submit button. The existing assistant-ui form remains the only owner of ordinary click/Enter submission, and the public `useComposerSend` hook supplies the same disabled semantics. The already-installed `@assistant-ui/core` version is declared directly rather than copying its predicate. Request-line deduplication handles both toggles together. Model/configuration, context references, attachment preparation, edit/retry, and send recovery remain with their existing runtime owners.

## Action log and evidence

1. Captured the live request without a search instruction and reproduced it using the actual Thread UI. Click/web, click/diagram, and click/both failed; Enter and off controls passed (3 RED, 3 controls GREEN).
2. Routed the visible send control through the native form. A second regression exposed duplicate web instructions when both request lines already existed; deduplication now recognizes existing complete lines.
3. Verified 41 tests across the composer, runtime, and send-recovery suites. Click and Enter submit exactly once, keep model/context configuration, clear the sent draft, preserve existing instructions, and leave blank/Shift+Enter drafts alone.
4. Five tool-request mutations were killed. Restoring the old direct Send component as an actual mutation made the click-path tests fail; the source was restored byte-for-byte.
5. Changed owners have 100% reported coverage and CRAP 3–9. Dryer at 0.8 reports only the pre-existing, unchanged UserFilePart/UserImagePart wrapper pair, outside this repair; no new duplicate was introduced.
6. Typecheck, scoped ESLint, and the Cloudflare Vite/Nitro build passed. The build reused unchanged terminal/Theia assets and ran no local Rust compiler.

Private evidence uses the `composer-search-*` prefix under `/Volumes/SSD Samsung/theorem-chat-search-evidence`. Main deployment and signed-in request/search verification belong to the parent task.
