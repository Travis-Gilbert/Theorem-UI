# Theo's face

Theo is the face Theorem wears in this app: two eyes made of particles on a
small dark visor, drawn with luma.gl, that the agent, the person and the
page's own events can all move. Nothing in it is a fixed list of emotions. A
face is built from shapes, shapes are moved by continuous channels, channels
are moved by programs over time, and programs are started by the agent, by a
hand, or by reaction rules that weigh what has been happening lately. Each of
those four layers is data, so each can hold something nobody wrote in advance.

The name is a typo of "Theorem" that the owner kept.

The checklist in `theo-face.checklist.json` tracks this spec item by item, and
says for each what was built, what was checked, and what was not.

## Sources

- The owner's request of 2026-11-11: an avatar with the expressive face of a
  small robot; composable; able to show facial features that were not
  programmed into it; luma.gl for most of the presentation; something a person
  handles directly and a model controls at will, by tool call or from code
  mode (TypeScript on Boa, Monty, Blaze); reactions that differ with what came
  before and with what is ordinary in this person's environment; expressions
  that can be programmed later.
- The owner's design note pasted with the request ("Theorem can have
  expressions that nobody individually programmed").
- **The handoff** `theorem-expressive-presence.md` of 2026-11-10 and the face
  study that came with it (a standalone rig, a luma 9.4.2 renderer, a Canvas2D
  fallback). Where it changed this plan is listed under "What the handoff
  changed".
- **The reference**: a screen recording of the robot, supplied by the owner.
  Its hash and scope are in the ledger; its frames are not in this repository.
  It is a reference for expressive range and for the plain look of the thing
  (a dark screen, two solid glowing rounded boxes, lids that cut them into
  wedges, arcs and lines). Theo's proportions, colour and matter are its own.
- The owner's decisions of 2026-11-11:
  - Kit stays, on by default, and may gain more physics over time. Kit is
    "just there"; Theo is the agent's expression, closer to a tool.
  - Each has its own switch. Either, both or neither may be on.
  - Eyes only at rest. A mouth is added if eyes turn out not to say enough;
    the primitive already allows one.
  - When the agent is not active, Theo sleeps.
- The owner's decisions on seeing it built (2026-11-11):
  - The visor is a setting. In dark mode the eyes have no visor by default:
    "they just have contrast against the screen".
  - The white-hot look of the eyes stays.
  - The colour in the eyes follows the theme. The cyan suits GitHub Sharp;
    Stone and Vitesse get their own, and a theme someone makes should give the
    face its hue without anyone choosing one.
- What was already here and is reused, not rebuilt:
  - `src/lib/kit/operations.ts` and `src/lib/blocks/app-operations.ts`:
    Theorem's client operations. A page declares operations on its send, each
    becomes a tool of the turn, a call streams a `client_operation` part, and
    the page answers with a receipt.
  - `src/lib/kit/facts.ts`, `liveness.ts`, `store.ts`: run facts gathered
    across every mounted conversation, the liveness derived from them, and the
    agent's `theorem-expression` part.
  - `src/lib/life/energy.ts`: pulses that lift a level and decay with a
    half-life. The reaction memory is the same arithmetic, kept per kind of
    event.
  - `src/stories/`: addressable stories over committed fixtures.
- luma.gl 9.3.6 (`@luma.gl/core`, `engine`, `shadertools`, `webgl`), MIT.

## What the handoff changed

