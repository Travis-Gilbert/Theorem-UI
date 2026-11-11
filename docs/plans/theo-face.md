# Theo's face

Theo is the face Theorem wears in this app: two eyes made of particles, drawn
with luma.gl, that the agent, the person and the page's own events can all
move. Nothing in it is a fixed list of emotions. A face is built from shapes,
shapes are moved by continuous channels, channels are moved by programs over
time, and programs are started by the agent, by a hand, or by reaction rules
that weigh what has been happening lately. Each of those four layers is data,
so each can hold something nobody wrote in advance.

The checklist in `theo-face.checklist.json` tracks this spec item by item.

## Sources

- The owner's request of 2026-11-11: an avatar with the expressive face of a
  small robot; composable; able to show facial features that were not
  programmed into it; luma.gl for most of the presentation; something a person
  handles directly and a model controls at will, by tool call or from code
  mode (TypeScript on Boa, Monty, Blaze); reactions that differ with what came
  before and with what is ordinary in this person's environment; expressions
  that can be programmed later.
- The owner's design note pasted with the request ("Theorem can have
  expressions that nobody individually programmed"): expression as a
  performance over time; identity kept apart from expression; channel
  semantics (absolute, additive, blend); one face per shell with one owner;
  explicit status beside the face; receipts for what ran, not what was
  admitted.
- **The robot reference has not reached this repo.** The request pointed at a
  picture that was not attached. Until it is filed under
  `docs/plans/evidence/refs/` with its hash in the ledger, the identity in
  "Identity" below is a placeholder and no fidelity collage can be made. The
  reference is for expressive range (how much two eyes can say), not for the
  robot's likeness: Theo's shapes, spacing and palette are its own.
- What is already here and is reused, not rebuilt:
  - `src/lib/kit/operations.ts`: Theorem's client operations. A page declares
    operations on its send, each becomes a tool of the turn, a call streams a
    `client_operation` part, and the page answers with a receipt.
  - `src/lib/kit/facts.ts`, `liveness.ts`, `store.ts`: run facts gathered
    across every mounted conversation, the liveness derived from them, and the
    agent's `theorem-expression` part (pose, energy, breath, tilt, gaze, hue).
  - `src/lib/kit/stage.ts`, `src/components/kit/kit-stage.tsx`: a fixed layer
    over the shell with named perches, a figure the person can pick up, and a
    scene the agent can read.
  - `src/lib/life/energy.ts`: pulses that lift a level and decay with a
    half-life. The reaction model below is the same arithmetic, kept per kind
    of event.
  - `scripts/story-oracle.mjs` and `src/stories/`: addressable stories over
    committed fixtures, shot and diffed by one driver.
- luma.gl 9.3: `@luma.gl/core`, `engine`, `shadertools` and `webgl` 9.3.6 are
  already in `bun.lock` as peers of `@cosmos.gl/graph` 3.5.1, which accepts
  `~9.3.0` only.
- Prior work the design note cites: Xpress (language models authoring timed
  expressions for a 28-degree-of-freedom face; real-time use fell back to a
  pre-generated bank), Disney Research's layered gaze building blocks, and
  Kismet's continuous interpolation between expressions.

## Shape

One face per shell. It lives in the fixed layer Kit's stage already owns, in a
small canvas of its own that is moved by a CSS transform, so travel across the
page costs no redraw of anything else.

- **At rest** it sits in the gutter of the live assistant message, where
  `Icon.Speaker` (a folder) is drawn today. Earlier messages show a still mark
  of the same eyes, drawn as SVG from the identity, so history mounts no
  canvases.
- **It can leave**: to the composer, to a source or an artifact it is looking
  at, to a free spot the person dropped it on, or to a park position.
- **It always has words.** A `role="status"` node says what Theo is doing, as
  Kit's does. Connection and run state stay in the interface's own text; the
  face never carries them alone.

## The four layers

### 1. Shapes: what a face is made of

A face is a list of **features**. A feature is one closed shape that particles
fill, and every feature is the same primitive:

