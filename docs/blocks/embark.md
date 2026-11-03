# Mentions and per-day formulas

The Embark layer is the part of live blocks that reads structured data
written in a note's own outline, the way Embark does. The data is the dates,
fields and links a person types in a list or under a heading. A `query`
block with `from: mentions` collects those records. Formulas can chain from
one day to the next, as a trip budget does. The code is
`src/lib/blocks/embark.ts`. Formulas run in QuickJS (`src/lib/blocks/formulas/`).
[live-blocks.md](live-blocks.md) covers query blocks themselves.

## Writing mentions

Mentions use Dataview's inline field syntax. Markdown has no other
convention for this, and no library parses it outside Dataview.

- **A field in a sentence**: `[key:: value]`, or `(key:: value)`. Brackets
  may nest, so a value can hold a `[[link]]`.
- **A line that is only a field**: `key:: value`.
- **A date**: `@YYYY-MM-DD`, at the start of the text or after a space or an
  opening bracket, so an email address is not a date. The first date on a
  node is its date.
- **A link**: `[[Target]]`. Each link a node holds is kept.
- **A formula**: a field whose value starts with `=`, such as
  `[left:: = budget - cost]`.
- **Values** are read as YAML scalars, as frontmatter is: `3000` is a number
  and `true` a boolean. A value that is a single `[[link]]` stays its text.
  Field names are letters, digits, `_`, spaces and `-`.

Text inside inline code is not read, so `` `[x:: 1]` `` is not a field.

```md
---
currency: JPY
---

# Japan

## Trip [budget:: 3000] [left:: = (prev ? prev.left : budget) - (cost ?? 0)]

- @2026-11-02 Hotel in [[Kyoto]] [cost:: 200]
- @2026-11-01 Flight [cost:: 900]
  - Seat 32A [seat:: 32A]

### @2026-11-03 Osaka

- Ramen [cost:: 30]
```

## Records and inheritance

The note is read as an outline:

- headings nest by depth;
- list items nest under their parents;
- paragraphs and quotes sit under the nearest heading or item.

**Records.** A list item or paragraph that mentions anything (a field, a
date or a link) is a record. Headings are not records. Their fields and
formulas pass down to everything under them.

**What a record has:**

- its own fields, over those of every node above it, over the note's
  frontmatter;
- its own date, or the nearest date above it (so `### @2026-11-03 Osaka`
  dates what is under it);
- its text, with its fields and date taken out;
- its links, its line, and the nearest heading's text.

**Details.** A record under another record is a detail of it. `Seat 32A`
belongs to `Flight`: it takes the flight's computed values and does not take
its own turn in the flight's formulas.

**Frontmatter formulas.** A frontmatter value that is a string starting with
`=` is a formula for the whole note.

## Per-day formulas

A formula applies to the records below the node it is written on. Written on
a node with no records below it, it applies to that node alone.

The records a formula applies to form a chain. They are ordered by date, and
undated records follow the dated ones in document order. Each record's
formula sees:

- the record's own fields, and other formulas by name;
- `prev`, the record before it in the chain (with its computed values), or
  `undefined` for the first;
- `day`, the record's date;
- `today()`, `now()`, `date()`, `addDays()`, `daysBetween()`, `list()`,
  `number()` and `sum()`.

In the example, `left` runs through the trip in date order: the flight
(2100), the hotel (1900), then the ramen (1870). The seat shows the flight's 2100.

**Limits.** Expressions are JavaScript, evaluated in QuickJS with a 2-second
deadline and 64 MiB for each run, never in the page's realm. A formula that
reads itself, directly or through another, is an error. Errors are reported
by line beside the query's result.

## Querying mentions

````md
```query {.live #trip}
from: mentions
views:
  - type: calendar
  - type: table
    order: [mention.text, cost, left]
```
````

- **`from: mentions`** collects the records in the query's own section: the
  deepest heading whose span holds the block. A query above any heading
  collects the whole note.
- **`from: { mentions: Osaka }`** collects the section with that heading,
  ignoring case.
- **Each row** has the record's fields and computed formulas as bare names.
- **`mention.` gives where the record sits:**
  - `mention.date` (also plain `date` when the record has no `date` field);
  - `mention.text`, `mention.line`, `mention.links`;
  - `mention.heading`.
- **A calendar view** uses `mention.date` unless a view sets `date`.

A change to the note recomputes its mention queries, as any change to what
a block reads does.
