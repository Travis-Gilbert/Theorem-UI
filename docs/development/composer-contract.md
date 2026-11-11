# Composer and sending contract

The composer is a document that can be sent. Replacing its editor must preserve
the author's text, attachments, turn settings, and ability to recover a draft.
These are acceptance requirements, not a claim that every browser and service
combination has already been verified.

## Writing and submission

| Input                                                | Expected behavior                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Enter in the document                                | Continue writing: a paragraph, list item, or code line according to the editor's current block.              |
| Shift+Enter                                          | Insert the editor's line break; do not send.                                                                 |
| Ctrl+Enter or Cmd+Enter, including with Shift        | Submit through the same form admission as the Send button; Shift does not bypass admission or force a steer. |
| Enter while selecting a slash suggestion             | Select the suggestion; do not also submit the message.                                                       |
| IME composition or its commit key                    | Complete composition without sending.                                                                        |
| Keys in an auxiliary input, such as a link URL field | Belong to that control; do not submit the surrounding composer.                                              |

All submit shortcuts must use the form's admission policy. There must not be a
second direct call to the runtime that bypasses the selected model, context,
attachment readiness, pending-send guard, or active-run behavior. A blank draft
without an attachment is not a message.

Markdown serialization must preserve what the author meant: visible text,
formatting, literal punctuation, code, and line breaks. Test edited documents,
not only Markdown supplied to the editor as an initial value. Serialize and
reopen the result to catch text that turns into unintended Markdown structure.

## A send is one recoverable transaction

- Snapshot text, attachments, and turn configuration together before clearing
  the editor. Clicks and shortcuts admit one logical submission; rapid repeats
  must not create duplicate turns.
- Sending text during a run uses the active run's input inbox. It must not
  silently start a concurrent turn or interrupt the run. Explain that model and
  tool settings apply to the next turn. Attachments, quotes, and additional
  context are not supported by this text-only input path; leave the draft
  available and say when it can be sent.
- A known rejection restores the submitted draft to its original thread without
  overwriting text written since the attempt. An ambiguous network result keeps
  the original request identity for reconciliation; it must not invite a fresh
  duplicate send as though the server certainly rejected it.
- A first-attempt closed-run refusal can release the request for a later turn.
  A closed-run response to a retry cannot establish that the first attempt failed.
  Reconcile against saved run events using the original request key, run, input
  identifier, and text; an absent record or failed lookup remains uncertain.
- Show the uncertain message so the person can inspect what is being retried.
  An explicit **Stop retrying** or **Reset saved delivery state** may clear local
  recovery after the pending attempt settles and storage removal succeeds.
  Preserve the draft, say that delivery remains unknown, and never automatically
  send a new turn or cancel the current run as part of that action.
- Navigation, editor initialization, reload, and unmount must not replace a newer
  draft with an older serialized value. A sent draft must not reappear because
  an editor cleanup reports stale content.
- Editing a previous message preserves the intended attachments and branch
  target. Text-only edit coverage does not establish attachment-edit support.

## Evidence for a composer PR

Use the version in `packageManager` (currently Bun 1.4.3) and install with
`bun install --frozen-lockfile`.

A clean checkout needs the generated terminal bindings before typechecking.
Install the Rust version and target in `terminal/rust-toolchain.toml` (currently
1.96.1 and `wasm32-unknown-unknown`), then install the exact CLI version matching
`terminal/Cargo.toml`: `cargo +1.96.1 install wasm-bindgen-cli --version 0.2.127 --locked`.
Run `bun run build:terminal` to generate the real JavaScript, WebAssembly, and
TypeScript declarations in `src/terminal-wasm`. Do not substitute empty declarations
or exclude the terminal from the typecheck.

Then run `bun run test:composer` and `bun run typecheck`. The composer suite
includes the real SDK recovery and send-race tests in `src/lib/theorem`, as well
as the editor, composer, notes, and story tests.

For a changed behavior, add a regression that fails on the old implementation.
Use the real editor and send boundary where they meet; an idle runtime whose
`onNew` just records a callback cannot verify running, rejection, or recovery.
Keep the failure scenario small enough to reproduce without live model output.

The Bun suites use happy-dom. Run `node node_modules/playwright-core/cli.js install --with-deps chromium`
and `bun run e2e:composer --built` for the committed browser scenario, or set
`E2E_CHROMIUM` to an installed browser. It exercises real paragraph, list, and
CodeMirror keys, explicit submission, and editor controls against the actual
composer without a Theorem server or model call. It does not establish live
delivery, IME, or layout behavior. For those changes, record a browser check on
the tested commit with the relevant remaining cases:

- Type and paste, then submit immediately; verify the complete persisted text.
- Continue paragraphs, lists, and code; commit IME text; select a slash item.
- Send during a run, refuse a send, and switch threads with an unsent draft.
- Send an attachment, then edit that persisted message if edit handling changed.

Report the exact commit, commands, results, browser, and scenario in the PR.
Record blocked cases explicitly, including missing fixture routes or a service
that rejects an attachment. Screenshots show appearance; a successful build or
automated review does not establish these interaction requirements.

## Automation

`.github/workflows/composer.yml` installs the locked dependencies and runs the
terminal build, typecheck, composer suite, and native browser scenario for changes
to the listed editor, runtime, test, and dependency paths. It can also be run
manually. It does not configure repository merge rules. If the check is made
mandatory for every PR, move path selection inside the workflow so unrelated changes also report a
result instead of leaving a path-filtered required check pending.
