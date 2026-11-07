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

## Highlighted search excerpts and fetched pages

Live tooltip inspection found search-provider highlight markup and encoded entities displayed literally. The chat route explicitly disables SSR. Reuse the browser's inert, detached HTML template parser for `web_search` excerpts only, remove script/style contents, and take textContent; never attach parsed nodes or pass markup to React. `web_read` excerpts already contain extracted plain text, so preserve literal code and entities and label these chips `Page source`, with the same explicit retrieval-versus-verification distinction. URL admission stays shared and unchanged.

1. Observed two actual rendered regressions before changing production: raw highlighted search excerpt and missing retrieved-page label. Existing ten controls passed.
2. After the narrow renderer change, twelve rendered tests pass, including entity decoding, script/style omission, no inserted markup, exact safe href, literal page code, and unsafe URL controls. The fixture initially failed strict TypeScript indexing; supplying the excerpt through the existing fixture constructor removed that unsafe indexing.
3. Isolated Bun coverage output and crapper/dryer outputs preserve the repository's existing `.metrics` and `coverage`. CitationPart has CC/CRAP 9 and citationExcerpt 3, both 100% line coverage; dryer reports no duplicate candidates at 0.8. Installed mutator used an isolated exact-source snapshot with the same installed dependencies and real rendered tests: all three selected excerpt-guard mutations were killed by assertions. This is focused renderer evidence, not whole-file coverage.
4. Final typecheck and scoped ESLint exit 0. Final Cloudflare build and live tooltip inspection remain combined release gates owned by the parent release task.

## Superseded: retrieved sources draw no tag (2026-11-07)

The owner asked to cut the tags. Each search result arrived as its own citation, so one search drew eight `Search source` chips under its tool call and crowded the answer. `CitationPart` now draws nothing for `web_search` and `web_read` citations. The answer links what it uses through GFM, and the tool call still opens to the full result. Ordinary citations keep their chip, label, safe-URL admission and excerpt tooltip. The excerpt parser above went with the search tags.
