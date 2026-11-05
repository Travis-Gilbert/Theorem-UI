# Cloudflare automatic build toolchain and production routing

The failed build `bd3a5fba-ccc6-48bf-9d59-f863a24d0a9e` used Bun 1.2.15. Root dependencies installed, but `bun install --cwd ide --frozen-lockfile` rejected the IDE lockfile with `Unknown lockfile version` (version 2). The same frozen install with Bun 1.4.3 succeeds. The root `packageManager` now pins that tested version using Cloudflare Workers Builds' supported version-selection field.

The existing production build configuration also tracked `Travis-Gilbert/conversation-quality-20261104` with `npx wrangler preview`. The Builds API was corrected to track `main` and run the README's `bunx wrangler deploy`. Readback confirmed the existing build command, automatic builds, disabled previews, environment variables, and build-token selection were preserved. A branch-triggered build created before the configuration change was cancelled; it is not production acceptance.

Actual automatic production build and live acceptance remain required. The first corrected main build is triggered by this record; its outcome is recorded separately after completion.

Evidence: `/Volumes/SSD Samsung/theorem-chat-search-evidence/cloudflare-auto-build-{detail,logs}-cf.json`, `cloudflare-bun-pin-install.log`, and `cloudflare-build-config-correction.json`. OAuth credentials stayed in the installed Cloudflare CLI credential store and were not printed or committed. This CLI has a separate credential store from Wrangler; its granted Builds scopes enabled the diagnostic reads.

References: [Workers Builds build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/), [Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/).
