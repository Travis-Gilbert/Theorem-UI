# The Vault view

The Vault is a mode on the rail, beside Chat, Spaces and the IDE. It gives the
opened folders (plan D16 in `vault-dynamic-documents.md`) an Obsidian-style
workspace. It shows only where folders can open, which today means the desktop
app or the stub host.

## Layout

Every part of the Vault is a dockview panel. Panels can be moved, stacked as
tabs, split, floated, maximized or closed, and the arrangement is kept per
browser (`theorem-ui:vault`). The default arrangement follows Obsidian's three
columns:

| Where        | Panel                 | What it is                                                                                         |
| ------------ | --------------------- | -------------------------------------------------------------------------------------------------- |
| Left         | Files                 | `FoldersSection`: every opened folder and its live tree.                                           |
| Centre       | The open files        | `WorkspaceFileDockPanel`, so notes open in Milkdown Crepe and other files in their handler's view. |
| Right, top   | Outline, Links (tabs) | The followed note's headings; its backlinks, outgoing links and tags (`LinksPane`).                |
| Right, below | Graph                 | The folder's graph, drawn with cosmos.gl.                                                          |

- **The followed file.** The Outline, Links, Graph and status bar follow the file
  tab last brought forward. They keep following it while another panel has focus.
- **The empty tab.** While no file is open, the editor's place holds a "New tab"
  panel with New note, Today's note and Open a file. It comes back whenever the
  last file closes, so the centre column never disappears.
- **The rail.** On the Vault, the rail button shows and hides Files, as it does
  for other modes' panels.
- **Widths.** When a column closes or comes back, only the editor's width
  changes. The side columns keep theirs, as in Obsidian.

## Status bar

The bar along the bottom has two ends.

On the left:

- show or hide each panel: Files, Outline, Links, Graph;
- New note;
- Today's note;
- Open a file (the quick switcher);
- Search;
- Open folder;
- Reset layout.

On the right:

- the followed note's backlinks, which bring Links forward;
- its words and characters, counted with `Intl.Segmenter`;
- the folder's notes and attachments;
- whether its code is trusted, which opens Folder settings.

## Graph

The data comes from `GET /desktop/workspace/:id/graph`. The route returns every
note, with its title and tags, and each link once per note and target.
`lib/vault/graph-model.ts` turns that and the folder's file list into nodes and
edges. Obsidian's filters apply:

- tags;
- attachments (every non-note file, linked or not);
- orphans;
- unresolved links;
- a local graph of a given depth around the open note.

The default look follows Obsidian's global graph:

- a force-directed cluster of linked notes;
- the unlinked notes pushed out into a ring around it;
- neutral notes, green tags and yellow attachments;
- nodes sized by how much they link.

The simulation is seeded with the linked notes in a disc and the unlinked ones
on a ring just outside it. Points keep a fixed screen size. At the scale that
fits the whole ring, zoom-scaled points would shrink below a pixel. The camera
follows the layout while it settles, and refits when the panel is resized. It
stops following once the person pans or zooms; the fit button restores it.
Labels fade in as the view zooms past the fitted scale. Hovering a
node lights it and its neighbours and greys the rest. A click opens what the
node stands for:

- a note or attachment opens the file;
- a tag runs a tag search;
- an unresolved link makes the note.

### Why cosmos.gl, not Cosmograph

Cosmograph's packages (`@cosmograph/react`, `@cosmograph/cosmograph`) are
licensed CC-BY-NC-4.0, which rules out commercial use. `@cosmos.gl/graph` is
the MIT engine under Cosmograph: the same GPU force layout and renderer,
without the paid wrapper. Its companion `@interacta/css-labels` draws the
labels.

### Risk: Servo

cosmos.gl renders with WebGL2 through luma.gl. Servo 0.7's WebGL2 support is
the open question for the desktop window. The graph works in Chromium-based
browsers through the stub host. If Servo cannot run it, the graph panel needs
a fallback renderer there.

## Not yet

- The outline does not yet mark the heading the editor is scrolled to, as
  Obsidian's does. That needs the Crepe view to report its scroll position.
- On a phone the Vault shows the folders, and files open over them, as every
  workspace file does there. The dock is desktop-only.
