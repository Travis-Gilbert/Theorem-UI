# Commit your work from a clean worktree when another session has uncommitted edits in the same files

**Kind:** method
**Captured:** 2026-11-03T00:00:00Z
**Session signature:** `fee1be44-ecff-4404-a8f2-cc5ee5f58f71`
**Domain tags:** git, multi-session, commits

## Trigger

On `feat/motion`, the models, settings and composer-picker work had to land as
three commits. The checkout also held another session's uncommitted work, and
some of it sat in the same files: `package.json`, `bun.lock`,
`src/components/icons.tsx`, `src/lib/theorem/runtime.tsx`,
`src/components/assistant-ui/elements/thread.aui.tsx` and
`src/routes/_chat.tsx`. Staging hunks with `git add -p` in that checkout could
not show that each commit typechecks and builds alone, because the working tree
also held the other session's edits. A commit could depend on lines that were
never staged and still pass locally.

## Rule

Build each commit in a fresh worktree at HEAD, then move the branch with `git update-ref` and `git reset -q` (mixed) in the shared checkout, so the other session's edits stay uncommitted and untouched.

Steps that worked:

1. `git worktree add --detach <tmp> HEAD`. Copy in only your own changes for
   commit 1. Copy gitignored build inputs the checks need too (here
   `src/terminal-wasm`).
2. Run tsc, eslint and the production build in the worktree, then commit.
   Repeat for each later commit.
3. In the shared checkout: `git update-ref refs/heads/<branch> <new> <old>`.
   Passing the old value makes it fail if the branch moved meanwhile. Then run
   `git reset -q`. The mixed reset updates the index and leaves the working tree
   alone.
4. `git status` should now list exactly the other session's changes. Remove the
   worktree.

## Evidence

- Commits `22fa9c4`, `9f73e28`, `39d1e93` on `feat/motion`. Each was built and checked alone.

## Encoded in

- `docs/learnings/2026-11-03-commit-beside-another-sessions-uncommitted-edits.md` (this file)
