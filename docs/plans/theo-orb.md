# Theo as a thinking orb

While the agent works, a small dotted orb turns beside the words that say
so. This plan makes Theo that orb: when Theo is on and a run is at work,
the eyes give their matter to one ball of dots that turns, with a few
grains in orbit round it. It is held by the run itself, and the run moves
it: each tool call makes it turn faster and stirs it, and the harder the
run was asked to think, the larger it is.

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

The orb they point to is `thinking-orbs` by Jakub Antalik (MIT), which the
app's inline indicator already uses
(`components/assistant-ui/elements/thinking-indicator.tsx`). It draws on a
2D canvas, and each of its states is a function of the clock, which is why
it repeats. None of its code is here. What is taken is the idea: a ball of
dots that turns, with grains on tilted orbits.

## What is drawn

Nothing new draws. The orb is Theo's own 1200 grains, seated differently,
painted by the painter the face already has (luma.gl instanced quads,
Canvas2D where there is no WebGL).

A feature has three new numbers (`lib/face/channels.ts`,
`lib/face/feature.ts`):

- **globe**: its matter set as dots on a ball seen from the side, this many
  rows from pole to pole. 0 is flat, as every feature was. The ball leans
  toward whoever looks, the far side is dim, and half of the matter a flat
  feature keeps on its rim goes into three orbits round the ball, each a
  bright head with a fading tail.
- **spin**: how fast the globe turns, in turns a second.
- **stir**: how much it is stirred: its rows slide past each other, its
  axis wanders, its orbits quicken and tilt.

What the globe has turned, and how much it has been stirred, are kept by
the matter and added to each step (`lib/face/particles.ts`). They are not a
function of the clock. So a change of speed never jumps the ball, and where
it is at any moment depends on everything the run has done so far.

## What moves it

Two signals, measured from the run (`lib/face/signals.ts`,
`lib/face/work.ts`), fed to the face each frame by the driver:

| Signal       | 0..1                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run.pace`   | How busy the run is with tools. Each call that starts or ends pushes it up; it halves every 2.4 seconds. A failed call pushes 1.6 times as hard. Each push lands with a strength of its own, between 0.7 and 1.3 of the usual. |
| `run.effort` | The reasoning effort the run was asked for: low 0, medium 0.25, high 0.5, xhigh 0.75, max 1. The middle where none was asked for.                                                                                              |

While nothing runs both are 0.

The tool calls are counted where the face already hears of them
(`useFaceRequests` in `lib/face/operations.ts`): a call is counted when its
part appears in the running message and again when it has a result. The
effort is the conversation's own setting, else the account's default
(`requestedEffort` in `lib/theorem/generation.ts`). A model's own default
effort is not read, so with neither set the orb is the middle size.

The form (`orb` in `lib/face/book.ts`) follows them:

| Channel     | At rest | Follows      | By   | So                             |
| ----------- | ------- | ------------ | ---- | ------------------------------ |
| `orb.spin`  | 0.11    | `run.pace`   | 0.7  | a turn every 9 s, up to 1.2 s  |
| `orb.stir`  | 0.14    | `run.pace`   | 0.8  | barely stirred, up to 0.94     |
| `orb.scale` | 0.76    | `run.effort` | 0.54 | radius 10.6 to 18.2 face units |

The visor is 100 by 64 face units; at its largest the ball and its orbits
reach 27 from the middle.

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
- **Reduced motion.** The ball does not turn and is not stirred, and
  nothing is followed, as with sound: the orb is there, at the size it has
  at rest, for as long as the run works.

## Files

```
src/lib/face/
  channels.ts     globe, spin, stir
  feature.ts      the globe's seats and each grain's light
  particles.ts    what a globe has turned and been stirred, kept per feature
  signals.ts      run.pace, run.effort
  work.ts         the run's pace and effort as numbers
  engine.ts       run.work, run.rest; nothing turns with motion reduced
  reactions.ts    work-orb
  book.ts         the orb form
  operations.ts   counts tool calls, reads the effort asked for
  orb.test.ts
src/components/face/driver.ts   feeds the two signals each frame
src/lib/theorem/generation.ts   requestedEffort
src/lib/theorem/runtime.tsx     passes it to useFaceRequests
```

## Tests and evidence

`bun test src/lib/face/orb.test.ts`: 21 tests. The work meter (a push per
call, the decay, the cap, a failure pushing harder, pushes that differ,
nothing while nothing runs, the effort levels); the globe (on a ball, in
dots, far side dim, a whole turn brings it back, orbits outside the ball
and not piled at their ends, flat with no rows); the form (held from work
to rest, never left out by chance, back after an ask, faster and more
stirred with pace, no jump on a change of speed, larger with effort and
inside the visor, still with motion reduced, the relief sequence kept, the
program compiles and the manual lists the signals).

Renders under `evidence/theo-orb/`, from the stories `face-sound` and
`face-in-shell` in headless Chromium on software WebGL. The run in them is
set by the capture script: the liveness, the effort, and tool calls counted
through the same meter the runtime uses.

- `efforts.png`: low and calm, high and calm, max after four tool calls,
  and high in the light theme.
- `run.png`: seven frames through one run at high effort: forming, calm
  twice, twice after four tool calls, the run finishing, and after.
- `reduced-motion.png`: max effort and four tool calls with motion reduced.
- `in-shell.png`, `phone.png`: the orb beside a reply in the app's shell,
  at desktop width and on a phone.

## Not seen

- No live run has moved it. The counting was checked by a unit test of the
  message parts and by driving the meter from a script, not by an agent
  calling tools in the signed-in app.
- A still image does not show the turning. That it turns, and how fast for
  a given pace, is asserted by the tests, not judged by eye.
- Real WebGL on a real phone has not drawn it; the renders are software
  WebGL.