| The handoff says                                                                                        | What this plan does with it                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Acknowledge the start promptly; report the end later. Do not hold a tool request open for a performance | `face.perform` answers as soon as the performance has started, with its id and length. `wait: true` holds the receipt for the end, for at most 15 s. Either way, `face.read` reports how each recent performance ended                                   |
| Accepted, started, completed, interrupted and failed are different answers                              | A refusal is `rejected` with the path of the step and the reason. `applied` means it started in this browser. The ending is `completed`, `interrupted`, `stopped`, or `running` if the wait ran out. `failed` is an exception while answering            |
| Reading saved history must not run saved commands again                                                 | Requests are read only from the last assistant message of a conversation whose turn is running, and each request reference is served once per page                                                                                                       |
| Version the definition apart from the execution                                                         | The book holds immutable versions, `name@n`. An invocation is its own record: id, the version it came from, seed, owner, layer, length, ending                                                                                                           |
| One moving presence; history keeps a still mark                                                         | One canvas for the page. Earlier replies show an SVG mark of the same eyes                                                                                                                                                                               |
| The shell owns anchors, and retargets gracefully when one goes                                          | The shell marks its own elements (`data-face-perch`). The driver looks them up every frame: the live reply's gutter, then the composer, then a corner of the window. A perch that scrolls away or unmounts is simply no longer chosen                    |
| Free positions too, not only anchors                                                                    | The person drags it anywhere; a program's `go` step takes a named place or a point of the window                                                                                                                                                         |
| Layer order: the hand, the deliberate performance, small secondary motion, resting identity             | `hand` over `performance` over `reaction` over `mood`, over rest. Blink, saccade and breath are offsets beside the stack                                                                                                                                 |
| Each channel needs an explicit blend policy; do not average                                             | A step says which it is: `to` sets, `by` adds to where the channel is headed, `wave` oscillates around whatever is there. The highest layer holding a channel wins. A blink closes toward shut by an amount, so the eye underneath comes back as it was  |
| Start a replacement from the displayed state, keeping velocity                                          | Programs only move spring targets. A new target keeps the position and velocity the old one left                                                                                                                                                         |
| Give the agent the rig schema, examples, the current state and recent history                           | `face.read` returns exactly that, as data                                                                                                                                                                                                                |
| Validate before running; refuse with a concrete reason                                                  | `compile` checks every step against the face as it is and returns the path and the reason, with the nearest channel name when one is misspelt                                                                                                            |
| A recorded seed for bounded variation                                                                   | Every invocation records its seed; passing it back replays the same draws                                                                                                                                                                                |
| Share SceneOS's eyes and renderer rather than start another                                             | **Not done, on purpose.** SceneOS's eyes live in the Theorem repository on luma 9.4.2 inside an artifact frame. This app is held to luma `~9.3.0` by cosmos.gl. The rig here is written so the two could share it later; SceneOS's eyes stay scene-local |
| Revise the one-expression-a-turn limit in the stream                                                    | Not needed. Performances travel as client operations, which have no such limit. The `theorem-expression` part still lands, once a turn, on the mood layer                                                                                                |
| The focused conversation owns deliberate expression                                                     | **Not yet.** Any mounted conversation's live turn may perform, and a newer performance interrupts an older one, which is told so. See "Open"                                                                                                             |
| Keep run state in text                                                                                  | The face has a `role="status"` line. Connection, approval and failure stay where they were in the interface                                                                                                                                              |
| Evaluate execution, visual quality, communication and preference separately                             | "Tests and evidence" keeps them apart. Only the first two were done here                                                                                                                                                                                 |
| Defer shader generation, a behaviour-graph editor, anatomy, emotion inference, learned ranking          | Under "Not yet"                                                                                                                                                                                                                                          |

## Shape

One face per page, in a fixed layer of its own above the shell. Its canvas is
small and is moved by a CSS transform, so travel across the page costs no
redraw of anything else.

- **At rest** it sits in the gutter of the live assistant reply, where
  `Icon.Speaker` (a folder) was drawn. Earlier replies show the still mark.
  With no reply on screen it rests on the composer, and with no composer, in
  a corner of the window.
- **It grows to act.** At rest the visor is 32 px wide. It is 1.8 times that
  while it reacts and 2.4 times while the agent performs, and a program may
  ask for a size.
- **It can leave**: to the composer, beside the text, to the centre, to the
  pointer, to a point of the window, or wherever the person drops it.
  Double-tap or Escape sends it home.
