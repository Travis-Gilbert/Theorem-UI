# The Weave merge driver can drop imports and bring back removed lines without a conflict

**Kind:** gotcha
**Captured:** 2026-11-03T00:00:00Z
**Domain tags:** git, merge, weave, consolidation

## Trigger

While merging the open branches for the consolidation, `tsc` reported 17 errors in `thread.aui.tsx` and `runtime.tsx` after a merge git called clean for those files. `~/.config/git/attributes` routes `*.ts`, `*.tsx` and `*.js` through the Weave merge driver, and Weave had:

- dropped the motion imports (`Magnet`, `useArrivedLive`, `flyFrom`, `kick`, `recordLaunch`, `takeLaunch`) from `thread.aui.tsx`;
- brought back imports both sides had removed (`AuiConfig`, `Suggestions`, `SuggestionPrimitive`);
- deleted a comment in `vite.config.ts`, which no compiler would catch.

## Rule

After a merge of a TypeScript branch, replay it with the built-in text merge and read the difference:

```bash
T=$(git -c core.attributesFile=/dev/null merge-tree --write-tree HEAD^1 HEAD^2 | head -1)
git diff "$T" HEAD
```

Anything in that diff that is not a conflict you resolved yourself is Weave's decision. Take the text merge's version unless you can say why Weave's is right. Do the replay before you trust a green typecheck: a dropped comment or a resurrected line that still compiles passes `tsc`.

## Evidence

- `bc77c65` on `chore/consolidate-branches` restores the text merge for the three files.
- The same driver dropped lines in Theorem's `http.rs` merge, recorded in Theorem's `docs/plans/platinum-master/INTEGRATION.md` (ide-services I04).
