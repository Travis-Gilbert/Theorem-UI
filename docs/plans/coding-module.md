# The coding module: watch the agent work, talk to it without stopping it

The coding interface for Theorem UI. Two references set it:

- **Delta** (Zed Industries, https://delta.dev) for the interaction. You
  watch the agent write. You can message it mid-run without interrupting:
  the message lands at the agent's next step and the agent answers it, while
  its long jobs keep running. Finished work folds into one-line rows ("Thought
  twice, ran 3 commands") that open on demand.
- **pi's web transcript** (earendil-works/pi, MIT) for the look: a monospace
  transcript on a dark slate, tool rows with their output underneath that a
  key toggles, and highlighted code and diffs.

It is built on what Theorem UI already has:

- the Ratzilla/Ratatui terminal (`terminal/`);
- Theia with Monaco as the editor;
- TanStack Highlight for syntax.

The UI does not use CodeMirror. Theia is the IDE that stays, and the terminal
is the agent.

## Decisions

- **Editor and agent.** Theia's Monaco is the editor and the terminal is the
  agent. "Editable code blocks" means a code row in the terminal opens that
  range in Monaco beside it. There is no second editor inside the transcript.
- **Answers while the agent works.** The owner chose both answer paths, on
  2026-11-06:
  - A front agent answers quickly.
  - The agent doing the work takes the same message at its next step boundary
    and answers after a short delay.

  Two backend changes in Theorem make that work:
  - **B1, the run inbox.** It queues what the person sends during a run and
    delivers it at the next step.
  - **B2, steering.** `steer_work` now hands the front agent's instructions to
    the running worker's inbox. It used to restart the worker under a revised
    intent.

- **Syntax colours (a deviation from the approved chart).** U2 was charted
  with Theia's Stone palette but was built with pi's dark-theme syntax roles,
  converted from okhsl to sRGB on pi's slate.
  - What this costs: in IDE mode the terminal sits beside Monaco, so the same
    code shows in two palettes side by side.
  - The alternative: Stone dark for the terminal's code, which would make the
    two match.
  - Status: still open for the owner (see the checklist).

## Chart

| Node | Repo       | What                                                                                                                                                            | Oracle               | Status                          |
| ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------- |
| R0   | theorem-ui | References committed with ledger rows (lane, source and pin, author and license, hash)                                                                          | none                 | done                            |
| B1   | Theorem    | Run command `input`; delivery at step boundaries (`TurnHooks::take_input`); `user_input` parts with queued, delivered and not-delivered states; SDK regenerated | behavior tests       | built; see checklist            |
| B2   | Theorem    | `steer_work` with instruction-only direction queues into the running worker's inbox; capture refuses while direction is pending                                 | behavior tests       | built; see checklist            |
| U1   | theorem-ui | Prompt stays live during a run; sending, queued, delivered, not-delivered and next-turn lines                                                                   | interaction          | done                            |
| U2   | theorem-ui | TanStack Highlight tokens in the snapshot; highlighted code and diffs                                                                                           | static               | done (palette deviation above)  |
| U3   | theorem-ui | Compact activity (three or more tools in one row, a finished program in one row); ctrl+o shows each tool's output                                               | interaction          | done                            |
| U4   | theorem-ui | Caret where the agent is writing; a live spinner and status                                                                                                     | motion               | done                            |
| U5   | theorem-ui | IDE mode is Theia with the terminal docked on its right; Theia's chat closed there; one thread per tab; Follow tracks the active tab's run                      | static + interaction | done; Theia side not built here |
| U6   | theorem-ui | A tool row that names a file opens it in Monaco with its lines selected; Theia's Add to chat sends a typed reference to the terminal's next turn                | interaction          | done                            |
| V    | both       | The owner's scenario live: send a constraint mid-build, see it delivered at the next step, nothing cancelled; owner opens the collages and seals                | HITL                 | waiting on the owner            |

## Lanes and references

Every reference is in the **translation** lane. The source's mechanics are
re-expressed in the terminal crate's vocabulary; no classes, assets or code
are copied. The ledger is `evidence/coding-module/ledger.json`. Each row has
the reference's source and pin, author, license and the artifact's sha256.

| Reference                          | Source                                              | Pin                         | License                     |
| ---------------------------------- | --------------------------------------------------- | --------------------------- | --------------------------- |
| `refs/delta-activity@a9ddc22b.png` | Owner's Delta recording, frame at 16.5 s            | upload sha256 `a9ddc22b…`   | proprietary; reference only |
| `refs/delta-caret@a9ddc22b.png`    | Owner's Delta recording, frame at 0.2 s             | upload sha256 `a9ddc22b…`   | proprietary; reference only |
| `refs/pi-transcript@2a32a60.png`   | pi's session viewer (export-html template)          | earendil-works/pi `2a32a60` | MIT                         |
| `refs/pi-diff@2a32a60.png`         | pi's session viewer; colours from `theme/dark.json` | earendil-works/pi `2a32a60` | MIT                         |

The recording itself is not committed; its hash pins it. `badlogic/pi-mono`
redirects to `earendil-works/pi`, with the same head commit.

## Stories and oracles

Each terminal state is a story, at `/story/<id>` and listed at
`/stories.json`. A story is the real WASM terminal on a committed fixture
built through `snapshotOf`, so it draws exactly what a live thread would.

`scripts/stories/shoot.cjs` is the one driver. For each story it:

- takes the shot;
- presses the story's keys first, if it lists any;
- for a running story, takes two frames 400 ms apart and records how many
  pixels changed and where;
- for an interaction story, clicks the named text and records the action
  the terminal emitted.

The route keeps that action on `data-action`, and the driver writes what it
saw to `renders/oracle.json`.

`scripts/stories/collage.cjs` composes each story's collage. It puts the
story's references (from the ledger) beside its render, with what the driver
observed. A translation-lane collage has no perceptual diff against its
reference, because the content differs by design. The committed renders are
the baselines later changes are diffed against.

Run against a dev server, with Playwright and Chromium available:

```sh
node scripts/stories/shoot.cjs http://localhost:3000 docs/plans/evidence/coding-module/renders 2
node scripts/stories/collage.cjs http://localhost:3000 docs/plans/evidence/coding-module
```

| Story                      | Claim                                                                                                             | Oracle result (2026-11-06)                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| terminal-input-states      | Words sent mid-run show where the run took them; each one not yet taken says how far it got                       | static; spinner moves (85 px in 400 ms)                                |
| terminal-code              | Fenced code in pi's syntax roles; a diff marks added and removed lines                                            | static                                                                 |
| terminal-activity          | Finished work folds into compact rows; the caret marks where the agent writes; the status names what the run does | static; spinner moves (69 px)                                          |
| terminal-activity-expanded | ctrl+o unfolds every tool row with its output highlighted                                                         | interaction (ctrl+o); spinner and focused cursor move                  |
| terminal-program-streaming | The native agent's program streams in highlighted, caret at its end                                               | static; spinner moves                                                  |
| terminal-references        | A tool row is a link to its file; references wait over the prompt                                                 | interaction: clicking `edit_file` emits `open src/parser.rs` lines 2-3 |

The oracles found two bugs, both fixed:

- **The spinner never moved.** The frame index was `Date.now() / 80` cast
  to `usize`. On wasm32 that saturates at `u32::MAX`, which always selects
  frame 5. This predates this work (`a39a57a`).
- **Gold drew as grey.** A right-aligned hint drawn as a styled `Line`
  repainted the whole row in muted grey, so the gold status glyphs and
  reference labels lost their colour.

Before the fix, a malformed diff from a tool (hunk counts that disagree with
its lines) threw in jsdiff's `parsePatch` and took the transcript route down.
`openOf` now falls back to the range the tool was asked for.

## What is not verified

- **The Theia side of U5.** The `closeChatView` bridge method is written
  against Theia 1.76.0's `AIChatContribution.closeView()`. The Theia
  workspace was not installed, built or typechecked in this environment, and
  the docked split was not screenshotted with a real Theia frame.
- **V.** The live scenario needs a running Theorem with a model, and the
  collages need the owner's seal.
- **"Watch the agent type" depends on how the backend streams.** The native
  agent streams its program as deltas, but its answer arrives whole, as one
  `TranscriptEvent::Final { text }` (`crates/agent/src/turn_loop.rs`). The
  answer therefore appears in one jump. Streaming the answer's text deltas
  from the backend would give Delta's feel without a client-side typewriter
  that pretends.