- **It always has words.** A `role="status"` node says what Theo is doing.
- **It sleeps.** Ninety seconds with no run and nothing from the person, and
  it shuts its eyes, dims and breathes slowly. The person or a run wakes it;
  the window resizing does not.

## The four layers

### 1. Shapes: what a face is made of

A face is a list of **features**. Every feature is the same primitive:

- a **rim**: a superellipse (`w`, `h`, `round`: 2 is an ellipse, 4 the
  reference's rounded box, 8 nearly a rectangle) multiplied by eight radial
  gains (`r0`..`r7`), so one primitive is a box, a circle, a slit, a teardrop,
  a wedge or a bean;
- two **lids**: an upper and a lower edge, each with how far it closes, a tilt
  and a bow. A raised, bowed lower lid makes the smiling arc; a tilted upper
  lid makes a glare; both shut make a line;
- a **hollow**: an inner radius, for a ring;
- a **place**: position, turn and scale on the visor;
- an **alpha**, and a **share** of the face's matter.

The two eyes are two features. They are not special. A brow, a mouth, a tear,
a spark over the head are the same primitive with other numbers, and a program
can add one for its own length and have it taken away when it ends (the book's
`skeptic` adds two brows this way). At most eight features exist at once.

The face has one budget of 1,200 grains. Each grain keeps a fixed seat (an
angle and a depth), laid by a seeded low-discrepancy sequence so a shape fills
evenly; one grain in four sits on the rim so a feature has an edge. Features
divide the grains by `share`, so when a feature appears, grains leave the eyes
and fly to it, and that flight is the transition. A spring carries each grain
to its seat. Seats never change, so a shape can change completely and every
grain still has one continuous path.

### 2. Channels: the instrument

Every number above is a **channel** with a name, bounds and a rest value.
Names address meaning, never grains: `eye.left.lid`, `eye.right.lidTilt`,
`gaze.x`, `face.tilt`, `matter.cohesion`. `eyes.<param>` means both eyes.

| Group    | Channels                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature  | `x`, `y`, `w`, `h`, `round`, `r0`..`r7`, `lid`, `lidTilt`, `lidBow`, `low`, `lowTilt`, `lowBow`, `hollow`, `turn`, `scale`, `alpha`, `share` |
| Face     | `face.tilt`, `face.scale`, `face.dx`, `face.dy`, `face.squash`                                                                               |
| Gaze     | `gaze.x`, `gaze.y`                                                                                                                           |
| Matter   | `matter.cohesion`, `matter.jitter`, `matter.drift`, `matter.size`, `matter.glow`, `matter.hue`                                               |
| Autonomy | `auto.blink`, `auto.saccade`, `auto.breath` (how much the face does unasked)                                                                 |

Layers, lowest first: **mood** (the run's liveness, sleep, and the agent's
`theorem-expression`), **reaction** (the rules), **performance** (the agent's
programs), **hand** (the person, while they hold the face). The highest layer
holding a channel decides its target. A layer that lets go does not snap: the
spring's target becomes the next layer's value.

Every channel moves through a spring, and a program only ever moves the
spring's target. So interruption is not a special case. Moves shorter than
40 ms snap, and the spring's frequency is capped, so no program can make one
unstable.

### 3. Programs: expression over time

A performance is a list of steps, as JSON:

| Step      | Does                                                                         |
| --------- | ---------------------------------------------------------------------------- |
| `to`      | moves channels to values over a time, with a bounce, then holds              |
| `by`      | moves channels by an amount from where they are headed                       |
| `wave`    | oscillates a channel around wherever it is (sine, square or noise)           |
| `wait`    | nothing, for a while                                                         |
| `seq`     | steps in order                                                               |
| `par`     | steps together; lasts as long as the longest                                 |
| `stagger` | steps together, each delayed (one eye leads the other)                       |
| `repeat`  | a step several times; draws are fresh each time                              |
| `vary`    | one of several steps, drawn by weight from the seed                          |
| `look`    | turns the gaze to the person, the pointer, the composer, the text or a point |
| `feature` | adds, reshapes or removes a feature                                          |
| `go`      | moves the whole face on the page, at a size                                  |
| `burst`   | kicks the matter outward from a point                                        |
| `use`     | plays a named performance inside this one, with arguments and an intensity   |
| `release` | gives channels back to the layer below                                       |

Any number may be `{rand:[low,high]}`, drawn from the invocation's seed, or
`{arg:"name", or:n}`, passed by the caller. `keep: true` leaves what the
program set in place after it ends, until the layer is stopped or played on
again; that is how a mood or a sleep holds.

Named expressions are entries in a book of performances (26 to start: blink,
wink, nod, shake, perk, squint, glare, worry, happy, joy, think, curious,
startle, wince, dizzy, sigh, scan, melt, sparkle, skeptic, attend, focus, ask,
sleep, wake, done). `use: "curious"` is a shortcut the agent may take; writing
the steps is always allowed and needs no name.

A saved performance is never changed. Defining a name again adds a version,
and when one is saved every `use` in it is written down by version
(`blink` becomes `blink@1`), so revising `blink` later does not change what
an older performance plays. The book holds 64 added performances with each
version counted, and one that another added performance uses cannot be
removed until its user is. Removal takes a name, for every added version of
it, or `name@version` for one. Two names can each hold a version the other
uses, so neither goes whole; a version only ever uses versions saved before
it, so there is always one nothing uses, and taking the versions away in
that order empties the pair.

A feature a program adds leaves when the last performance that put it there
lets go. The player keeps that account itself: a performance played again
while its brows are still up, or still flowing out, takes them over and takes
them away at its own end, and a mood that keeps a feature is not robbed of it
by a passing performance that used the same one.

A program is compiled before it starts: known steps, known channels (the
nearest name is offered for a misspelt one), values clamped to bounds and the
clamps reported in the receipt, at most 30 s, 600 cues, 10 levels of nesting,
24 repeats and 4 levels of `use`. A refused program changes nothing.

### 4. Reactions: the same event, a different answer

The page feeds one stream of events: the person (`person.poke`, `pet`, `drop`,
`type`, `send`, `return`), the run (`run.start`, `ask`, `tool`, `tool.fail`,
`error`, `done`), and the environment (`env.resize`, `theme`, `offline`,
`online`, `copy`). An agent's rule may name a kind nobody emits yet.

**What it remembers.** For each kind of event: a rate over seconds, a rate
over minutes, how many came in a row, how long since the last, and a baseline
over days kept in `localStorage`. From them a rule can read:

- **streak** and **fast**: how many in a row, how many lately;
- **novelty**: how far from ordinary this is for this device, so a burst of
  tool calls is news for a person who rarely runs any and passes unremarked
  for one who always does;
- **habit**: how ordinary the kind is here at all;
- **mood**: arousal, valence and focus, which events push and time relaxes.

**What it does.** A reaction rule is data:

```json
{
  "id": "done-relief",
  "on": ["run.tool.fail", "run.done"],
  "within": 120000,
  "do": "sigh",
  "weight": 4
}
```

`on` is one kind or a short sequence. `when` gives ranges for the gauges
above. `do` is a book name or a program. When several rules fit, one is drawn
by weight from a seeded generator, a rule that just played is drawn less,
doing nothing is always one of the candidates, and a cooldown keeps a rule
from repeating. So a first poke gets a start or a look, a fourth a glare, and
an eighth a face that has gone dizzy or let go of its shape. None of those is
"the poke reaction".

The rule book ships with 40 defaults. The agent can add up to 32 and remove
its own. A reaction never talks over a performance the agent is playing.

## Who moves it

| Mover                     | How                                                                                                  | Layer       |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | ----------- |
| The model, by tool call   | `face.read`, `face.perform`, `face.define`, declared on the send beside `kit.*` and `app.check`      | performance |
| The model, in code mode   | the same three as `tool("face__perform", {...})` inside a cell                                       | performance |
| The model, without a tool | the `theorem-expression` part it already writes (energy, breath, tilt, gaze, hue) maps onto channels | mood        |
| The run                   | its liveness: attending, working, asking, done, idle                                                 | mood        |
| The person                | pointer and keyboard on the face                                                                     | hand        |
| The page                  | reaction rules over the event stream                                                                 | reaction    |
| The face itself           | blink, saccade, breath                                                                               | autonomy    |

### Operations

Theorem admits sixteen operations a send. Kit has nine and Apps one, so the
face has three, and everything it can do is reached through them: looking,
moving, adding a feature and setting a channel are steps of a program, not
operations of their own.

| Operation      | Arguments                                                                   | Receipt says                                                                                 |
| -------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `face.read`    | `part`: all, channels, book or state                                        | the manual: channels with bounds, the steps, the book, the rules, and what the face is doing |
| `face.perform` | `use` (a name) or `program`; `args`, `intensity`, `seed`, `wait`; or `stop` | the invocation's id, version, length and seed, what was clamped, and how it ended            |
| `face.define`  | `name` + `program` + `note`; or `rule`; or `remove`                         | `name@version` saved, the rule's id, or what was removed                                     |

The face is declared only while it is on the page, so a turn is never offered
a face it cannot move. A turn that was offered it and then had it switched
off mid-run gets `rejected`, "Theo is not on screen", with its receipt.

### The person's hands

- The face is a focusable button. Enter or Space pokes it; Escape sends it
  home.
- The pointer near it draws the gaze.
- A tap is a poke at that point: the matter scatters from where it was
  touched, and the face may react.
- Dragging carries it. It opens its eyes wide, leans into the motion, and its
  matter lags behind. Let go and it stays where it was put.
- Stroking across it is petting.
- Double-tap sends it home.
- Settings, Appearance, Figures: a switch for Theo and a switch for Kit.

### One face

The face is the page's, not a conversation's. Each performance carries its
owner (`run:<id>`, `rule:<id>`, `liveness`) and an invocation id; a newer one
on the same layer interrupts the older, whose waiting receipt says so. The
hand outranks everything while it holds.

## Identity

Identity is one data file, `src/lib/face/identity.ts`: the visor's
proportions (100 by 64 face units), the features at rest (two eyes), the grain
count and size, and the matter's colour in OKLCH. Expression deforms identity
and always returns to it. Changing how Theo looks is a change to this file and
to nothing else.

The eyes are white-hot at the centre with a fringe of colour. The mood shifts
the hue a little; the agent's `theorem-expression` hue shifts it more. Two
things about the look are not the identity's but the page's: whether there is
a visor, and what the hue is.

### The visor

The visor is the dark plate the reference's screen is. It is a setting
(Settings, Appearance, Figures, "Theo's visor") with three values:

| Setting          | Light theme                        | Dark theme              |
| ---------------- | ---------------------------------- | ----------------------- |
| `auto` (default) | visor, eyes of light               | no visor, eyes of light |
| `on`             | visor, eyes of light               | visor, eyes of light    |
| `off`            | no visor, eyes drawn as dark _ink_ | no visor, eyes of light |

Light needs something dark behind it. On a dark page the page is that, so
`auto` drops the plate there. On a light page with no plate the eyes cannot be
light at all: light that adds to a near-white page shows nothing. There the
same grains are drawn as ink: the grain's own hue with four fifths of its
light taken out, covering what is under it instead of adding to it, so piled
grains go solid dark where they used to burn white. It is the same matter and
the same motion with the blend turned over. The rule is one function
(`faceLook` in `src/lib/figures.ts`); both painters take an `ink` flag.

Without the plate, matter that reaches the edge of its canvas thins out over
the last tenth instead of being cut by a rim that is no longer drawn.

### The hue follows the theme

The hue of the matter is read from the page's theme
(`src/lib/face/tint.ts`, `src/components/face/look.ts`), in this order:

1. `--face-hue` on `<html>`, an OKLCH hue in degrees, when the theme names
   one;
2. the hue of the ground the face sits on (`--surface-neutral`), when the
   ground is tinted (OKLCH chroma of 0.02 or more);
3. the hue of the theme's accent (`--focus`), when that is tinted;
4. the identity's own hue.

Lightness and chroma stay the identity's, so every theme gets the same
white-hot eyes with a different colour in them.

| Palette      | Hue         | From                                                                                                                                                                                                                                                               |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GitHub Sharp | 205         | Named in `styles.css`: the cyan the face was drawn in, which the owner said fits                                                                                                                                                                                   |
| Stone        | 68          | Named: the warm hue every Stone surface leans to. The lean is real but faint (chroma 0.003 to 0.007), no stronger than the rounding of a grey, so it cannot be found by measuring                                                                                  |
| Vitesse      | 164 and 160 | By the rule: its ground is a true grey, so the face takes its green accent, dark and light                                                                                                                                                                         |
| A new theme  | by the rule | A theme with a tinted ground gives that hue; one with a grey ground gives its accent's; one that wants something else names `--face-hue`. A made-up theme with a plum ground (`#2a1838`) gave 308 in the browser with nothing else said (see "Tests and evidence") |

The hue is read when the face mounts and again whenever `<html>`'s attributes
change, which is how the mode, the palette and a theme set from script all
arrive, so a change of theme recolours the moving face, the still marks and
the bench at once.

## Decisions

| Decision               | Choice                                                                                                      | Why                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| luma.gl version        | 9.3.6, as direct dependencies at the version already locked                                                 | cosmos.gl's peer range is `~9.3.0`. The study's 9.4.2 would put a second luma in the bundle beside the Vault graph's                              |
| Where motion is solved | On the CPU, in typed arrays: channels, springs and grain seats                                              | 1,200 grains cost about half a millisecond a frame. The solver then runs in `bun test` with no GPU, and one solver feeds both renderers           |
| What luma draws        | One instanced triangle strip from one buffer written each frame; core, halo and additive glow in the shader | The request is luma for presentation. The shader holds nothing a test would need to see                                                           |
| Fallback               | Canvas2D over the same buffer; the status says which is drawing                                             | The desktop window's WebGL2 is unverified                                                                                                         |
| Canvas                 | One small canvas, made afresh by each mount, moved by transform                                             | One WebGL context for the face whatever it does. A canvas whose context was destroyed cannot be given another, which React's double mount found   |
| Tween or spring        | Programs move targets, springs follow                                                                       | Interruption and blending need no rules of their own                                                                                              |
| Expression language    | JSON steps, checked by a compiler written here                                                              | The refusals need a path and a suggestion, which a schema validator does not give. The tool's `inputSchema` leaves `program` open for that reason |
| Three operations       | read, perform, define                                                                                       | The sixteen-operation limit, and a model learns one manual more readily than seven tools                                                          |
| Book and rules         | Defaults in code; the agent's additions in `localStorage`                                                   | Useful before any backend work. A durable book in Theorem is under "Not yet"                                                                      |
| Kit                    | Stays, on by default, with its own switch                                                                   | The owner's decision                                                                                                                              |
| Visor                  | A setting: `auto` (light theme only), `on`, `off`                                                           | The owner's decision. Bare eyes on a light page are drawn as ink, since light cannot show there                                                   |
| Hue                    | From the theme: a named `--face-hue`, else a tinted ground, else the accent                                 | The owner's decision. A ground's hue cannot be measured when it is nearly grey, which the shipped palettes all are, so the accent stands in       |
| Randomness             | One seeded generator per face, and a recorded seed per invocation                                           | "Not the same every time" and "repeatable in a test" are both required                                                                            |
| Tests                  | `bun test` over the pure modules; stories that can be frozen at a moment                                    | No new test runner                                                                                                                                |

## Files

```
src/lib/face/
  channels.ts     channel table: names, bounds, rest; features added and removed
  identity.ts     Theo's features at rest, grain budget, colour
  feature.ts      the primitive: a seat mapped to a point through rim and lids
  particles.ts    seats from a seed, shares, springs, shove and burst, the buffer
  layers.ts       the rig: a spring per channel, the layer stack, release
  program.ts      steps, the compiler, limits, refusals
  player.ts       runs a score on a layer; interruption, kept holds, endings
  book.ts         named performances: Theo's own, and versions added later
  memory.ts       decayed rates, streaks, the days baseline, mood
  reactions.ts    rules, fitting, weighted draw, cooldowns
  autonomy.ts     blink, saccade, breath
  engine.ts       Face: the one object everything that moves Theo goes through
  operations.ts   face.* declarations, requests, receipts, run events
  store.ts        the page's one face; whether it is mounted
  random.ts       the seeded generator
  tint.ts         a colour's hue, and which of a theme's colours the face follows
src/lib/figures.ts            Theo's and Kit's switches, the visor setting and the look it gives
src/components/face/
  driver.ts       where the face is on the page; pointer, keyboard, page events
  face-stage.tsx  the layer, the button, the status line
  painter.ts      the Painter interface, the Canvas2D painter, the choice
  luma.ts         the luma painter
  face-mark.tsx   the still mark, and the gutter slot
  look.ts         the look and the hue here and now: the setting, the mode, the theme's colours
  figures.tsx     mounts Theo and Kit, each if switched on
  face-bench.tsx  the bench and the book sheet, for stories
```

## Milestones

1. **Rig.** Channels, features, particles, both painters. Done.
2. **Programs.** The steps, the compiler, the player, the book, autonomy.
   Done.
3. **In the shell.** The layer, the gutter, the mark, the hands, the words,
   reduced motion, the switches, sleep. Done.
4. **Reactions.** Events, memory, rules, the stored baseline. Done.
5. **The agent.** The three operations and their receipts, the expression
   part and liveness on the mood layer. Built and tested against the SDK's
   message mapping; **not yet driven by a live run** (see "To verify").
6. **Keeping what works.** `face.define` for performances and rules. Done. An
   editor for them in the app is not built; the bench plays a program typed
   into it.

**The target for milestone 5**, still to be seen in a live turn: the model
writes a performance that has no name in the book, moves the eyes differently
from each other, adds a feature, is interrupted by the next performance
without a jump, and reads back that it was interrupted.

## Tests and evidence

**Execution correctness** (`bun test src/lib/face src/lib/figures.test.ts`,
80 tests):

- channels: every feature has every param; a new feature gets channels of its
  own up to the limit; a near miss is named;
- the primitive: sides mirror; a closing lid brings the eye to a line; a
  radial gain moves one part of the rim;
- the rig: a higher layer wins and the lower shows again after; bounds hold;
  no move, however abrupt, sends a spring away; bounce overshoots and reduced
  motion does not;
- the matter: it settles inside its features and the visor; a share draws
  grains out of the others; a poke scatters and it comes back; the same seed
  lays the same face;
- the compiler: timing of `seq`, `par` and `stagger`; refusals with a path and
  the nearest name; every limit; seeded draws; every performance in the book
  compiles;
- the book: versions, persistence, Theo's own are never lost; a saved version
  plays the same after what it uses is revised; a performance in use cannot
  be removed; two that use each other's versions come away a version at a
  time; versions count toward the limit;
- the face: a performance moves it and lets go; a program nobody named plays
  and its added feature is taken away after; played again before its features
  have gone, it still takes them away; a feature two performances use stays
  until the last lets go; a refused program changes
  nothing; interruption; the hand over a performance; ten pokes in a row do
  not repeat and end somewhere they did not start; different seeds differ and
  the same seed repeats; a finish straight after a failure is a sigh and a
  clean finish is not; sleep, what does and does not wake it, and waking;
  liveness moods; the buffer is finite and lit; the manual names everything;
- operations: each declaration inside Theorem's limits (name, 1,024 bytes of
  description, 8 KB of schema) and all of the page's together at most sixteen;
  declared only when mounted; a pending request is read from the live turn and
  nothing in history is performed again; read, perform, wait, stop, define,
  remove, rules; refusals; a request is answered once; a receipt that fails
  to post is sent again and the performance is not played again; a face
  switched off mid-run refuses and still answers;
