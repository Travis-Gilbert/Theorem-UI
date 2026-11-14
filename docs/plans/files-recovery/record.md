# Files recovery

The signed-in production Files panel failed on 2026-11-13 because its vault
request exhausted the Cloudflare Worker's memory. The response was HTTP 503,
Cloudflare 1102; a filtered live worker tail confirmed `exceededMemory` and
`Worker exceeded memory limit.` The UI hid Home when that request failed.
The Fly relay now reaches Files authentication; its earlier 404 is no longer
the current failure.

The repair preserves Home's failure with Retry, exposes the vault query's own
error/refetch state, and gives Files a lazy Nitro route that reuses the existing
OAuth and streaming proxy. H3 cookie helpers preserve the same iron-session
boundary without initializing the UI router. Cloudflare output is minified,
and the shared icon module exports only the icons its callers actually use.

## Evidence

- Focused H3/session/error and component tests pass 14/14. They cover sealed session reading,
  sign-out/refusal, refresh with rotated Set-Cookie, binary PUT/precondition forwarding, and response
  streaming before upstream closes, plus the rendered Retry action. Upstream
  HTTP in these tests is an explicitly named stand-in.
- The Cloudflare build passes. Terminal WASM was rebuilt from this checkout's
  own source using a pooled Cargo target. TypeScript checking passes after
  fixing the optional cookie-segment assertion and returning a React element
  from the existing Conversation test stand-in.
- The downloaded production worker version
  `130a1fa1-aaef-4116-8c44-8d4c58613b3e` and built candidate ran in local workerd
  with loopback bindings. After a Files GET, `Runtime.getHeapUsage` reported
  146,723,900 bytes for production and 94,224,408 bytes for the candidate. After
  also loading the candidate's root route, its used heap was 108,495,492 bytes.
  That root request returned 500; the earlier attribution to an absent
  loopback authority was not established. The later hosted startup defect
  below was reproduced against real Worker output. These are local memory
  measurements, not production capacity or rendered-product claims.
- The server icon module shrank from 7,786,951 to 13,630 bytes. Candidate
  JavaScript modules total 34,650,943 bytes. The production module download
  was 59,010,705 bytes including WASM and multipart metadata; those totals are
  not identical measures.
- The repository's local OAuth stack and rebuilt shipping native server opened
  Home, created and renamed `Files acceptance November 13.md`, and saved
  `Files acceptance: café, 日本語, and durable save.` through the real Files
  endpoint. The development identity provider is a stand-in; Files and its
  journal are real. The server artifact SHA-256 was
  `a84271132c952ce62c0cb54d29417303c15ec9602b4fc4a6f4496081a6a7f111`.
- The exact text survived SIGKILL and a fresh server/UI startup with the same
  journal. Reload displayed `Saved to Home`. An explicitly simulated vault
  HTTP 503 rendered `Home could not load` and Retry; clearing the interception
  and clicking Retry restored the saved document from the real server.

No production data or worker was changed. Local request interception was
removed and the two workerd measurement processes were stopped. Evidence logs
are `/tmp/pr1066-ui-refresh-tests.log`, `/tmp/pr1066-ui-worker-build4.log`,
`/tmp/pr1066-worker-heap-final.jsonl`, and
`/tmp/pr1066-worker-heap-after-home.jsonl`. Downloaded worker artifacts are
retained under the SSD's `codex-rebuildable-cache/pr1066-worker-evidence`.

## Remaining release gates

The real local UI has passed against the final backend artifact (receipt below).
Production rollout and authenticated theorem.rs read/write/reopen remain
required. The actual restored production-journal rehearsal is still running;
local frontend acceptance does not waive that storage gate.

## Compact sidebar review repair

