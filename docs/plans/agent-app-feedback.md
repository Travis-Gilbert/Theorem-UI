# The agent sees what it builds

The agent that writes an App gets the page's compiler and sandbox as its
own: it checks an App and reads what is wrong before a person does, the front
model can change an App itself, and a cell can drive the whole loop. The
checklist is `agent-app-feedback.checklist.json`. This follows
`app-database-and-compiler.md`, which put the compiler in the page.

The owner's direction (2026-11-10) is the requirement:

| Decision                                                              | Owner's words                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| The model gets the compiler's feedback itself, not through the person | "The model needs to be able to see it and get feedback directly"                                            |
| The front model can edit and build, not only a subagent               | "the front model needs to be able to edit and build as well ... If the task is small enough"                |
| A codemode cell is a way in, for the front model and for subagents    | "should be able to use a codemode ... cell to write typescript to be compiled directly in the WASM browser" |

## What was true before (read 2026-11-10)

- **An App is published by one call.** A builder worker calls `complete_work`
  with `app: {title, html}`; the server stores it without building or checking
  it (`conversation_work/execution.rs`). Only a builder can publish.
- **The compiler is in the page.** esbuild-wasm builds an App and tsrs checks
  it when the page hosts it. In the conversation a new revision gets a passive
  preview with no type check; the problems list runs only once a person opens
  the App. The agent hears of a problem only when the person presses Ask to
  fix.
- **A turn can already ask the page to do something.** Client operations
  (`theorem-surface-contracts` `client_operation`): the page declares
  operations on its send, each becomes a tool of the turn, a call streams to
  the page, and the page answers with a receipt whose `result` is the tool's
  result. The owner's turn waits 120 seconds, a visitor's 20. Kit uses this.
- **Workers have no client operations.** A worker's tools are a fixed list
  and its run is not the conversation's.
- **Cells are QuickJS, and not in chat.** `codemode-kernel` runs TypeScript
  cells on QuickJS (types stripped with `deno_ast`, not checked), reachable
  through MCP and the `theorem-cell` CLI. A chat turn has `execute_program`,
  which is Python (Monty). The `js_cell` tool is declared and has no executor
  in a chat turn. Nothing in Theorem uses Boa.

## Step 1: `app.check`, the page's compiler as a tool (this repo)

Built 2026-11-10.

- The page declares `app.check` on every send, beside Kit's operations
  (`lib/theorem/client-surface.ts`). The turn's tool is `app__check`.
- It takes `html`, a draft exactly as it would be published, or `documentId`,
  a published App as it is saved now, and `runMs`.
- The page builds the App, checks its types when it is built from source, and
  runs it off screen for a moment (`lib/blocks/app-inspect.ts`). The run
  reaches no network, keeps its state in the frame, and gets an empty
  in-memory database, so a check changes nothing and never opens an App's own
  records.
- The result is JSON: whether it built, the build, type and runtime problems
  with file, line and column, and the text the App showed, a line for each
  block and table row.
- A check that finds problems is `applied`; `failed` is a check that could
  not be made.
- The conversation shows a chip for each check and what it found.

No server change is needed for the front model to use it: a declared
operation is already a tool.

## Step 2: the front model publishes (Theorem repo)

- A native operation for the conversation turn, `publish_app`: a title, the
  HTML, and optionally the document of an App to revise. It reuses
  `conversation_apps::publish` and the fields `complete_work.app` validates.
- A build failure refuses the publish; type and runtime problems do not. The
  server cannot build, so it asks the page: when the page declared
  `app.check`, the operation runs it first and refuses with the build
  problems. Without a page that can check, it publishes and says the App was
  not checked.
- Which regime the web UI's turns run in, and whether that regime admits a
  write operation, is settled before this is written.

## Step 3: a subagent gets the same feedback (Theorem repo)

- A builder's `app.check` is routed through the conversation turn that
  started it, whose page answers.
- `complete_work` with an App is checked the same way before it settles, so a
  builder that submits one that does not build gets the problems back and
  repairs it in the same attempt.

## Step 4: cells (Theorem repo)

- `js_cell` gets an executor in a chat turn and in a worker: QuickJS in
  hosted mode, whose `tool(name, args)` calls reach the turn's tools with
  their own authority, as a Monty program's host functions do. `app__check`
  and `publish_app` are among them.
- The cell's TypeScript is run by QuickJS on the server. What the page's
  compiler checks is the App the cell assembles. Checking the cell's own types
  with the page's tsrs is a further operation (`ts.check`), not in this step.
- The conversation draws a cell: its source, and what each call returned.

## Decisions made while building, open to change

- **No page, no check.** When no page answers, the tool says the check was
  not made. A server-side build and check would close this; it means the
  server carrying the UI's build rules and declarations, and is not in this
  plan.
- **The run is against an empty database.** A check of a published App does
  not read the person's records. It finds what an App throws on its own, not
  what it throws on particular data.

## Verification

1. A real browser: the hidden check reports a clean App, type errors, a build
   failure and a thrown error at their places, and leaves no frame and nothing
   in storage. Observed: `bun run e2e:app-ts`, dev and `--built`.
2. A live turn: the front model calls `app__check` on a draft and reads the
   result. Needs the deployed stack.
3. A live turn: the front model publishes a small change with `publish_app`.
4. A live builder: a broken App is refused at `complete_work` and repaired
   without the person.
5. A live turn: a cell assembles, checks and publishes an App.
