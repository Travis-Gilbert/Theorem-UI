# Cloudflare automatic build toolchain and owner verification

The failed build `bd3a5fba-ccc6-48bf-9d59-f863a24d0a9e` used Bun 1.2.15. Root dependencies installed, but `bun install --cwd ide --frozen-lockfile` rejected the IDE lockfile with `Unknown lockfile version` (version 2). The same frozen install with Bun 1.4.3 succeeds. The root `packageManager` now pins that tested version using Cloudflare Workers Builds' supported version-selection field. This source pin is the production build fix.

## Correct owner and preserved configuration

The initial failed build belonged to legacy preview Worker tag `72862a357b5943e697f393ed36366392`. Its settings tracked the task branch with `npx wrangler preview`. Initially, those settings were changed to main plus `bunx wrangler deploy`, preserving its environment and token selection. Account inventory then established that current production `theorem-ui` has a different tag, `90fd1ef709ea46b9bf2143962ab7b622`, and already correctly tracked main with `npx wrangler deploy`. The legacy build was cancelled and only its obsolete triggers were removed; those legacy edits did not repair current production routing.

Current production trigger `ef080438-be04-4105-b71d-cb0decf02340`, environment variables, token selection, and enabled preview configuration were preserved. `npx wrangler preview` is supported by installed Wrangler 4.152.0 and the current official Builds documentation. The earlier suspicion that this command was obsolete was disproven; no replacement was made to current previews.

## Actual automatic build acceptance

Push-triggered main build `382be2a5-560a-4b18-b328-198f11f0d2cb` built source `b8974737f9fdb87087b40ba871f4fb85f77c3f6d`. Logs confirm Bun 1.4.3, successful frozen IDE dependency installation, terminal WebAssembly, Theia and Vite builds, and a successful production deploy. It completed on 2026-11-05 at 15:39:36 UTC and published Worker version `9c621f20-9188-4653-b260-4e6be896b4bb` to theorem.rs. A separate Workers Deployments API read confirmed that version at 100% traffic. Plain HTTP retrieval returned 403; this is not rendered browser acceptance, which remains owned by the release workflow.

Superseded legacy builds `92ea675e-2142-4bf7-b127-61c1b24eb802`, `03719bfa-de0f-44ca-824f-8c51b557512a`, and `805bbbf0-d0cc-42a8-84f9-de467dbabee2` were cancelled. The last was initially mistaken for the current production build; the authoritative Worker inventory corrected that attribution before deployment.

Evidence is under `/Volumes/SSD Samsung/theorem-chat-search-evidence`: `cloudflare-auto-production-complete.log` (all 10 log pages, no remaining truncation), `cloudflare-auto-production-live-verification.json`, `cloudflare-auto-build-investigation.json`, and the sanitized build/settings receipts. Credentials stayed in CLI credential stores and were not printed or committed. The new Cloudflare CLI's separate OAuth grant enabled Builds access; existing Wrangler OAuth enabled the independent deployment read.

References: [Workers Builds build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/), [Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/).
