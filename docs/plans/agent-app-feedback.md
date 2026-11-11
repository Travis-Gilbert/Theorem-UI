# The agent sees what it builds

The agent that writes an App writes it as code and sees what the page's
compiler and sandbox made of it, in the same turn, with nothing between the
code and the App. The front model can change an App itself, and a subagent
works the same way. The checklist is `agent-app-feedback.checklist.json`. This
follows `app-database-and-compiler.md`, which put the compiler in the page.

The owner's direction (2026-11-10) is the requirement:

| Decision                                                              | Owner's words                                                                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The model gets the compiler's feedback itself, not through the person | "The model needs to be able to see it and get feedback directly"                                                                                                     |
| The front model can edit and build, not only a subagent               | "the front model needs to be able to edit and build as well ... If the task is small enough"                                                                         |
| The model writes code, in a Boa cell, and the browser compiles it     | "should be able to use a codemode boa cell to write typescript to be compiled directly in the WASM browser"                                                          |
| The browser is where it compiles                                      | "The decision to compile it in the browser was in the original plan documents"                                                                                       |
| Boa, not QuickJS                                                      | "QuickJS is slated to be replaced by Boa ... can you install Boa and use that in place of QuickJS?"                                                                  |
| No step between the code and the App                                  | "I'm not sure that there needs to be a tool call in between the model writing JavaScript and the creation of the artifact, with the exception of call it a subagent" |

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
- **Cells were QuickJS, and not in chat.** `codemode-kernel` ran TypeScript
  cells on QuickJS (types stripped with `deno_ast`, not checked), reachable
  through MCP and the `theorem-cell` CLI. Nothing in Theorem used Boa, though
  `SPEC-THEOREM-CONTEXT-ENGINE-2.0` (NC1 to NC4) had ratified the swap.
- **A turn is already a program.** In the native agent the model's reply is
  either final text or a program (`ModelDecision::Program`,
  `crates/agent/src/program_turn.rs`): the model writes the program as its
  reply, the host runs it against the turn's operations, and what it returned
  is the next thing the model reads. Native tool calls are compiled into the
  same shape. The language is `monty` (Python), and the transcript event names
  its language so that "TypeScript on Boa" can be another
  (`crates/agent/CRATE.md`, "Program language"). This is the place where a
  model writes code with no tool call around it.

## Step 1: the page's compiler answers a turn (this repo)

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
- The result also carries an outline of the page as assistive technology
  reads it: each thing with its role, its name and its state, and the place
  in the source that made it (`lib/blocks/sandbox/outline.ts`). The frame
  reads it from the live page. Added 2026-11-10 on the owner's direction that
  the model "literally see what it has built".

A declared operation is already a tool of the turn, so the front model can
call this today. That is not the design's end state: a separate call to check
is the step the owner does not want between the code and the App. What step 1
leaves standing is the mechanism underneath, a turn asking the page to build
and getting the findings back, which step 4 uses without the model asking.

## Step 2: Boa runs cells (Theorem repo)

Built 2026-11-10 on `feat/boa-cell-engine` (Theorem pull request 1008). Its
cell unit tests, worker tests and `theorem-cell`'s suite pass there; the
container images and `rustyred-thg-mcp`'s cell tests were not run.

- `codemode-kernel`'s cell runtime is Boa with Oxc for the TypeScript step.
  `rquickjs` and `deno_ast` are gone from the workspace, and a cell builds
  with no C toolchain.
- Boa has no heap ceiling and cannot be interrupted, so each cell runs in a
  worker process (`theorem-js-cell`): the worker's allocator ends it past the
  memory limit, the parent ends it past the deadline, and both stay the typed
  refusals they were.
- Boa 0.22 and not the spec's 0.21: 0.21 cannot be resolved in one build with
  Monty 1.4.0 (they need different `icu_properties` 2.x releases). Oxc 0.152
  is the newest the repository's rustc 1.96.1 pin builds. Both are the
  owner's to confirm.

## Step 3: a turn can be a TypeScript program (Theorem repo)

- A program names its language. `monty` runs as it does now; `typescript`
  runs in a Boa cell, hosted, with the turn's operations as the cell's
  `tool(name, args)` and under the authority a Monty program has.
- The front model and a worker both get it. Which language a role writes is
  that role's instruction, not a new tool.
- The conversation draws a TypeScript program as it draws a Monty one, with
  its source highlighted in its language.

## Step 4: writing the App is the App (Theorem repo and this repo)

- A program has `app`. `app.write(files)` and `app.edit(file, old, new)` save
  a revision of the conversation's App, and that write is the publication:
  there is no `publish_app`, and a builder no longer submits an App through
  `complete_work`.
- Each write is built by the page, which is the only place it can be, and
  the write returns what step 1's check returns: whether it built, the
  problems with file, line and column, and the text it showed. The model
  reads that as the value of the line it wrote and goes on in the same
  program.
- `app.read()` gives a program the App as it stands, which is how the front
  model takes over what a subagent handed back and changes it on the spot.
- The front model's role admits writing an App (the owner, 2026-11-10: "the
  front model should get a publishing capability"). Today the role's policy
  (`organization_runtime::front_policy`) refuses writes and
  `conversation_apps::publish` commits an App only together with a worker's
  receipt, so this is a second way in at the owner of `conversation_apps`,
  bound to the turn, and one more tool in the front role's policy.
