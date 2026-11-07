# A modular interface: pages made of modules

Theorem UI gets **Pages**: screens a person composes from modules, connects,
and saves. A module can be one that ships with the app, one written as files
in the vault, or a combination of others saved as one. The checklist is
`modular-interface.checklist.json`.

This is a first release. The owner's design (pasted with the request on
2026-11-05) is the requirement, together with these decisions:

| Decision                                                                      | Owner's words                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------- |
| Pages and modules are files in the Theorem vault, through the SDK's Files API | "It should like use the files api in the SDK"  |
| Puck builds pages; the chat dock and the Vault stay on Dockview               | "Puck for pages, keep Dockview (Recommended)"  |
| PRs #32 and #33 merged into this branch first                                 | "Merge #32 and #33 now"                        |
| Templates next, and Index and IDE modes become pages built from them          | "Start the template"; "Modes become pages too" |

## The concepts, kept apart

- **Module definition**: `id`, `version`, `label`, `settings`, `inputs`,
  `outputs`, `events`, `actions`, requested `capabilities`, `migrations`, and an
  implementation (built in, a sandboxed HTML page, or a composite). Contract:
  `src/lib/modules/contract.ts`; catalog: `src/lib/modules/registry.ts`.
- **Module instance**: one placement on a page. Its props hold its `id`,
  `title`, the version `v` its settings were saved under, its settings, `bind`
  (value bindings) and `on` (event routes). Props the host owns are reserved
  (`RESERVED_PROPS`), so no module setting can take them.
- **Page definition**: a durable file, `Pages/<name>.page.json`, schema
  `theorem.page/1`, with a title, a pin and a Puck layout. Pages share one route,
  `/pages/$pageId`, keyed by the vault entry id so a rename keeps the link. There
  is one **Pages** mode on the rail. Pages are not ShellMode branches, and they
  are not routes of their own.
- **Template**: a page layout to start from. Two are built in; others are
  page files in the vault's `Templates` folder (`src/lib/modules/templates.ts`).
- **Mode's page**: Index mode and IDE mode render from a page,
  `Modes/<mode>.page.json`, or from their template while there is none.
- **Resource binding**: a setting of kind `resource` names what an instance
  shows: an Index view, an object type, a vault file, a conversation or an App.
- **Connections**: declared in the page, per instance. There is no global bus.
  - A **value binding** (`bind`) reads another instance's output: a selection
    drives an inspector, for example.
  - An **event route** (`on`) sends an instance's event to another instance's
    action, or to one of two host actions, `composer.attach` and
    `composer.ask`.

## Three ways to get a module

1. **Configure** one: each module's settings, inputs and routes are Puck fields.
2. **Combine** them: place instances in a Split or Tabs and connect them. To
   reuse the result, select it while arranging and choose **Save as module**.
   The selection becomes a composite in `Modules/<name>/module.json`:
   - what crossed its edge becomes its named inputs, outputs and events;
   - a route from outside to an instance inside becomes one of its actions,
     which hands what it is given to that instance's action;
   - one instance of it takes the selection's place, wired as before.
     Its content is prepared as a page's is: a part this app does not have is
     held in place, and older settings are migrated.
3. **Create or install** a new implementation, without compiling it into the
   app. **New module** writes a starter `module.json` and `index.html` into
   `Modules/<name>/`, then opens that page in the code editor, as source,
   rather than in the viewer that would run it. Any folder there with a valid
   manifest is in the catalog as soon as the vault reports it. A manifest that
   arrives while a page is open joins the catalog without reloading the page,
   so nothing being arranged is lost.

## Connections, exactly

- **Types**: `text`, `number`, `boolean`, `json`, `item`, `reference`. When a
  source and a target differ in type, the binding must say `convert: true`.
  Nothing is converted silently (`src/lib/modules/values.ts`). A `pick` path
  reads into a `json` value.
- **Guards** (`src/lib/modules/runtime.ts`):
  - A binding that would close a cycle is refused while arranging, and one
    found in a saved page is reported (`connections.ts`).
  - Events handed round in a loop stop at depth 8. An event an instance
    sends within 5 seconds of an action reaching it continues that action's
    chain, so a loop through a module that answers later (a sandboxed frame,
    an effect) stops too. A person's pointer or key on the instance in
    between starts its next event afresh (`runtime.used`; a frame reports its
    own input as `module.used`, since it never reaches the page). A loop slower
    than that is the person's to stop.
  - An instance sending more than 30 events a second is stopped, with a
    notice.
  - Setting an output equal to its current value does nothing.
  - Action handlers are always the latest render's, so none acts on stale
    values.
