# Record tables and the data model in the Index

Twenty's record table and data model settings, rebuilt over Theorem's schema
register and placed in the Index as two library components a view program
composes like any other. The checklist is `record-table-data-model.checklist.json`.

## Sources

- Twenty (fork `Travis-Gilbert/twenty` at `ffca6cee`): `packages/twenty-front`
  record-table, record-field, record-show, views and settings/data-model,
  including the React Flow overview. Behaviour was read from source; no code was
  copied.
- Mobbin, Twenty on web: [Updating records](https://mobbin.com/flows/5970df17-fd43-4b05-8031-b11b1db98089),
  [Updating table view](https://mobbin.com/flows/e387b8ef-0285-4d3a-9826-4cce421bff81),
  [Notes](https://mobbin.com/flows/cd249207-eaed-4d2b-89f2-f3770ee646ad),
  [Data model](https://mobbin.com/flows/fe5330e0-eeb0-4040-9436-89d8eb159d3a),
  [Creating an object](https://mobbin.com/flows/01925060-804e-4039-8bc2-fc6ecba5d3be).
- Theorem: `rustyred-thg-schema` (declared `ObjectType`/`FieldSpec`, observed
  shapes, conformance, the SR6 record verbs) and `rustyred-thg-mcp`'s GraphQL
  (`dataModel`, `dataRecords`, `dataRecord`, `declareSchema`, `pinObserved`,
  `unpinDeclared`).

## Shape

- **`RecordTable("<object>")`**: one declared type's records. Index panel:
  Records lists every declared object; each opens `default:records:<name>`.
- **`DataModel()` / `DataModel("<object>")`**: the objects page with a diagram
  preview and Visualize, an object's fields and relations, and what records carry
  that is not declared yet. Opens at `default:data-model[:<name>]`.
- **Expanded record**: the Index working pane. A record item is
  `record:<name_singular>/<id>`; documents keep bare ids.

Both components read Theorem themselves rather than through a view binding, so
an agent-composed view can place a table beside an Atlas or a list.

## Decisions

| Decision                 | Choice                                                                                                                               | Why                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Object model             | The schema register over `/graphql`, not Commonplace's `/rest/metadata`                                                              | The register is the flexible model: Observe/Warn/Reject enforcement, observed shapes, divergences and promotion. Commonplace mirrors Twenty's fixed metadata |
| Writes to records        | `invokeRecordVerb(objectTypeId, verb, input)`, the SR6 verbs at the register's owner                                                 | GraphQL has no record mutation yet and a Theorem client must not call `/mcp`; until the mutation exists the UI says so and keeps nothing it could not save   |
| Schema edits             | Whole re-declaration through `declareSchema` with `expected_content_anchor`                                                          | The register owns the anchor; a stale edit comes back as a conflict instead of overwriting another person's change                                           |
| Twenty's composite types | Display hints in the type's `extensions["theorem.ui"]` (email, link, phone, currency, percent, rating) over the register's few types | The register stays small; the hint travels with the declaration                                                                                              |
| Table                    | TanStack Table v9 through the app's kit hook, TanStack Virtual for rows                                                              | The kit's filter, sort and view-options lists come with it; row selection was re-added to the shared features                                                |
| Diagram                  | `@xyflow/react` 12, laid out by a small layered layout in `records/layout.ts`                                                        | elkjs is only a transitive dependency; the layout is deterministic and tested                                                                                |
| View arrangement         | localStorage per view (sorts, filters, order, widths, visibility, footer)                                                            | Until record view state lives in Theorem (`upsertDataView`); see the checklist                                                                               |
| Menus, popovers          | coss ui `menu`, `popover`, `checkbox`, vendored as the other coss components are                                                     | The app's component choice for these                                                                                                                         |
| Tests                    | `bun test` over the pure modules: aggregates, schema edits, layout, record decoding, built-in programs parsed by OpenUI              | No new runner                                                                                                                                                |
