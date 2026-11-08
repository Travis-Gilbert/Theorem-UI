# bun's mock.module outlives the test file, and re-mocking does not undo it

**Kind:** gotcha
**Captured:** 2026-11-07T00:00:00Z
**Session signature:** `2645b10d-e6a2-4dfe-a0c5-82a13a1c2e44`
**Domain tags:** tests, bun, mocking

## Trigger

A new `src/components/workspace/folders.test.tsx` mocked `@/lib/workspace/workspaces`,
`@/components/shell/projects` and `@/lib/theorem/sign-in` with `mock.module` to render
`FoldersSection`. It passed alone. In the full `bun test` run, `ExportToFolder > offers each open
folder` started failing, and it passed again with the new file removed. An `afterAll` that called
`mock.module(path, () => realModule)` to put the originals back did not fix it. Files that had
already imported the module kept the mocked bindings.

A mock that returned only a few names also broke the old code's run with
`SyntaxError: Export named 'useActiveProject' not found`, because other modules in the import graph
needed the missing exports.

## Rule

- Don't `mock.module` a module that other test files also use. Move the logic under test into a
  plain exported function (here `homeAbsence({ isPending, signIn, signedOut })`) and test that.
- If a mock is unavoidable, spread the real module (`...(await import(path))`) and override one
  name. Then run the full suite, not just the file.

## Evidence

- Theorem-UI PR #39: `src/components/workspace/folders.test.tsx` (the final, mock-free version)
- Full suite with the mocks: 13 failures. Without them, 12, the same 12 that fail on main.

## Encoded in

- `docs/learnings/2026-11-07-bun-mock-module-leaks-across-test-files.md` (this file)
