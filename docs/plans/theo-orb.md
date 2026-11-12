# Theo as a thinking orb

While the agent works, a small dotted orb turns beside the words that say
so. This plan makes Theo that orb: when Theo is on and a run is at work,
the eyes give their matter to one ball of dots that turns, with a few
grains in orbit round it. It is held by the run itself, and the run moves
it: each tool call makes it turn faster and stirs it, the harder the run
was asked to think the larger it is, and as the conversation fills past
400,000 tokens it loses its shape.

It is a form, as the loudspeaker is (`theo-sound.md`): a performance held
from one event until another, under whatever else the face does.

The checklist in `theo-orb.checklist.json` tracks this spec item by item.

## Source

Asked for by the owner on 2026-11-11, with a screenshot of the app on a
phone. In their words: "when an agent is answering, there are the thinking
orbs that pop up. I think if Theo is on than Theo should transform into
thinking orbs so this would be a new implementation of the thinking orb
that is made from Luma GL it can be similar to the one that exist, but a
little bit less deterministic the one that we have currently moving in a
pretty predictable pattern. In fact, it would be cool if Theo could maybe
have the thinking orb itself increase in speed or intensity based on tool
calls. And maybe we changed the size of the orb based on the models
thinking effort setting. So basically, a more variable form of
https://github.com/Jakubantalik/thinking-orbs made from luma gl". It is not
a file, so it has no hash.

On seeing it the owner asked for one more thing, on 2026-11-11: "an
interesting idea might be if it gets a bit less composed becoming a less
consistent sphere shape as the current models context window gets higher
maybe starting past 400,000 tokens".

The orb they point to is `thinking-orbs` by Jakub Antalik (MIT), which the
app's inline indicator already uses
(`components/assistant-ui/elements/thinking-indicator.tsx`). It draws on a
2D canvas, and each of its states is a function of the clock, which is why
it repeats. None of its code is here. What is taken is the idea: a ball of
dots that turns, with grains on tilted orbits.

## What is drawn

Nothing new draws, bar the plate changing shape ("On the plate" below). The orb is Theo's own 1200 grains, seated differently,
painted by the painter the face already has (luma.gl instanced quads,
Canvas2D where there is no WebGL).

A feature has four new numbers (`lib/face/channels.ts`,
`lib/face/feature.ts`):

- **globe**: its matter set as dots on a ball seen from the side, this many
  rows from pole to pole. 0 is flat, as every feature was. The ball leans
  toward whoever looks, the far side is dim, and half of the matter a flat
  feature keeps on its rim goes into three orbits round the ball, each a
  bright head with a fading tail.
- **spin**: how fast the globe turns, in turns a second.
- **stir**: how much it is stirred: its rows slide past each other, its
  axis wanders, its orbits quicken and tilt.
- **loose**: how far it has lost its shape. 0 is a ball. Toward 1 its
  radius is bent by two slow waves over the sphere, so it bulges into a
  lump; its dots spread toward a plain scatter; three grains in ten stand
  off it, the furthest by 0.3 of its radius; and its orbits waver. The
  lumps drift as it is stirred.

What the globe has turned, and how much it has been stirred, are kept by
the matter and added to each step (`lib/face/particles.ts`). They are not a
function of the clock. So a change of speed never jumps the ball, and where
it is at any moment depends on everything the run has done so far.

## What moves it

Three signals, measured from the run (`lib/face/signals.ts`,
`lib/face/work.ts`), fed to the face each frame by the driver:

