# Installing a Theorem Claude mod PR also means rebuilding the node, and `check:claude` needs a build first

**Kind:** gotcha
**Captured:** 2026-11-03T00:00:00Z
**Session signature:** `fee1be44-ecff-4404-a8f2-cc5ee5f58f71`
**Domain tags:** theorem-sdk, claude-mod, rustyred-thg-server, launchd

## Trigger

This came from installing PR #925's Claude mod (`claude/s2-mod-resolve`, `f34dbb9d6`). Three things went wrong.

1. In a fresh worktree, `npm run check:claude` failed with `schemas.ts is
   stale; run npm run build:claude`. The generated schemas live in
   `mods/claude/src/generated/`, which is gitignored. `build:claude` changed no
   tracked file, and the check then passed.
2. I first installed only the mod and called it done. A plain Code Mode cell
   (6 * 7) passed. But the launchd node
   (`~/Library/Caches/theorem-claude-mod-sdk-native/rustyred-thg-server`) was
   built Nov 1 16:24. The PR stack carries Rust commits from Nov 2, including
   `dcbe58fa6`, which lets a cell await an external result. The binary had no
   `awaited_result_conflict` string, so the PR's agent requests could not have
   worked. A plain cell never exercises them.
3. The rebuild added `--features rustyred-thg-mcp/graphblas`, because
   `strings` found "graphblas" in the old binary. The old binary did not link
   libgraphblas; the strings were only names. The new binary linked
   `@rpath/libgraphblas.9.dylib` with no LC_RPATH. launchd's KeepAlive then
   crash-looped it (`OS_REASON_DYLD`) until the old binary was restored.

## Rule

Before calling a mod PR installed, list the Rust commits in its stack that are not in the node binary (`git log <merge-base>..<head> -- '*.rs'` against the binary's mtime). If there are any, rebuild the node at the PR head. Copy its features from `otool -L` of the old binary, never from `strings`. Then test the PR's own feature live, not a trivial cell.

Steps that worked:

- Run `npm run build:claude` before `check:claude`.
- Install only the plugin and settings steps of `install-claude-desktop.sh`
  (steps 3 and 4).
- Build the server with `cargo build --locked -p rustyred-thg-server --bin
  rustyred-thg-server`, with no features. The warm `CARGO_TARGET_DIR`
  `/Volumes/SSD Samsung/cargo-targets/claude-mod-defect-repair` took 3m 25s.
- Back up the old binary as `.before-<tag>`. Copy the new one to `.new` and
  `mv` it into place.
- Run `launchctl kickstart -k gui/$UID/com.theorem.claude-mod-node`, then wait
  for `/ready`. It took 36s.
- Run the PR's live prompt through the installed mod.

## Evidence

- `packages/theorem-sdk/scripts/generate-claude-tools.mjs` (the stale check)
- `packages/theorem-sdk/mods/claude/.gitignore` (`/src/generated/`)
- `packages/theorem-sdk/tests/program-agent-live.test.ts` (the live prompt;
  through the installed mod it returned `{answer: "PONG", agent_id}`)
- `~/Library/Logs/theorem-claude-mod-node.log` (the dyld crash loop)

## Encoded in

- `docs/learnings/2026-11-03-theorem-claude-mod-check-needs-a-build-first.md` (this file)
