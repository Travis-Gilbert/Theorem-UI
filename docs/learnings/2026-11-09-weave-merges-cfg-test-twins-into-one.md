# The weave merge driver merges cfg(test) and cfg(not(test)) twins into one

**Kind:** anti_pattern
**Captured:** 2026-11-08T00:30:00Z
**Session signature:** `c68c7220-2fd3-4fbe-ae9c-70a568ba8ddf`
**Domain tags:** git, theorem, rust, release

## Trigger

Merging Kit's commits onto the live store commit `bcf7a0cefb` in the Theorem repo looked clean.
But `.gitattributes` sends `*.rs` to `~/.cargo/bin/weave-driver`, which merges by entity. The
production `injected_run_start_failure` (gated by `#[cfg(not(test))]`) came out with its
`#[cfg(test)]` twin's body, so a production binary would have run the test fault injection.
Redoing the merge with a plain text driver gave a `.rs` patch identical to the PR's.

## Rule

- For a release or replay merge in the Theorem repo, bypass weave per command:
  `git -c merge.weave.driver='git merge-file -L ours -L base -L theirs %A %O %B' merge ...`
- Afterwards, compare the merged `.rs` patch with the PR's (`git diff <base> -- '*.rs'`, or
  `git range-diff`). A clean merge does not prove it is right.