| Signal       | 0..1                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run.pace`   | How busy the run is with tools. Each call that starts or ends pushes it up; it halves every 2.4 seconds. A failed call pushes 1.6 times as hard. Each push lands with a strength of its own, between 0.7 and 1.3 of the usual. |
| `run.effort` | The reasoning effort the run was asked for: low 0, medium 0.25, high 0.5, xhigh 0.75, max 1. The middle where none was asked for.                                                                                              |

| `run.context` | How full the conversation is past 400,000 tokens: 0 up to there, 1 at the model's window. |

While nothing runs all three are 0.

The tool calls are counted where the face already hears of them
(`watchFace` in `lib/face/operations.ts`): a call is counted when its
part appears in the running message and again when it has a result. The
effort is the conversation's own setting, else the account's default
(`requestedEffort` in `lib/theorem/generation.ts`), read once when the
run starts and kept until it ends: changing the setting while a reply is
being written is a choice for the next message, and does not resize the
orb of the one at work. A model's own default effort is not read, so with
neither set the orb is the middle size.

The context is what the server last reported. Its `usage` part of
theorem-chat/1 carries `contextTokens`, the prompt's occupancy at the last
request, and `contextWindow`, the model's window from the catalogue
(`append_native_usage_as` in the server's `theorem_agent_stream.rs`); the
SDK hands it on as a `theorem-usage` data part, and `contextOf` reads the
newest one in the thread. Three things follow from that:

- The 400,000 is a count of tokens, as asked, not a share of the window.
  A model whose window is 400,000 or smaller never loosens the orb.
- Where no window is reported it is taken to be a million.
- The number is one request behind: a conversation's first run has none,
  and a run shows what the last report said until its own arrives.

The form (`orb` in `lib/face/book.ts`) follows them:

| Channel     | At rest | Follows       | By   | So                             |
| ----------- | ------- | ------------- | ---- | ------------------------------ |
| `orb.spin`  | 0.11    | `run.pace`    | 0.7  | a turn every 9 s, up to 1.2 s  |
| `orb.stir`  | 0.14    | `run.pace`    | 0.8  | barely stirred, up to 0.94     |
| `orb.scale` | 0.76    | `run.effort`  | 0.54 | radius 10.6 to 18.2 face units |
| `orb.loose` | 0       | `run.context` | 1    | a ball, to a frayed lump       |

The visor is 100 by 64 face units; at its largest the ball and its orbits
reach 27 from the middle, and at its largest and loosest its furthest
grain is 29.8 from it.

`run.effort` and `run.context` are marked steady in `signals.ts`: they
hold for a whole run or longer, so a channel that follows one does not
move for effect.

## When it is held

The engine says two more events as the run's liveness changes
(`setLiveness` in `lib/face/engine.ts`): `run.work` when the run is at
work, `run.rest` when it stops being. The rule `work-orb` gives the `orb`
form on the first and holds it until the second. A run that stops to ask
is not at work, so the orb goes and the face asks as it did; when the run
goes on, the orb is back. A face that starts while a run is already at
work takes up the orb (`components/face/driver.ts`).

`run.work` and `run.rest` are said after the events the face already had,
so a rule that waits for two events in order (`done-relief`: a failed tool,
then done) still finds them next to each other.

## On the plate

Where Theo has its plate (a light page by default, any page with the visor
set on), the orb is made of both of the face's materials: its light and
its dark. The owner, on seeing the orb in the whole dark plate on a light
page and then bare as ink: "what if we instead compose the orb of the
color of the eyes and the black background? That way the entire component
is used."

- **The plate draws in to a ball.** While a globe has most of the face's
  matter, the engine says where the ball is and how large (`Face.ball()`,
  `lib/face/engine.ts`), and the dark behind the matter goes from the
  whole plate to a circle round the ball, 3.2 face units wider than it
  (`components/face/plate.ts`). It is one outline, a rounded box whose
  half sizes and corner all become the ball's radius, so the plate is
  seen to shrink into the ball and to open out of it again when the run
  rests. It keeps the plate's rim and shadow.
- **What is off the ball is ink.** The orbits, and the grains a loosened
  orb sends astray, pass outside the ball. On a light page light cannot
  show there, so matter with no plate under it is drawn as ink, the
  grain's own hue with the light taken out, which is close to the plate's
  colour. A grain half over the edge is half each. On a dark page with
  the visor set on, it stays light.
- **Two draws, where there are two materials.** Light adds and ink covers,
  which are different blends, so the luma painter draws the ink and then
  the light, each leaving out the other's part (`components/face/luma.ts`).
  A face that is all light or all ink is one draw, as before. The Canvas2D
  painter makes a grain one or the other by where its middle is.
- **Nothing else moves.** Bare (no visor) the orb is as it was: light on a
  dark page, ink on a light one. Eyes and devices keep the whole plate.
  With motion reduced the plate is the ball at once.

## Decisions

- **One orb, not two.** The eyes give all their matter to one ball in the
  middle of the visor. Two eyes each set as a globe is a change of a few
  numbers in the form; it was not built.
- **Speed and stir carry the tools.** While Theo is the orb, its small
  reactions to a tool (the scan, the wince at a failure) do not show: they
  move the eyes, and the eyes hold no matter. A failed call pushes the pace
  harder instead.
- **One form at a time.** A reply read aloud while a run works replaces the
  orb with the loudspeaker, and the orb does not come back when the sound
  stops. A run that starts during a reading replaces the loudspeaker.
- **The inline indicators are not changed.** The small `thinking-orbs` orb
  beside "Working" still shows whether Theo is on or not.
- **Reduced motion.** The ball does not turn and is not stirred, and the
  pace is not followed, as sound is not. The two steady signals are: the
  orb has the size the effort gives it and the shape the context gives
  it, and holds still (`follow` in `lib/face/player.ts`). Before the
  context was read the size was not followed either; a size and a shape
  that say something and do not move are not motion.
- **Loosening is absolute.** It starts at 400,000 tokens whatever the
  model. A share of the window instead would loosen every model alike; it
  was not asked for and not built.

## Files

```
src/lib/face/
  channels.ts     globe, spin, stir, loose
  feature.ts      the globe's seats and each grain's light
  particles.ts    what a globe has turned and been stirred, kept per feature
  signals.ts      run.pace, run.effort, run.context; which signals are steady
  work.ts         the run's pace, effort and context as numbers
  player.ts       a steady signal is followed with motion reduced
  engine.ts       run.work, run.rest; nothing turns with motion reduced
  reactions.ts    work-orb
  book.ts         the orb form
  operations.ts   counts tool calls, reads the effort asked for and the context reported
  orb.test.ts