- the visor: each setting in each mode gives the look in the table above, and
  eyes are ink only where nothing dark is behind them;
- the hue: a colour's hue comes back from the colour made with it; a grey has
  no chroma; a named hue wins; a tinted ground gives its own hue; a grey
  ground hands over to the accent (Vitesse's and Stone's own colours); a theme
  with neither keeps the face's hue.

**Visual quality**, checked here in headless Chromium (software WebGL):

- luma draws the face (`drawn by luma`), and Canvas2D draws the same face in a
  browser with no WebGL (`drawn by canvas2d`);
- the book sheet: every performance at its fullest moment;
- in the shell: at rest in the live reply's gutter beside Kit on the composer;
  poked; poked eight times running; carried and dropped; sent home; with
  reduced motion; by keyboard; switched off (the old gutter icon returns) and
  on again; asleep after ninety seconds and awake after a poke;
- the visor (`visor.png`: light above dark; `auto`, `on`, `off` left to
  right), drawn by luma in all six, with no shader refusal;
- the palettes (`palettes.png`: dark above light; GitHub Sharp, Stone,
  Vitesse left to right);
- on the settings page, pressing through Dark, Stone, Vitesse, visor On, Off,
  Light and Auto: the still mark took hue 205, 68, 164 and 160, gained and
  lost its plate, and turned to ink only for Off in Light; a theme made up on
  the spot with a plum ground took hue 308.

