## Behavior

What problem does this change solve, and what will the person using it experience?
Name any intentional change to existing behavior. For composer or sending changes,
use `docs/development/composer-contract.md`.

## Regression evidence

- Reproduction, including the state that triggers it:
- Test that fails before the fix and passes after it (or why this is not a bug fix):

## Verification

Tested commit SHA:

| Command or scenario | Result |
| ------------------- | ------ |
|                     |        |

For composer, shared editor, or send changes, include `bun run test:composer` and
`bun run typecheck`. Record the results from the current head, including failures.
For editor interaction changes, include `bun run e2e:composer --built` or its
concrete blocker.

## UI evidence

For interaction changes, link a browser reproduction or recording and name the
browser, viewport, and scenario. For visual changes, include before and after
images in the affected themes. An unchanged UI can be marked not applicable.

## Remaining gaps

List blocked or unverified behavior, the concrete blocker, and its effect on the
claim that this change is ready. Distinguish fixtures from live services. Write
"None" only when there are no remaining gaps.