- With no page open, a write is saved and says it was not built.

As built (Theorem pull requests 1010, merged, and 1018):

- The operations are `read_app` and `write_app`, which a program calls as it
  calls any operation (`tool("write_app", {...})` in TypeScript). There is no
  `app` object. A write takes the whole App document as `html` and the
  revision it read, and is refused when that revision is no longer the head.
- With 1018 a write's result has `check`: what the page's `app.check` found
  when it built that document, in the same call. With no page that offers the
  check, or with `check: false`, `check` is null and `notChecked` says why.
- Not built: `app.edit`, so a change is a read and a whole write; and a
  `picture` on the write, which waits for 1013 and 1018 to both be on main.

## Step 5: a subagent gets the same feedback (Theorem repo)

- A worker's program has the same `app`. Its builds are answered by the page
  of the conversation that started the work.
- Starting a subagent stays a call (`start_work`), which is the exception the
  owner named.

As built (Theorem pull request 1020 and this repo's 69):

- A Builder is handed the operations the page declared on the turn that
  started it, those that only read, so its run has `app__check` and its task
  says to check the App before handing it back. It still submits the App
  through `complete_work`; it has no `write_app`.
- The Builder asks on its own run, which is not a message of the
  conversation. While a specialist's card is live the page follows that run
  by its id and answers its checks. A check waits 60 seconds for the page.
- Tested on the server with only the model's replies scripted
  (`page_check_tests`): a Builder's run calls the check, the test answers as
  the page does on that run, the model reads what was found and hands the App
  back. Tested here without a server: the page reads pending requests off a
  specialist's run. Not observed: a browser page answering a Builder, or a
  live model.

## Seeing the App

The owner's direction (2026-11-10): the model should see what it made, by
the accessibility tree, by vision, or by the harness's visual perceiver.

1. **The outline** (built, step 1). Text, so every model reads it, and it
   names real elements. The harness's own `perception_visual` README puts the
   tree first on web surfaces and the perceiver where there is no tree.
2. **A picture, for a model with vision.** An outline cannot say whether the
   layout is right.
   - This repo (built, `feat/app-picture`): `app.check` takes `picture: true`
     and its result then has `picture`, the App's snapshot drawn by the
     browser, as `{type: "image", mediaType, data, width, height}`. PNG, or
     JPEG where the PNG is over 1 MiB of base64. A real Chromium draws the
     fixture's layout and its canvas (`bun run e2e:app-ts`).
   - Theorem (built, pull request 1013, stacked on 1012): a receipt's result
     is JSON, and JSON is text to a model, so the turn takes a picture of
     that shape out of a result and gives it to the model as an image after
     the result. It is kept out of what the run saves. Only a model the
     catalog records as reading images is sent one; OpenRouter's directory
     says which do, and the model list the interface reads now reports it.
     A chat-route test shows the picture in the model's next request as an
     image and absent from the thread.
3. **The visual perceiver on that picture** (`perception_visual`, reached
   through `THEOREM_OMNIPARSER_URL`), for a model without vision and for what
   is drawn on a canvas, which has no tree. Built in Theorem pull request
   1014, stacked on 1013: a model that is not sent a picture is told what
   the perceiver read from it, as lines of text and controls with where each
   is. Tested against a perceiver stood up in the test; the perceiver service
   itself was not run, so what it reads from a real App is not observed.
4. **Acting.** With elements named, a program can press and type and read
   the outline again, which tests what the App does and not only what it
   shows.

## Not decided

- **Where a cell runs.** Steps 3 to 5 run the cell on the server and send
  each build to the page. Boa also builds for WebAssembly, so the page could
  run the cell itself, beside the compiler and the App's database, and reach
  an App's records directly, which a server cell cannot. The page already has
  a JavaScript engine and a sandbox, so Boa there buys the same language and
  limits on both sides at a cost of several megabytes.
- **Checking the cell's own types.** Boa runs a cell with its types erased.
  The page's tsrs could check the program before it runs.

## Decisions made while building, open to change

- **No page, no check.** When no page answers, the tool says the check was
  not made. The compiler is in the browser by the owner's decision, so a
  build needs a page.
- **The run is against an empty database.** A check of a published App does
  not read the person's records. It finds what an App throws on its own, not
  what it throws on particular data.

## Verification

1. A real browser: the hidden check reports a clean App, type errors, a build
   failure and a thrown error at their places, and leaves no frame and nothing
   in storage. Observed: `bun run e2e:app-ts`, dev and `--built`.
2. Boa cells: the kernel's cell tests and the worker tests pass, with the
   memory and deadline refusals held by the worker. Recorded in the Theorem
   pull request.
3. A picture: a real browser draws the fixture App's layout and canvas into
   the check's result. Observed: `bun run e2e:app-ts`, 21 of 21, the picture
   about 25 KB of base64. Theorem's chat-route test
   (`picture_flow_tests`) shows a scripted model's next request carrying a
   receipt's picture as an image. Not observed: a live model shown one.
4. A live turn: the front model writes a TypeScript program whose
   `app.write` returns the page's findings, and repairs a type error without
   the person. Needs the deployed stack.
5. A live turn: the front model reads an App a subagent published and
   changes it.
6. A live builder: a worker's program writes an App, reads a build failure
   and repairs it in the same attempt.