- a **contour**: a periodic curve through 8 radii around a centre, so one
  primitive is a circle, a slit, a teardrop, a wedge or a bean;
- two **lids**: an upper and a lower curve (height, tilt, bow) that cut the
  contour. A raised, bowed lower lid makes the smiling arc; a tilted upper lid
  makes a glare;
- a **hollow**: an inner radius, for a ring or a pupil that is a gap;
- a **transform**: place, turn, scale, relative to the face or to another
  feature;
- a **share** of the particle budget.

The two eyes are two features. They are not special. A brow, a mouth, a tear,
a blush, a spark over the head are the same primitive with other numbers, and
the agent can add one for the length of a performance and take it away again.
When shares change, particles leave one feature and fly to another, which is
the transition. This is what lets the face show a feature nobody built: a
feature is described, not implemented.

Every particle keeps a fixed seat in its feature (an angle and a depth from 0
to 1), from a seeded generator. Its target is that seat mapped through the
feature's current contour and lids. A spring carries it there. Seats never
change, so a shape can change completely and each particle still has one
continuous path.

### 2. Channels: the instrument

Every number above is a **channel** with a name, bounds, a rest value and a
blend rule. Names address meaning, never particles: `eye.left.open`,
`eye.right.lid.upper.tilt`, `gaze.x`, `face.tilt`, `matter.cohesion`.

| Group    | Channels                                                                |
| -------- | ----------------------------------------------------------------------- |
| Feature  | contour radii, lid height, tilt and bow (upper, lower), hollow, share   |
| Place    | feature offset, turn and scale; face position, tilt, scale, lean, bob   |
| Gaze     | target (a point or a named thing on the page), offset, reach, vergence  |
| Matter   | cohesion, drift, jitter, particle size, glow, hue shift, trail          |
| Autonomy | blink rate, saccade size, breath depth (how much the face does unasked) |

Blend rules are part of the channel, so two writers never fight silently:

- `set`: the highest layer that holds the channel wins; others wait.
- `add`: offsets sum (a saccade on top of a gaze target, a breath on top of a
  lid).
- `scale`: factors multiply (a blink closes whatever openness is underneath
  and gives it back).

Layers, lowest first: **identity** (rest values), **mood** (slow, from the
reaction model), **reaction**, **performance** (the agent's), **hand** (the
person, while they hold a control or the face). Blink, saccade and breath are
`add` and `scale` writers beside the stack. A layer that lets go of a channel
does not snap: the spring's target becomes the next layer's value.

Every channel moves through a spring, and a program only ever moves the
spring's target. So interruption is not a special case. A new target keeps
the velocity the old one left.

### 3. Programs: expression over time

A performance is a small tree, as JSON:

| Node      | Does                                                                    |
| --------- | ----------------------------------------------------------------------- |
| `to`      | moves named channels to values over a time, with an ease                |
| `hold`    | keeps what is held for a time                                           |
| `seq`     | children in order                                                       |
| `par`     | children together; ends with the longest                                |
| `stagger` | children together, each delayed (one eye leads the other)               |
| `look`    | points gaze at a thing on the page, a point, the cursor or the person   |
| `feature` | adds, reshapes or removes a feature                                     |
| `use`     | plays a named performance, with arguments and an intensity from 0 to 1  |
| `vary`    | jitters its child's values and times within a stated range, from a seed |
| `repeat`  | plays its child a number of times, or until released                    |
| `release` | gives channels back to the layer below                                  |

Named emotions are entries in a book of performances, each one such a tree
with parameters. `use: curious` is a shortcut the agent may take; writing the
tree is always allowed and needs no name.

A program is checked before it starts: known channels, values clamped to
bounds (the clamps are reported, not hidden), at most 64 nodes, at most 6
features, at most 15 seconds (a run waits 20 seconds for a receipt, as
`CHOREOGRAPHY_MS` already allows for). `repeat` until released is admitted
only on the mood and reaction layers.

### 4. Reactions: the same event, a different answer

The page feeds one stream of typed events: the person (pointer near, poke on a
feature, stroke, pick up, drop, typing, send, scroll, selection), the run
(start, text, reasoning, tool call, tool error, approval asked, done,
cancelled), and the environment (tab hidden and shown, window resized, theme
changed, offline, hour of day, how long idle).

