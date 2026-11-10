---
title: Document positions are number or bigint, so they cannot be subtracted
kind: gotcha
rule_short: Compare Theorem positions with < and >, never with a - b.
---

# Document positions are number or bigint

## Trigger case

`sortNotes` in `src/lib/theorem/note-order.ts` first sorted with
`b.updatedPosition - a.updatedPosition`. The unit tests passed, because the
fixtures use plain numbers. `tsc` then failed with TS2365, "Operator '-' cannot
be applied to types 'number | bigint'". The SDK types `createdPosition`,
`updatedPosition` and `revision.position` as `number | bigint`.

## Rule

- Order positions with relational operators (`a < b ? -1 : a > b ? 1 : 0`).
  Those work across number and bigint, where subtraction throws on a mix.
- Run `tsc` before trusting a sort that bun's tests pass. Bun strips types and
  never sees the union.
