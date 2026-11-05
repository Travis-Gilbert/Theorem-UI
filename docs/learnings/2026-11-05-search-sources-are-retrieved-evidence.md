# Search sources are retrieved evidence

## Boundary

A plain `[PCMag]` label has no destination. The existing GFM renderer already handles explicit Markdown links; the UI must not guess URLs from labels. Successful native search results can also arrive as the existing `citation` stored part, with `sourceKind: "web_search"`, a title in `label`, and `provenance.url` / `provenance.excerpt`. The SDK maps this payload unchanged to `theorem-citation` in live and history messages.

Reuse the existing citation chip. Mark these parts as `Search source: <title>` and explain in the tooltip that retrieval is not independent verification. Admit absolute HTTP(S) destinations with the platform URL parser. Retain an unsafe/missing destination's source label without making a link. Ordinary citations keep their existing wording.

## Action and evidence log

1. Inspected the real SDK adapter, runtime live adapter reuse, CitationPart, and GFM configuration. Agreed on the additive payload with the backend owner; no new SDK or renderer needed.
2. Added actual rendered Thread tests using the installed SDK adapter. Observed 8 failures and 2 controls passing before the change: missing retrieval label and unsafe destinations rendered as anchors. A first DOM-object equality failure recursively printed happy-dom internals; terminated that owned run, kept compact evidence, and used numeric anchor counts to prevent recursive diagnostic output.
3. Added only HTTP(S) admission and source-kind presentation to CitationPart. Verified href, title, target, safe link relation, JSON serialization/history remount, unsafe/missing destinations, ordinary citations, explicit Markdown links, and literal labels without destinations.
4. Focused rendered coverage: 15 passing tests across citations/errors/delegations. All chat component tests: 18 passing. Typecheck and scoped ESLint pass. Final Cloudflare-module Vite production build exits 0; existing WebAssembly fallback and bundler timing warnings remain.
5. Crapper: changed CitationPart CC/CRAP 9.0 and citationUrl 4.0, both 100% line coverage. Unrelated functions in the same renderer retain their existing uncovered complexity; this is not whole-file quality coverage. Dryer found no duplicate candidates. Installed mutator executed two selected sites (URL input type and search-source discriminator): both killed, source restored. Full logs remain in the SSD evidence directory as `citations-ui-*`.

Component/history adapter proof does not establish native durable publication or deployed browser acceptance. Those gates belong to the combined backend/UI release.
