---
title: Today
tags: [daily]
---

# Today

![[Tools/Habit tracker.tsx]]

## Habits

The habit log, straight from the CSV:

```tsx {.live #habits}
// uses: files.read("Data/habits.csv")
await files.csv("Data/habits.csv")
```

Days a habit was kept:

```tsx {.live #streak}
habits.filter((row) => row.done === 1).length
```

<!-- theorem:output #streak -->

`4`

<!-- /theorem:output -->

The latest kept habits:

```query {.live #recent}
from: Data/habits.csv
filters: 'done == 1'
views:
  - type: table
    order: [date, habit, minutes]
    sort: [{ property: date, direction: DESC }]
    limit: 3
```

```ts {.live #focus}
const focus = "Finish the live blocks draft"
```

```agent {.live #weekly}
prompt: Summarize this week's habits in two sentences.
inputs: ["#streak", Data/habits.csv]
output: Reviews/Weekly.md
```

## Errands [budget:: 80] [left:: = (prev ? prev.left : budget) - cost]

- @2026-10-23 Groceries [cost:: 35]
- @2026-10-24 Pharmacy [cost:: 12]
  - Pick up the refill
- @2026-10-25 Hardware store [cost:: 20]

```query {.live #errands}
from: mentions
views:
  - type: calendar
  - type: table
    order: [mention.text, cost, left]
```