src/lib/figures.ts              whether the page is light (`paper`)
src/components/face/driver.ts   feeds the signals each frame; steps the plate
src/components/face/plate.ts    the plate's outline, drawn in to a ball and out
src/components/face/painter.ts  ink off the plate, light on it (Canvas2D)
src/components/face/luma.ts     the same, as two draws
src/styles.css                  the plate's dark as its own element
src/lib/theorem/generation.ts   requestedEffort
src/lib/theorem/runtime.tsx     passes it to useFaceRequests
```

## Tests and evidence

`bun test src/lib/face/orb.test.ts`: 25 tests. The work meter (a push per
call, the decay, the cap, a failure pushing harder, pushes that differ,
nothing while nothing runs, the effort levels, the context share); the
globe (on a ball, in dots, far side dim, a whole turn brings it back,
orbits outside the ball and not piled at their ends, loosened it is no
ball, flat with no rows); the form (held from work to rest, never left
out by chance, back after an ask, faster and more stirred with pace, no
jump on a change of speed, larger with effort and inside the visor,
looser with context and inside the visor, with motion reduced not
turning and still showing its size and shape, the relief sequence kept,
the program compiles and the manual lists the signals, the face says
where its ball is only while it is one). `contextOf` and the effort held
for a run are tested in `operations.test.ts`. The plate's outline, what is
off it, its drawing in and out, and what it writes to its element are
tested in `components/face/plate.test.ts` (10 tests); that a light page
makes bare matter ink, in `lib/figures.test.ts`.

Renders under `evidence/theo-orb/`, from the stories `face-sound` and
`face-in-shell` in headless Chromium on software WebGL. The run in them is
set by the capture script: the liveness, the effort, and tool calls counted
through the same meter the runtime uses.

- `efforts.png`: low and calm, high and calm, max after four tool calls,
  and high in the light theme (re-taken with the plate drawn in).
- `plate.png`: the plate drawn in. Above, on a light page at high effort:
  just formed, calm, after four tool calls, and the plate whole again as
  the run finishes. Below: low effort, max effort after four tool calls,
  the conversation nine tenths full, and a dark page with the visor on.
- `run.png`: seven frames through one run at high effort: forming, calm
  twice, twice after four tool calls, the run finishing, and after.
- `context.png`: the conversation filling: nothing past 400,000 tokens, a
  third, two thirds and all of the way to the window; above at high
  effort and calm, below at max effort after four tool calls.
- `reduced-motion.png`: max effort and four tool calls with motion
  reduced: the largest size, not turning.
- `in-shell.png`, `phone.png`: the orb beside a reply in the app's shell,
  at desktop width and on a phone.

## Not seen

- No live run has moved it. The counting was checked by a unit test of the
  message parts and by driving the meter from a script, not by an agent
  calling tools in the signed-in app.
- No conversation of 400,000 tokens has loosened it. The reading was
  checked by a unit test of the usage part's shape as the server's source
  writes it, and the look by setting the share from a script.
- A still image does not show the turning. That it turns, and how fast for
  a given pace, is asserted by the tests, not judged by eye.
- Real WebGL on a real phone has not drawn it; the renders are software
  WebGL.
- The plate drawing in and out is seen only as stills at its two ends; the
  motion between them was not judged by eye.