**What it remembers.** For each kind of event, three decayed rates: over
seconds, over minutes, and a baseline over days that is kept in
`localStorage`. From them:

- **novelty** falls as the short rate rises, so the fifth poke in a row gets
  less than the first;
- **surprise** is how far the minutes rate stands from this device's baseline,
  so forty tool calls startle the face for a person who rarely runs any and
  pass unremarked for one who always does;
- **mood**: three slow numbers (arousal, valence, focus) that events push and
  time relaxes. Mood writes the mood layer: lower arousal lowers the lids and
  slows the blink; a run of errors tightens cohesion and narrows the eyes.

**What it does.** A reaction rule is data:

```json
{
  "on": ["poke", "poke", "poke"],
  "within": 2000,
  "when": "novelty.poke < 0.3",
  "do": { "use": "dizzy", "intensity": "1 - novelty.poke" },
  "cooldown": 8000,
  "weight": 2
}
```

`on` is one kind or a short sequence. `when` reads novelty, surprise, mood and
liveness. `do` is a program whose numbers may be expressions over the same
values. When several rules match, one is drawn by weight from a seeded
generator, a rule that just played is drawn less, and a cooldown keeps it from
repeating. So a first poke gets a blink and a look; a quick fifth gets
something else; a poke after ten idle minutes gets a start. None of the three
is the "poke reaction".

The rule book ships with defaults. The person can edit it, and the agent can
add to it, which is how the face learns a reflex nobody thought of.

## Who moves it

| Mover                     | How                                                                                                     | Layer       |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| The model, by tool call   | `face.*` client operations, declared on the send beside `kit.*`                                         | performance |
| The model, in code mode   | the same operations as `tool('face.perform', …)` inside a Boa, Monty or Blaze program                   | performance |
| The model, without a tool | the `theorem-expression` part it already writes (energy, breath, tilt, gaze, hue) maps onto channels    | mood        |
| The person                | pointer and keyboard on the face; the bench                                                             | hand        |
| The page                  | reaction rules over the event stream                                                                    | reaction    |
| The face itself           | blink, saccade, breath, and an idle glance now and then, at the rate ADDENDUM-1 allows Kit's own shifts | autonomy    |

### Operations

| Operation      | Arguments                                        | Receipt says                                              |
| -------------- | ------------------------------------------------ | --------------------------------------------------------- |
| `face.perform` | a program, or a name with arguments              | started; then completed, interrupted (by what) or refused |
| `face.set`     | channels and values, a time to get there, a hold | the values after clamping                                 |
| `face.look`    | a surface id from the scene, a point, `cursor`   | whether the target is on screen                           |
| `face.feature` | add, reshape or remove one feature               | the feature's id and the share it got                     |
| `face.move`    | a perch, a free point, or `park`                 | where it ended up                                         |
| `face.define`  | a named performance or a reaction rule to keep   | the name, and what it replaced                            |
| `face.read`    | nothing                                          | channels, mood, recent events, names in the book, bounds  |

A receipt reports what the browser did. Admitted, started, completed,
interrupted and failed are five different answers, and the model reads the one
that happened.

Code mode needs nothing of its own on this side: a cell already reaches the
turn's operations through `tool(name, args)`. A cell can therefore loop, read
the face, and change a performance on what it reads. Typed builders for the
program tree inside a cell belong to the kernel in the Theorem repository and
are listed under "Not yet".

### The person's hands

- The face is a focusable button, as Kit is. Enter or Space pokes it; arrow
  keys move it; Escape parks it.
- The pointer near it draws the gaze. A press inside one eye is a poke on that
  feature, so that eye flinches and the other does not.
- Drag moves it and drops it anywhere; a quick release throws it and it
  settles. Dropped over text or the composer, it slides to the nearest clear
  spot (`src/lib/free-spot.ts`).
- **The bench** is a panel (and a story) with every channel as a control, the
  running program as editable JSON, capture of the current pose, and save to
  the book under a name. Touching a control takes that one channel to the
  hand layer while the rest of the performance plays on.