- **No model call per click.** Nothing in the runtime calls a model:
  - `composer.attach` adds a context reference to the composer;
  - `composer.ask` adds it and puts the cursor in the visible composer.
    The person sends.
- **Problems** are reported against each instance's fields while arranging:
  a source that is gone, a missing conversion, a cycle.
- **One runtime per page view.** A view that React hides and shows again
  (StrictMode does this in development) keeps its runtime. The runtime stops
  when the view is hidden and resumes when it is shown, and each instance
  registers its routes and handlers again. Changing an instance's routes
  keeps the values it published; only its removal takes them.

## Chat as a module, without a second agent

The `theorem.conversation` module renders the app's one assistant-ui runtime.
It starts no agent and opens no thread of its own.

- Its setting either keeps the conversation that was open when it was placed,
  or follows whichever one is open.
- Only one conversation instance on a page drives the shared runtime. Any
  other says so instead of competing for it.
- The composer's draft belongs to the runtime, not to the view. Moving the
  module, or switching modes, keeps it.
- A selection never attaches itself to the composer. Only an event the page
  routes to `composer.attach` or `composer.ask` does.

## Untrusted modules

A vault module with a sandboxed implementation runs in an opaque-origin frame
(`sandbox="allow-scripts"`), loaded from a blob URL built by
`hostedAppDocument`, the same path conversation Apps take.

What the module asks for and what it may use are kept apart:

- **Requested** capabilities come from `module.json`.
- The person allows them item by item. Allowing nothing is a valid answer.
- A **grant** is held in this browser only, not in the vault. Pages and modules
  are written by agents as well as people, so a grant stored beside them could
  be granted by whoever wrote it. A grant names the SHA-256 digest of the exact
  manifest and page it was given for. Change either file and the module asks
  again.

What the module gets once it runs:

- The frame's network policy (CSP `connect-src`) comes from the grant. The
  module's own `theorem:uses` declarations do not count.
- The bridge (`src/lib/modules/sandbox.ts`) serves:
  - the block bridge's files and state calls, limited to the grant plus
    reading the module's own folder;
  - `module.output` and `module.emit`, for declared ports only, with every value
    parsed and type-checked.
- A module never starts agents (`run` is empty).
- The frame calls `window.theorem.module.onInputs`, `.onAction`, `.output` and `.emit`; a route to a declared action reaches it as `module.action`, and one that comes while the frame starts waits for it.

The person can **Stop** a running module, **Run** it again, or **Revoke** its
grant: from its toolbar on the page, or from the module list in the Pages
panel.

While a page is being arranged, no sandboxed module runs. Each shows a summary
of what it takes, gives and sends, and nothing any instance sends leaves the
page.

## Unavailable modules and revisions

- **Unavailable modules.** An instance whose module this app does not have is
  kept as a placeholder holding its original type and props (`prepareLayout`).
  It goes back into the file unchanged (`restoreLayout`). When the module
  arrives, the instance resumes. An older instance has its settings migrated by
  the module's `migrations`.
- **Revisions.** A page holds the revision it opened at:
  - A newer one in the vault is offered, with **Show it**; it never replaces
    what is on screen.
  - A save is made against the revision it started from. If someone else
    saved since, the page says so, and the person can **Keep mine** or **Use
    the vault's**.
  - The Index view module holds its view's revision the same way.
- **Unsaved arrangements** are kept outside the view
  (`src/lib/modules/drafts.ts`), by page. They survive:
  - opening another page or mode and coming back;
  - the file being renamed: the page stays open at its new path;
  - a newer revision that does not parse: the editor stays and says so.
    A save clears only what it wrote; an edit made while it runs stays unsaved.
    Leaving the app with one asks first, and the desktop app's quit check
    (`src/lib/desktop/unsaved.ts`) counts it. A page is saved only by the
    person, so the quit asks rather than saving it.

## Built-in modules

These wrap surfaces that already exist, rather than rebuilding them
(`src/components/pages/builtins.tsx`):

- Index view, Index inspector, Records table, Conversation;
- IDE (Theia) and Agent terminal;
- Vault file, App, Text, Value.

What the templates need from them:

- **Index view** is the whole Index column: the view, its search and its
  collections. Its "Moves with" setting keeps a place of its own, or follows
  the Index panel beside the rail while in Index mode (the `/index` URL). Its
  `selected` output is the item open in it. Its actions `select`, `deselect`
  and `openFields` open an item, close it, and open a type's fields.
- **Index inspector** sends `opened` (a linked item), `closed` and
  `editFields` (a type's id).
- **IDE** sends `added` with the reference when Theia's Add to chat is used.
  Its "Its chat" setting keeps Theia's own chat, or leaves the reference to
  whatever the page routes `added` to.
- **Agent terminal** takes `attach`: the reference goes to the active tab's
  next turn.
- **One place at a time.** Theia, the conversation and the agent terminal
  each show in one place. Any other instance says "… shows in another
  place." with **Show it here**. An instance is told apart by its page view
  as well as its id, since pages made from one template share ids and a
  mode's page can be open in use and in Pages at once.

The layout components are Split and Tabs. Two layout settings make a page
able to stand in for a mode:

- The page root can **fill the window** and set modules **flush, as one
  surface**, rather than as cards.
- A **Split** can keep one side at a fixed width. It can also **fold** its
  second side while nothing in it has anything to show (an inspector with
  nothing open). Folded, the side and its sash are hidden but stay mounted.

## Templates

- **Built in.** Index: an Index view that follows the panel, with an
  inspector beside it that folds while nothing is open. Its routes send
  closing, opening a linked item and Edit fields back to the view. Coding:
  Theia with the agent terminal beside it, and Theia's Add to chat routed to
  the terminal's next turn.
- **In the vault.** Any `Templates/<name>.page.json` that parses as a page is
  offered. **Save as template** writes the page as it is on screen there,
  under a free name, never over another file.
- **New page** offers Blank, the built-in templates and the vault's. A page
  made from one is a copy: changing it leaves the template as it was.

## Modes as pages

- Index mode and IDE mode render from `Modes/<mode>.page.json`, else from
  their template (Index and Coding). Chat and Vault mode are not pages.
- The Pages panel lists them under **Modes**, tagged **Arranged** when the
  file exists and **Built in** when it does not. Opening one arranges it
  like any page.
- **The first save creates the file only if there is none**
  (`expectedHash: null`). A file written since is a conflict, as for any page.
- **Reset to the default** removes the file, and the mode shows its template
  again.
- **A file that does not parse.** The mode shows its template and says why.
  A save replaces that revision of the file, and only that one.
- **Held arrangement.** The mode holds the arrangement it showed. One saved
  from this window shows at once. One saved elsewhere waits behind **Show it**.
- **The vault is not open.** The mode shows its template and says so.
- **Phones.** Below the desktop width, Index mode keeps the Index's own
  overlay inspector rather than its page.

## Not in this release

- **Other modes as pages.** Chat and Vault mode stay as they are.
- **Platinum.** It is out of scope. Platinum would share these contracts,
  which carry nothing web-specific in the files.
- **Sharing a page.** A shared page needs grants that follow a person, not a
  browser. Grants are per browser today.
- **A module gallery or marketplace.** "Install" means files in the vault.

Known limits of what is here:

- **Terminal width.** In IDE mode, the terminal's width is the Coding Split's
  saved size. It no longer follows the right drawer's width, and its minimum
  is the Split's 120 px rather than the old workbench's 380 px.
- **Reset is not revision-checked.** It removes the mode's file whatever
  revision is there.
- **Theia in two places.** With Theia placed in two open views (an IDE in a
  page and IDE mode, or two pages from the Coding template), one of them
  shows it and the other offers Show it here.

## Verification

See the checklist for what each item rests on. In short:

- **Unit and component tests.** `bun test` runs:
  - `src/lib/modules/modules.test.ts`;
  - `src/lib/modules/sandbox.test.ts`;
  - `src/lib/modules/store.test.tsx`, over the module catalog, templates and
    modes' pages against a fake vault;
  - `src/lib/modules/templates.test.ts`;
  - `src/components/index/navigation.test.tsx`, the Index view's own place;
  - `src/components/pages/page.test.tsx`, which renders through Puck's
    `Render` with the page runtime, including a Split folding, the
    built-in templates' connections, a saved module's actions and parts,
    and one surface across two views;
  - `src/components/pages/page-view.test.tsx`, the page editor against the
    fake vault: an unsaved arrangement through leaving, a rename, a revision
    that does not parse and a conflicting save, and an edit made while a
    save runs;
  - `src/lib/desktop/unsaved.test.ts`, the quit check, pages included;
  - the hosted-app network policy test.
- **Browser.** Checked on 2026-11-06 with Playwright (Chromium) against the dev
  server and a stub Theorem (see
  `docs/learnings/2026-11-03-run-a-worktree-against-a-stub-theorem.md`), not
  live Home. Nothing here has been observed on theorem.rs. What ran:
  - **A page from start to finish.** Create a page, arrange it, drag in a Text
    and a Value, bind the Value to the Text, save, finish, and reopen it from
    the Pages list. The value showed and followed edits while arranging, in
    use and after reopening.
  - **Held revisions.** A write from outside was offered with Show it and did
    not replace the page until chosen. A conflicting save said so; Keep mine
    wrote the page's version and Use the vault's showed the other.
  - **A sandboxed module.** New module wrote its two files. While arranging it
    showed only its summary. Run it started a frame with
    `sandbox="allow-scripts"`, a blob URL and an opaque origin, and its output
    reached a bound Value. Stop, Run and Revoke behaved as described. An
    outside edit of its page made it ask again.
  - **A composite.** Save as module on a Split gave the composite a named
    input for the binding that crossed its edge. One instance replaced the
    Split, and the value still arrived, in use and after a reload.
  - **The conversation module.** A second instance on the page said the
    conversation was shown elsewhere. A typed draft survived switching to
    Chat mode and back, arranging and finishing. A full reload clears it,
    since the draft lives in the session. The stub cannot answer a message, so
    nothing was sent.
  - **Templates and modes.** The Pages panel listed Index mode and IDE mode
    as Built in. Index mode opened in Pages with its template. Arrange, a
    change and Save wrote `Modes/index.page.json`, the row became Arranged,
    and `/index` rendered the saved page with the inspector folded. Reset to
    the default removed the file and the row went back to Built in. IDE mode
    rendered the Coding page at `/ide`. New page from Index and from Coding
    made pages with their Splits. Save as template wrote
    `Templates/<name>.page.json`, and New page offered it.
- **What the browser check found and fixed.**
  - Bindings made during a session never delivered. React's effect replay had
    disposed the page's runtime, which stayed in use. Fixed with the
    runtime's `resume`; `page.test.tsx` hides and shows a page to cover it.
  - Save as module lost what was being arranged. The new manifest made the
    catalog pending again and the page was swapped for its loading state.
    Fixed in `useInstalledModules`; `store.test.tsx` covers it.
  - New module opened its page in the viewer that runs it, which is blank
    outside the desktop app. It now opens in the code editor.
  - Empty component groups ("Installed", "Made from modules") are hidden.
  - The first save of a mode's page ended Arrange. The mode read the new
    file again and showed its loading state meanwhile, which replaced the
    editor. Two changes fixed it:
    - a save now gives the mode what it wrote;
    - a mode keeps what it showed while a file that has just appeared is read.
  - Found by the test for that fix: a mode's file removed and written again
    showed what was read of the old one. A new file at a watched path is
    now read again, and Reset drops what was read. `store.test.tsx` covers
    both.
- **What review found and fixed** (Greptile on PR #34). Each fix has a test
  that fails without it:
  - A rename emptied the page's read, and a revision that does not parse
    replaced the editor with an error, losing unsaved work. `usePage` keeps
    its last read through a rename, and the editor stays over a bad
    revision (`store.test.tsx`, `page-view.test.tsx`).
  - Leaving a page dropped its unsaved arrangement. Drafts are now kept
    outside the view (`page-view.test.tsx`, `unsaved.test.ts`).
  - A save cleared edits made while it ran (`page-view.test.tsx`).
  - Two views from one template both took Theia (`page.test.tsx`).
  - Changing a route unwired the instance and blanked what read its values.
    Routes now change in place (`page.test.tsx`, `modules.test.ts`).
  - A composite's content skipped `prepareLayout`, so a missing part and
    migrations were not handled (`page.test.tsx`).
  - Save as module dropped routes from outside into the selection. They now
    reach a composite action (`modules.test.ts`, `page.test.tsx`).
- **Not exercised.** These rest on source and unit tests only:
  - the Index view, Index inspector and Records table modules against real
    data (the stub's Index has no items, so the inspector never unfolded);
  - Theia and the agent terminal, and the Coding template's Add to chat
    reaching the terminal (the stub has neither: Theia answers 503 and the
    terminal is not built);
  - sending from the conversation module;
  - that a selection never attaches itself to the composer.
