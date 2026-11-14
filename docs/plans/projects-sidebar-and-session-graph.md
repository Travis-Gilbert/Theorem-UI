# Projects sidebar, project home and session graph

The sidebar lists sessions, not conversation branches. Projects open to a home
of their own. Each project has a graph that shows how its sessions relate.

The governing spec is `THEOREM-PROJECTS-SIDEBAR-AND-SESSION-GRAPH-SPEC.md`,
which the owner attached in chat on 2026-11-14. It is not in either
repository yet. Section numbers cited in this repository's SOURCING comments
(§2.2, §5, §7, §9 and so on) are the spec's own numbers. The checklist is
`projects-sidebar-and-session-graph.checklist.json`.

This plan is the Theorem UI half, delivered "UI first, backend next":

- What Theorem already serves is drawn from real records.
- What it does not serve is labelled as not served. Nothing is drawn as if it
  worked.
- The relation and pin routes are a separate Theorem backend change that
  follows.

## Sources

- The spec, slices A to C (§16), with acceptance oracles from §15.
- The owner's notes:
  - Drop the activity buckets.
  - Pin by default.
  - Make Search clear and New thread lighter.
  - Give Projects and Chats bolder, larger headings.
  - Increase density.
  - Default icons are files and folders, plus a terminal file for coding and
    a third type for agent tasks, with user types allowed.
  - Replies and regenerations are never subchats.
  - The project home is modelled on Claude's.
  - The graph is a view that changes nothing.
  - Teams can be an org tree, flat or democratic.
  - Sessions can be connected without nesting.
- Mobbin references: the Linear, Claude and Twenty sidebars and Claude's
  project page.
- A graph screenshot the owner shared. They liked the workflow it showed, not
  its look.
- The design-oracles skill for type scale and spacing.

## What changed

### Navigation semantics (§2.2, §4.3)

- **Only forks nest.** `nestingSource` in `src/lib/theorem/organization.ts`
  returns a source only for `origin.kind === 'forked'`.
  - A continuation is provenance: it stays at the top level and says
    "Continues …".
  - Edits and regenerations never produce a session row.
  - `parentsIn` breaks a malformed origin cycle at its oldest member, so
    every session stays visible (NAV-07).
- **Opening a session keeps its version.** A session row carries no
  version-branch rows. Opening the current session keeps the conversation
  version selected inside it (NAV-05, `src/components/organize/thread-row.tsx`).

### Sidebar (§5, §6)

`src/components/organize/organized-panel.tsx`

- **Section order:** Search (with its shortcut), a lighter New thread, Pinned,
  Projects, Chats, and the Librarian at the foot. Attention Worthy, Running,
  Needs You and Later are gone.
- **Headings** use a new appearance recipe, `ui.group`: 600 weight,
  15px/20px. That is one step above the 14px row labels, and it goes through
  the appearance policy rather than a local override (TYPE-01).
- **Rows** are 32px tall on a 33px pitch.
- **A project row is two controls:**
  - its title links to the project's home;
  - its folder is the disclosure, and turns into a chevron on hover or focus
    (NAV-08).
- **Pins are their own thing** (§5.2), separate from the Librarian's
  placement lock, which is now labelled "Keep in…". Pins live in
  `src/lib/theorem/sidebar-prefs.ts` and are stored per browser, and the
  empty Pinned section says so.
- **Session types** (§5.4) change only how a session looks. The built-ins are
  Conversation (file), Coding (terminal file) and Agent task (checklist
  file). People can add their own from the row menu, and a type grants no
  capability (AUTH-04).

### Project home (§7, §8)

Route `/projects/$projectId`, `src/components/projects/project-home.tsx`.
`ModeView` shows it in place of the conversation, which stays mounted.

- **Header:** folder mark, title, session count, last moved, Pin and Edit.
  Edit sets the title and instructions through `chat.projects.update`.
- **Overview:**
  - the real composer, which files the new session in this project through
    the shell's project;
  - recent sessions with their provenance;
  - beside them: instructions, Where it stands, and Apps and outputs (moved
    here from the sidebar).
- **Sessions:** every session in the project, with type filter chips when
  there is more than one type.
- **Graph:** the session graph scoped to the project. Its lens is in the URL
  as `?lens`.
- **Context:**
  - instructions, Where it stands, and outputs;
  - Documents, Repositories, Links, and Databases and servers, each labelled
    "Not served yet" (§8: no working-looking placeholders).
- The phone header, the dock tab and the breadcrumb name the project while its
  home is open.

### Session graph (§9)

- **Projection:** `src/lib/theorem/session-graph.ts` computes P(records, lens,
  scope). It is a pure function and writes nothing (VIEW-01).
  - **Lineage** draws forks as solid arrows and continuations as dashed
    arrows labelled "continues". A source outside the project is drawn with a
    dashed outline. A missing source is not invented.
  - **Projects** draws every project a session is filed in. A kept placement
    is labelled "kept".
  - **Delegation, Team and Related** say why they are not served, and draw
    nothing.
- **Layout:** `src/lib/theorem/session-graph-layout.ts` uses ELK:
  - layered for lineage and membership;
  - mrtree for a team's one-way tree;
  - stress for related sessions.

  It keeps the projection's node order, so a refresh does not reshuffle the
  graph.
- **View:** `src/components/projects/session-graph.tsx` uses React Flow 12.
  - Nodes cannot be dragged or connected, and Delete does nothing.
  - Selecting a node opens an inspector that lists its relations in words.
  - The graph refits when its panel resizes, until the person pans or zooms.
  - Below a readable zoom it starts at the top instead of shrinking.
  - "Show as list" gives the same graph as text, with no canvas (INPUT-02).

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Layout engine | ELK (elkjs, bundled, on the main thread as `lib/theorem/plans.ts` does) | Layered, tree and force layouts come from one engine with model-order constraints. dagre has only layered layout, and Graphviz needs WASM for no added layout here. dagre stays in `package.json`, unused by this change. |
| Renderer | React Flow 12 (already a dependency) | Accessible nodes, panning and zooming, and custom edges. gpucanvas would only pay off at node counts a project does not reach. |
| Pins | Per browser, in zustand persist | Theorem has no per-user pin route yet. The UI says pins are kept in this browser. |
| Unserved lenses | Present, and labelled with the reason | A lens that draws something made up would break VIEW-03. |
| Project-home tabs | URL search (`?view`, `?lens`) | Links and reloads keep the tab. |

## Not in this change

These are the backend half. They need Theorem routes, so they are not
fabricated here:

- `related_to`, `directs` and child-session relations: the Related and Team
  lenses, NAV-04, and REL-01 to REL-04.
- A project-wide delegation index: the Delegation lens.
- Per-user pins (§5.2): NAV-06 holds today only within one browser.
- Project documents, repositories, links and connections (§8.2).
- Graph editing, organization presets and governance (slices D and E).