### One face, one owner

The face is the agent's, not a conversation's, as Kit is. Facts come from
every mounted conversation; deliberate performances are taken only from the
focused one. Each carries its run id and a generation, and a callback from an
older generation can no longer write. The hand outranks everything while it
holds.

## Identity

Identity is one data file: the features at rest, their spacing, the particle
count and size, the palette (from the theme's tokens, resolved as
`mount-life.ts` resolves them), and the manner (spring stiffness and damping,
blink rate, how far the autonomy channels sit). Expression deforms identity
and always returns to it. Changing how Theo looks is a change to this file and
to nothing else.

The placeholder until the reference arrives: two tall rounded eyes, slightly
apart, in the accent colour, about 1,200 particles each.

## Decisions

| Decision               | Choice                                                                                                                   | Why                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| luma.gl version        | 9.3.6, added as direct dependencies at the version already locked                                                        | cosmos.gl's peer range is `~9.3.0`. The study's 9.4.2 would put a second luma in the bundle beside the Vault graph's                                           |
| Where motion is solved | On the CPU, in typed arrays: channels, springs and particle targets                                                      | A few thousand particles cost little; the solver then runs in `bun test` with no GPU, and one solver feeds both renderers                                      |
| What luma draws        | Instanced soft points from one buffer written each frame; glow, colour and shimmer in the shader                         | The request is luma for presentation. The shader holds nothing a test would need to see                                                                        |
| Fallback               | Canvas2D over the same arrays, labelled in the status node                                                               | Servo 0.7's WebGL2 is the open question `vault-view.md` already records for the desktop window                                                                 |
| Canvas                 | One small canvas moved by transform, not a window-sized one                                                              | One WebGL context for the face whatever it does; travel is compositor work                                                                                     |
| Frame loop             | Runs while a spring is awake or a program plays; idle shimmer at a lower rate; stopped when hidden or off screen         | Kit paints on timers between frames. A face that always animates must not cost a frame loop to a person who is reading                                         |
| Tween or spring        | Programs move targets, springs follow                                                                                    | Interruption and blending need no rules of their own                                                                                                           |
| Expression language    | A JSON tree, validated by zod from a JSON Schema                                                                         | The same schema is the tool's `inputSchema`, the bench's editor check and the book's file format                                                               |
| Contract home          | `src/lib/face/contract/` in this repository first; moved to `theorem-surface-contracts` with ts-rs types once it settles | The page declares its operations on the send. Whether the authority admits a namespace it has no declaration of is the first thing to verify (see "To verify") |
| Book and rules         | Defaults in code; the person's and the agent's additions in `localStorage`                                               | Useful before any backend work. A durable book in Theorem is under "Not yet"                                                                                   |
| Kit                    | Stays. A setting picks the figure: Theo or Kit                                                                           | Both read the same facts and stand on the same stage. Whether Kit retires is the owner's call (see "Open")                                                     |
| Randomness             | One seeded generator per face, injectable                                                                                | "Not the same every time" and "repeatable in a test" are both required                                                                                         |
| Tests                  | `bun test` over the pure modules; stories with a frozen clock for the oracle                                             | No new test runner                                                                                                                                             |

## Files

```
src/lib/face/
  channels.ts     channel table: names, bounds, rest, blend rule
  identity.ts     Theo's features at rest, particle budget, manner
  feature.ts      contour, lids, hollow; a seat mapped to a point; hit test
  particles.ts    seats from a seed, shares, springs toward targets
  layers.ts       the stack, ownership, release
  program.ts      the tree's schema, validation, clamping, timing
  player.ts       runs a program against the layers; interruption, generations
  book.ts         named performances: defaults, and those kept locally
  events.ts       the event stream and its typed kinds
  memory.ts       decayed rates, novelty, surprise, mood, the stored baseline
  reactions.ts    rules, matching, weighted choice, cooldowns
  autonomy.ts     blink, saccade, breath, idle glances
  operations.ts   face.* declarations, parsing, receipts
  store.ts        zustand: what the components read
  words.ts        what the status node says
  contract/operations.json
src/components/face/
  face.tsx        canvas, status node, pointer and keyboard
  luma.ts         the luma renderer
  canvas2d.ts     the fallback
  face-mark.tsx   the still SVG mark for earlier messages
  face-bench.tsx  the bench
```

