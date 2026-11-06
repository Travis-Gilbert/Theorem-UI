# A modular interface: pages made of modules

Theorem UI gets **Pages**: screens a person composes from modules, connects,
and saves. A module can be one that ships with the app, one written as files
in the vault, or a combination of others saved as one. The checklist is
`modular-interface.checklist.json`.

This is a first release. The owner's design (pasted with the request on
2026-11-05) is the requirement, together with these decisions:

| Decision | Owner's words |
| --- | --- |
| Pages and modules are files in the Theorem vault, through the SDK's Files API | "It should like use the files api in the SDK" |
| Puck builds pages; the chat dock and the Vault stay on Dockview | "Puck for pages, keep Dockview (Recommended)" |
| PRs #32 and #33 merged into this branch first | "Merge #32 and #33 now" |

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
   - one instance of it takes the selection's place, wired as before.
3. **Create or install** a new implementation, without compiling it into the
   app. **New module** writes a starter `module.json` and `index.html` into
   `Modules/<name>/`, then opens the page to edit. Any folder there with a valid
   manifest is in the catalog as soon as the vault reports it.

## Connections, exactly

- **Types**: `text`, `number`, `boolean`, `json`, `item`, `reference`. When a
  source and a target differ in type, the binding must say `convert: true`.
  Nothing is converted silently (`src/lib/modules/values.ts`). A `pick` path
  reads into a `json` value.
- **Guards** (`src/lib/modules/runtime.ts`):
  - A binding that would close a cycle is refused while arranging, and one
    found in a saved page is reported (`connections.ts`).
  - Events handed round in a loop stop at depth 8.
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
- The frame calls `window.theorem.module.onInputs`, `.output` and `.emit`.

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

## Built-in modules

These wrap surfaces that already exist, rather than rebuilding them
(`src/components/pages/builtins.tsx`):

- Index view, Index inspector, Records table, Conversation;
- Vault file, App, Text, Value.

The layout components are Split and Tabs.

## Not in this release

- **Templates.** Making the shipped Index and coding layouts into page
  templates is the next step the design names. It is not done here.
- **Platinum.** It is out of scope. Platinum would share these contracts,
  which carry nothing web-specific in the files.
- **Sharing a page.** A shared page needs grants that follow a person, not a
  browser. Grants are per browser today.
- **A module gallery or marketplace.** "Install" means files in the vault.

## Verification

See the checklist for what each item rests on. In short:

- **Unit and component tests.** `bun test` runs:
  - `src/lib/modules/modules.test.ts`;
  - `src/lib/modules/sandbox.test.ts`;
  - `src/components/pages/page.test.tsx`, which renders through Puck's
    `Render` with the page runtime;
  - the hosted-app network policy test.
- **Browser.** The browser check ran against a stub Theorem (see
  `docs/learnings/2026-11-03-run-a-worktree-against-a-stub-theorem.md`), not
  live Home. Nothing here has been observed on theorem.rs.