Renders are under `docs/plans/evidence/theo-face/`.

**Not done here**, and nothing in this plan claims them:

- **Communication.** Whether a performance reads as anything to a person. That
  is asked of people: a free description first ("what is it doing? what will
  it do next?"), labels only afterwards, each performance seen alone and
  beside the sentence it accompanied.
- **Preference.** How much movement a person wants over days of use.
- A collage against the reference, sealed by a person.
- Frame cost in a real browser on real hardware. The solver alone measures
  about 0.5 ms a frame under Bun.
- Vitesse's green shows less in the eyes than the cyan or the gold do at the
  same lightness and chroma. Whether it wants more chroma is a call for
  someone looking at a real screen.
- Ink eyes have been looked at at rest and poked, not through the whole book.

## To verify

1. **A live run.** That Theorem admits `face.*` declared only by the page (it
   admits Apps' `app.check` this way), offers them to the model, and that a
   receipt reaches the run. The server's limits were read from its source;
   nothing was run against it.
2. **Code mode.** That a cell's `tool("face__perform", {...})` reaches the
   page with the same receipt path a direct tool call has.
3. **The desktop window.** That luma 9.3.6 draws in its webview. If not, it
   gets the fallback, which is already there.

## Open

- **Who may perform.** The handoff's first policy is that only the focused
  conversation owns deliberate expression. Today any mounted conversation's
  live turn may, and the newest wins.
- **How much the manual costs a turn.** `face.read` with no part is about
  10 KB of JSON. The parts are there so a model can ask for less.
- **A mouth.** Added if eyes are not enough.
- **Sound.** Not planned.

## Not yet

- A durable book and rule set in Theorem, shared across devices and readable
  by the agent before a page is open.
- An editor in the app for the book and the rules, and controls for single
  channels (the study's sliders).
- Typed builders for programs in the code-mode kernel.
- Sharing the rig with SceneOS's eyes.
- A model that ranks or adapts candidate performances (the design note's
  Transformers.js idea). It needs people's readings before it has anything to
  learn from.
- New expressive mechanisms beyond the feature primitive (a shape that is not
  one closed rim), agent-written shaders, a behaviour-graph editor, anatomy
  beyond a face, any inference of the person's emotion.
- The particle solver on the GPU. Only if the grain count outgrows the CPU.