The full `FoldersSection fill={false}` component test reproduced Home still
being hidden after vault failure. Keeping that section visible exposed a second
bug: mounting its nested Home view retried the failed query, hid the section,
and repeated the cycle. The vault query now keeps its failure across observer
mounts until explicit retry or invalidation. The regression exercises the real
query hooks with a named failing API stand-in, proves one initial request,
visible error detail, and exactly one request from Retry. The full focused suite
passes 14/14, and `bun run typecheck` passes. New evidence survives host restart
under `/Volumes/SSD Samsung/codex-rebuildable-cache/pr1066-worker-evidence/`:
`ui-final-tests.log`, `ui-final-typecheck.log`, and the original failing
`compact-red.log`. Earlier `/tmp` logs disappeared during the host restart;
the previous measurements remain recorded here but are not freshly remeasured.


## Fresh rendered acceptance after restart

Against shipping server SHA
`ebdd4b3c4bcc61de2e19ecade81c6a3b6115bb67c8f684a289df3dce4b23e9b6`,
the browser reopened the earlier note, saved a fresh Unicode edit, created
`Recovery checks`, and dragged the note into that folder. The open editor
followed the stable entry identity. After SIGKILL of that local server and a
fresh stack startup against the same journal, the moved note and exact edited
text reopened with `Saved to Home`. A transient properties request to the old
path returned 404 during the move; the view subsequently loaded the new path
and retained its saved state.

A simulated vault 503 on the Index compact sidebar kept Home and Retry visible;
removing interception and clicking Retry restored the real vault and note.
Interception was removed. Rendering also identified a generic error fallback
calling Files the chat service; Files now supplies its own service name to the
existing error formatter. The five relevant suites pass 31/31 and TypeScript
checking passes (`ui-final-tests2.log`, `ui-final-typecheck2.log` in the durable
evidence directory). Cloudflare preview and Composer CI passed at dd77075.

Screenshots are retained in the local review artifacts, including
`files-reopened.png`, `files-compact-failure.png`, and
`files-final-reopened.png`. Other local Index/artifact APIs still report
unrelated errors; this receipt proves the Files flow only. The server artifact
includes the current Files owners, but later Cypher analyzer changes still
require the final integrated backend gate.

## Final integrated server receipt

The final native server SHA-256
`e869a99fefcf9acfae53bbe21f7bdd0d881a68a46f608b329a6c85f03cc1c812`
reopened the moved note from the same journal. In the rendered editor, a fresh
edit saved this exact text:

> Files acceptance: café, 日本語, and durable save. Verified after restart with the native Files API. Final integrated server verified.

After SIGKILL and a fresh startup of that same artifact, the browser showed the
exact text, `Saved to Home`, and the note beneath `Recovery checks`. The normal
Files API and disk journal were used throughout; the development OAuth provider
remains a named stand-in for identity. No production data was changed.

The durable evidence directory contains `ui-terminal-saved.txt`,
`ui-terminal-reopened.txt`, `ui-terminal-stack.log`, and
`ui-terminal-reopen-stack.log`. Screenshot: `files-terminal-reopened.png`.
The same server separately passed installed Rust/TypeScript SDK process tests
2/2 without skips and native HTTP/gRPC Open/Bound route checks, including
crash/reopen receipt replay. Backend PR1069 records those receipts.

## Current-main integration

Merged upstream `2a479ca30dcef39517b0f8fa149d3c5447bc18cf` into the Files
branch. The only conflict was equivalent formatting in the Conversation test
stand-in; the new appearance and shell work is preserved. Frozen dependency
installation, the five focused Files suites (31/31), and TypeScript checking
pass on the merged source. Receipts: `ui-main-install.log`,
`ui-main-tests.log`, and `ui-main-typecheck.log` in the durable evidence root.

The separate live integration revision `2edebeebf358a04d0fc61f08634a91e4945739d8`
was not in upstream main, so it was also merged to preserve the already-deployed
IDE restart recovery. Its overlapping Connections and passthrough changes
were already identical on the Files branch. The resulting Files and IDE
suites pass together: 80/80 across 13 files, zero failures
(`ui-live-integrated-tests.log`). No additional product behavior was invented
during either merge.

## Rendered merged-source check and CI diagnosis

