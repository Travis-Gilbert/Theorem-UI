# Folder workspace routes

The local server's routes for folder workspaces (plan D16). The page reaches
them through `src/lib/workspace/desktop-client.ts`, which implements
`WorkspaceClient` (`src/lib/workspace/types.ts`) over them; views should use
that client rather than these routes.

- Every route answers `404` unless the desktop host started the server
  (`THEOREM_DESKTOP=1`), so the web deployment never serves them.
- Only folders the person opened through the system picker are served: the
  workspaces are exactly the host's folder grants (`src/server/desktop/grants.ts`).
  Withdrawing a grant closes the workspace and ends its event streams.
- The session guard in front of `/desktop/*` is a separate piece of work.

The service lives in `src/server/desktop/workspace/`; the route files in
`src/routes/desktop/workspace/` only bind `workspaceRoutes` from `http.ts`.

## Conventions

- **Paths** are workspace-relative POSIX paths without a leading slash, passed
  as the `path` query parameter or in a JSON body. A path that leaves the root
  (`..`, an absolute path, or a symbolic link that resolves outside) is refused
  with `403 path_outside_workspace`. Hidden entries (any segment starting with
  `.`, which covers `.theorem` and `.git`, and `node_modules`) are not part of
  the tree and cannot be written, renamed or removed (`403 path_hidden`);
  `.theorem/` is written only by the service.
- **Hashes** are SHA-256 of the file's bytes, lowercase hex. A file's `ETag` is
  its hash in quotes.
- **Errors** are `application/problem+json`:
  `{ type, title, status, code, correlationId, detail }`, plus `currentHash`
  on a `412`.
- **Changes** made through these routes are recorded before the watcher sees
  them, so they are reported once, with origin `app`. Changes made by any other
  program are reported after a short debounce with origin `external`.

## Routes

All under `/desktop/workspace`.

| Method and path                                   | Does                                                                                                                                                             | Answers                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /`                                           | Lists the open workspaces, opening any granted folder not open yet                                                                                               | `WorkspaceSummary[]`                                       |
| `GET /$workspaceId`                               | One workspace                                                                                                                                                    | `WorkspaceSummary`                                         |
| `GET /$workspaceId/tree`                          | Every entry, sorted by path                                                                                                                                      | `WorkspaceEntry[]`                                         |
| `GET /$workspaceId/file?path=`                    | A file's bytes. `If-None-Match: "<hash>"` answers `304` when unchanged                                                                                           | bytes, `ETag`, `Content-Type` by extension                 |
| `PUT /$workspaceId/file?path=`                    | Writes the body atomically, creating missing parent folders. `If-Match: "<hash>"`: the file must still have that hash. `If-None-Match: *`: it must not exist yet | `{ hash }`, `ETag`; `412` with `currentHash` on a mismatch |
| `DELETE /$workspaceId/file?path=`                 | Moves a file or folder to the system trash                                                                                                                       | `204`                                                      |
| `POST /$workspaceId/mkdir` `{ path }`             | Creates a folder and missing parents                                                                                                                             | `201`; `409 already_exists`                                |
| `POST /$workspaceId/rename` `{ from, to }`        | Renames or moves an entry. It and everything inside keep their ids, and links to moved files are rewritten                                                       | `204`; `409 already_exists`                                |
| `GET /$workspaceId/resolve?target=&from=&syntax=` | Resolves a link target as written in `from`. `syntax` is `wiki` (default) or `markdown`                                                                          | `{ resolved: string \| null }`                             |
| `GET /$workspaceId/links?path=`                   | A note's links, in order, each resolved now                                                                                                                      | `WorkspaceLink[]`                                          |
| `GET /$workspaceId/backlinks?path=`               | The links anywhere that resolve to `path`                                                                                                                        | `WorkspaceLink[]`                                          |
| `GET /$workspaceId/search?q=&limit=`              | Full-text search over titles and bodies; every word must match, the last as a prefix. `limit` is 1 to 100, default 20                                            | `SearchHit[]`, snippets with `<mark>`                      |
| `GET /$workspaceId/tags`                          | Every tag with the number of notes using it, grouped case-insensitively                                                                                          | `{ tag, count }[]`                                         |
| `GET /$workspaceId/properties?path=`              | A note's frontmatter                                                                                                                                             | object                                                     |
| `PUT /$workspaceId/trust` `{ trusted }`           | Sets whether the person trusts the folder's code (kept in app data, never in the folder)                                                                         | `WorkspaceSummary`                                         |
| `GET /$workspaceId/events`                        | Server-Sent Events, one `WorkspaceEvent` as JSON per `data:` line, a comment every 15 seconds                                                                    | `text/event-stream`                                        |

## Events

`created`, `changed`, `deleted` and `renamed` carry `origin: 'app' | 'external'`.
`indexed` follows each batch, once the index has caught up. `resync` means
events may have been missed (ids changed outside Theorem, or the index was
rebuilt); the client also emits it when its event stream reconnects. On
`resync`, refetch the tree and anything derived from it.

A folder move reports `renamed` for the folder and for each entry inside it.
A rename made outside Theorem is recognized when a file disappears and one
with the same content (line endings aside) or the same `theorem-id`
frontmatter appears in the same batch; the id follows the file.

## What is where

- In the folder: `.theorem/workspace.json` (`{ "id": "ws_<ULID>" }`) and
  `.theorem/ids.json` (path to `vf_<ULID>`, sorted by path). Ids are never
  written into the person's files; a `theorem-id` key in frontmatter is honored
  for a file arriving without an id.
- In app data, `<THEOREM_DESKTOP_DATA_DIR>/workspaces/<ws id>/`:
  `index.sqlite` (entries, links, headings, tags, properties, tasks, block ids
  and an FTS5 table; derived and rebuildable) and `settings.json` (trust).

## Link resolution

Obsidian's rules, in order: `./` and `../` targets and Markdown destinations
relative to the linking note; a leading `/` from the root; the target as a
path, with or without `.md`; then the file with the shortest path that ends
with the target, matching case if any file does, else ignoring case.

## Link rewriting

On a rename through these routes, every link that resolved to a moved file is
checked against the new layout and rewritten only if it no longer reaches the
same file. Rewrites keep the link's style: a bare `[[Name]]` stays as short as
it can while unambiguous, a path stays a path, `./` stays relative, a leading
`/` stays absolute, `.md` is kept or left out as it was, and headings, block
ids, aliases and embeds are untouched. Markdown destinations are rewritten
relative to the note, with spaces and parentheses escaped. Links inside a note
that moves are fixed the same way.

Renames made outside Theorem (a git checkout, Finder) keep ids but do not
rewrite links, so a checkout never produces edits of its own.