`KitStage` becomes the stage for whichever figure the setting names.
`thread.aui.tsx` swaps `Icon.Speaker` for the mark, and for a perch on the
live message.

## Milestones

1. **Rig.** Channels, features, particles, both renderers, and the bench as a
   story. No agent, no shell. Shows: two eyes, each moved alone; a third
   feature added and removed from the bench; the same seed gives the same
   particles.
2. **Programs.** The tree, the player, the default book, autonomy. Shows: a
   performance interrupted halfway by another without a jump; a channel taken
   by hand while the rest plays.
3. **In the shell.** The stage, the gutter, the mark, the hands, the words,
   reduced motion, the figure setting.
4. **Reactions.** Events, memory, rules, the stored baseline. Shows: one event
   repeated gets a falling, then a different, answer.
5. **The agent.** `face.*` operations and receipts, the expression part on the
   mood layer, focus ownership. Shows the target below.
6. **Keeping what works.** `face.define`, the book and the rules edited from
   the bench.

**The target for milestone 5:** in a live turn, the model writes a
performance that has no name in the book, points the face at a real message or
artifact, moves the eyes differently from each other, is interrupted by the
person's next message and redirects without a jump, and reads back a receipt
that says "interrupted" and by what.

## Tests and evidence

- `bun test`, pure modules:
  - the same seed gives the same seats, and a shape change moves no particle
    discontinuously;
  - every channel stays finite and inside its bounds under any admitted
    program;
  - `seq`, `par` and `stagger` end when they should; a second program started
    mid-way leaves no channel with a jump in value;
  - a channel on the hand layer ignores the performance and returns to it on
    release;
  - a blink on a half-closed eye gives the half-closed eye back;
  - one event repeated: intensity falls, then a different rule is drawn; the
    same seed draws the same sequence;
  - a stored baseline changes surprise for the same events;
  - a receipt from an older generation is not sent as "completed";
  - a refused program names the node and the reason.
- Stories, each with `?t=` to freeze the clock: `face-bench`, `face-book`
  (every default performance at its midpoint, in every palette),
  `face-in-thread`, `face-fallback`. `story-oracle.mjs motion` records two
  frames 400 ms apart.
- A collage against the robot reference, once it is filed. A person seals it.
- Frame cost measured in the browser at the placeholder's particle count, on
  the desktop window and a phone, and written into the checklist. No number is
  promised before it is measured.

**What tests cannot say.** Whether a performance reads as anything to a
person. That is asked of people: a free description first ("what is it doing?
what will it do next?"), labels only afterwards, each performance seen both
alone and beside the sentence it accompanied. The answers are kept with the
performance in the book.

## To verify first

1. That the authority admits `face.*` operations declared only by the page,
   or needs a declaration of its own as `kit_operations()` is.
2. That luma 9.3.6 instanced drawing runs in the desktop window's webview. If
   not, the desktop gets the fallback and the checklist says so.
3. That a Boa cell's `tool('face.perform', …)` reaches the page with the same
   receipt path a direct tool call has.

## Open

- **The reference picture.** Needed for the identity and for any collage.
- **Kit.** Companion, alternative, or retired.
- **A mouth.** The primitive allows one. Whether Theo has one at rest is an
  identity question the reference should answer.
- **Sound.** Not planned.

## Not yet

- A durable book and rule set in Theorem, shared across devices and readable
  by the agent before a page is open.
- Typed builders for the program tree in the code-mode kernel.
- A model that ranks or adapts candidate performances (the design note's
  Transformers.js idea). It needs the reading records above before it has
  anything to learn from.
- New expressive mechanisms beyond the feature primitive (a shape that is not
  one closed contour), as versioned extensions with a preview.
- The particle solver on the GPU. Only if the particle count outgrows the CPU.