The merged frontend saved a fresh Unicode edit through terminal server
`e869a99fefcf9acfae53bbe21f7bdd0d881a68a46f608b329a6c85f03cc1c812`,
then reloaded and read the exact text with `Saved to Home`. The durable
receipts are `ui-integrated-saved.txt` and `ui-integrated-reloaded.txt`;
`files-integrated-frontend-reloaded.png` records the rendered result.

Current-main appearance checks introduced a separate CI failure. The local
Mac headless-shell renderer stalled; the pinned full Chromium used by the
existing composer e2e passed all nine review suites. Actual Linux artifacts
then exposed a distinct Bun dev-server cold-start socket failure whose Vite
overlay intercepted the first settings action. The workflow now uses Node,
like the product e2e stack, and probes the static Vite client before the first
SSR navigation. A forced cold Node run passed all 56 interactions. The
workflow retains failures and Vite logs as CI artifacts instead of printing
only a generic failure. Actual Linux Composer run 43564580129 passed on
`dc691c1bfa21236f8a5e14f95bca63e067f72574`, including all nine rendered review
suites. Durable logs are `ui-composer/linux-43564580129-full.log` and
`ui-composer/linux-43564580129-rendered.log`. Cloudflare Worker preview and
Greptile also passed for that revision. Production authenticated acceptance
remains a separate release gate; local development identity is a stand-in.

A follow-up review found that the aggregate rendered runner still read fixed
review paths after producers gained `ORACLE_REVIEW_OUT`. It now shares the
producer's directory for interactions, continuity, reflow, runtime and
composition. A report-reader check loaded all five existing receipts from the
external evidence directory, including the second-consumer composition result.
The check deliberately had no browser installed and retained the browser
failure; it verifies report routing only and is not a new rendered pass.

## Hosted Worker startup repair, November 14

The integration owner uploaded the `a9a6632e` artifact and reproduced HTTP 500
on HTML routes. Browser-only Neon Auth code was eagerly grouped into the
Worker's Zod chunk and failed during global initialization. Commit `de0028cb`
adopts `4ffaafbb0ea048d6e8e455ad5c9fa7b72ca763d9` with the identical source
tree: auth adapters load on their request paths and recursive dependency
grouping is disabled in Worker output. This is distinct from the original
Files request memory failure.

The repair passes 87 focused auth/Files/workspace/IDE tests and TypeScript.
An app-only Nitro build cold-started in local workerd with explicit fixture
configuration: auth pages returned 200, Files and Project Files returned typed
signed-out 401, and unconfigured Neon returned its expected 503. That local
build omitted Theia assets and does not establish live backend behavior.

The complete Cloudflare build published preview
`e68158f4-1bb7-44a8-b0dd-dea003040165` with source annotation `de0028c`.
Its immutable URL serves Home, IDE, Index, Canvas and auth pages with HTTP 200,
Files and Project Files with signed-out 401, and the packaged Theia page
after its `/theia/` redirect. The auth page also renders in Chromium.
The initial Python HTTP client received generic 403 responses; subsequent
curl and browser observations are retained separately. No signed-in claim is
based on these checks.

Linux Composer run `43591338025` passes, including all nine rendered review
suites. Cloudflare Builds and Greptile pass. The source-bound runtime and
HTTP receipts are under
`/Volumes/SSD Samsung/codex-rebuildable-cache/pr1066-worker-evidence/ui-neon-startup-de0028cb/`.
`hosted-preview-verified.json` has SHA-256
`a24b6c6d064692cf72061b56f41c37fffe36d475c29959a8541968cb19a093a3`.
The complete CI log is `ui-composer-de0028cb.log` in the parent directory,
SHA-256 `655d19506df4ffa35c2c9ed6a47297de738ac97672764e0bf873fee817ee71cd`.
The viewed screenshot is `output/playwright/hosted-de0028cb-auth.png`.
Only this chat's local browser/workerd processes were stopped.

The referenced integration chat separately owns its live store/frontend
release. This chat has not deployed production. The backend candidate still
requires its own packaged Linux runtime and fresh restored-journal checks;
final signed-in theorem.rs Files acceptance remains open.
