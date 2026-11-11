# Theo's body

Theo's face (`theo-face.md`) says what Theo looks like and how it expresses.
This plan gives the figure as a whole one physical body, so that travelling,
being carried, being let go of, touching an edge and settling are solved by
Rapier and not by a glide written by hand. Nothing about the face moves into
physics: the body is one rectangle, and the eyes and the matter answer to how
it moves.

The checklist in `theo-body.checklist.json` tracks this spec item by item.

## Source

The owner's note of 2026-11-11, "Rapier fits Theo at the movement layer",
pasted into the session that built this. It is not a file, so it has no hash.
Its points are the sections below: the split of responsibilities, one body to
start with, the three interactions, and the boundaries.

## Who owns what

| Responsibility                                           | Owner                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| Gaze, eye shape, lids, expressive tilt and timing        | the expression program and rig (`lib/face/`), as before       |
| Travel, dragging, release momentum, contact and settling | one Rapier body (`lib/face/body.ts`) and the placement driver |
| Particle lag, cohesion, pokes and recovery               | the particle field, as before                                 |
| Rendering                                                | the luma painter and its Canvas2D fallback, as before         |
| Whether a request is connected, working, asking or done  | the run's own events (liveness), as before, and nothing else  |

Rapier owns the outer holder's pose: where the figure is on the page. The rig
owns the visor's local transform inside that holder: tilt, squash, the small
trailing offset. The body never rotates, and the rig never moves the holder.

Not every grain is a rigid body, and neither eye is. There is one.

## The body

`FaceBody` is one dynamic body the size of the figure, weightless, with a
kinematic pin and four fixed walls at the window's edges, in the world the
figures share (`lib/world.ts`, [below](#one-world-with-kit)). Rapier is loaded
through that module's `loadRapier`, so Theo and Kit share one WASM chunk, and
only on first need: the pointer arriving on the figure, focus, a press, a
`go`, or Kit having a body in the world already. Until it has loaded, and
whenever it cannot, the glide that was there before carries the figure.

At any moment the body is one of four things:

| State      | What moves it                                              | Edges | Kit                    |
| ---------- | ---------------------------------------------------------- | ----- | ---------------------- |
| `resting`  | nothing: no step is run, and it sits exactly on its anchor | pass  | struck by a loose Kit  |
| `tethered` | a spring from the pin, which is where it is meant to be    | pass  | struck by a loose Kit  |
| `held`     | the hand: the body is put where the hand is                | pass  | nothing                |
| `coasting` | its own momentum against drag, after a release with speed  | solid | strikes it, and is met |

- **The tether** is a Rapier spring joint between the pin and the body, with
  the settling done by the body's linear damping. The joint's own damping acts
  only along the line between its ends, so a body approaching from the side
  orbits its pin; damping the body damps every direction. Stiffness follows
  from how long the trip should take (`tetherRate`), and damping is critical,
  so a trip arrives without swinging past: about 3 px of overshoot on a
  1,070 px trip.
- **Deliberate travel is the pin moving.** `go` moves the pin, the spring
  brings the body. The obstacle policy for that travel is that there are no
  obstacles: the body passes the window's edges while tethered, since a pin
  is always put somewhere the figure fits, and a perch flush against an edge
  must not rattle or report a collision.
- **A throw is dynamic.** Released with speed, the body coasts, slows under
  drag, and the window's edges are solid to it. Where it stops is where the
  person left it, exactly as a plain drop is.
- **Contact** is read from Rapier's collision events, with the speed into the
  wall taken just before the step that struck it.

## The feel

Ten of the numbers above are a matter of taste, and none of them was chosen
by a hand on a real display. They are kept apart in `lib/face/feel.ts`, each
with its bounds, and a person sets them in Settings, Appearance, under
"Theo’s movement". The values quoted in this document are the ones Theo
ships with.

| Group  | Setting    | Ships as | Bounds     | What it is                                                   |
| ------ | ---------- | -------- | ---------- | ------------------------------------------------------------ |
| Throw  | Drag       | 4.5      | 1.5 to 12  | the coasting body's linear damping                           |
| Throw  | Bounce     | 0.35     | 0 to 0.9   | the collider's restitution                                   |
| Throw  | Throw from | 140 px/s | 40 to 600  | the release speed below which it is put down                 |
| Travel | Pace       | 1×       | 0.5 to 2   | a multiple of `tetherRate`                                   |
| Travel | Settle     | 1        | 0.3 to 1.6 | the tether's damping ratio: 1 is critical, less swings past  |
| Travel | Look first | 170 ms   | 0 to 600   | how long the eyes lead the body                              |
| Touch  | Recoil     | 220 px/s | 0 to 600   | the speed a poke gives                                       |
| Touch  | Recover    | 7.5      | 2 to 20    | how fast a knock fades from the face, per second             |
| Face   | Lean       | 1×       | 0 to 2.5   | a multiple of the tilt and the gaze ahead; their clamps stay |
| Face   | Trail      | 1×       | 0 to 2.5   | a multiple of the visor's lag in its holder; its clamp stays |

- **One set for the page**, as there is one face. `FEEL` is read where it is
  used, so the face and the driver follow a change on the next frame. The
  body holds values inside Rapier (restitution, damping, the joint's
  stiffness), so it compares a revision counter each `advance` and sets them
  again when the feel has changed, mid-trip and mid-coast included.
- **What the person chose is kept in `lib/figures`**, in the browser's
  storage with the figures' switches, as only the settings they changed. A
  later change to what Theo ships with reaches everyone who left that
  setting alone.
- **Bounds are part of the setting.** A stored or passed value outside them
  is brought inside, and something that is not a number is as shipped. With
  every setting at either end, a trip still rests on its anchor and a throw
  still stays inside the window (tested).
- **What is not here** stays a constant: the fixed step and its catch-up, the
  speed cap on a throw, the thresholds for rest, and the clamps on tilt, gaze
  and lag. Those are correctness and bounds, not taste.
- **The panel has Theo on it.** Settings sits outside the chat shell that
  mounts the figures, so the panel mounts the face itself, with a slot for it
  to rest in, and a button that sends it across the strip and lets it come
  back, for the travel settings. Throwing and poking are done on Theo.
- **The panel is laid out as the rest of Settings is.** One row for each
  setting: its name and hint on the left, its value and slider on the right,
  under the name of its group. A changed row carries its own reset, which
  names the value Theo ships with; Reset all is the section's. The strip Theo
  rests in holds the top of the sheet while the rows scroll, so a change to
  the last row can still be tried on it.

The world steps at Rapier's default 1/60 s. Frames feed an accumulator; a
long frame runs at most five steps and drops the rest, so a tab that was in
the background does not replay a second of physics; and the pose drawn is
interpolated between the last two steps.

A layout change is not a force. When the anchor moves because the page
scrolled, the window resized or the perch reflowed, the body is shifted by the
same amount with its velocity untouched (`shift`). Scrolling a thread 123 px
keeps Theo on its perch in every frame and raises no event.

## The three interactions

### Carry and release

Theo follows the hand: while held, the body is where the hand is and nothing
else may move it. The eye matter lags behind as before, and the face leans
into the motion, looks a little ahead of it and trails slightly inside its
holder, all bounded.

On release the hand's last samples give a velocity (`releaseVelocity`). A hand
that paused before letting go gives none, and that is a drop: the figure stays
put. A hand that was moving gives a throw: the figure continues, slows and
stops. Speed is capped at 1,500 px/s. At about 940 px/s it coasts about
220 px. A throw is noticed as `person.throw`, a drop as `person.drop`.

Thrown into the window's edge, the figure stops against it with a restrained
bounce (restitution 0.35). The matter bursts from the struck side, the visor
is knocked back and squashed for a moment, the eye on that side winces more
than the other, and the face notices `body.bump.left|right|top|bottom`.

The release velocity tolerates sparse samples. A slow page may deliver pointer
events 100 ms apart; the window that counts as "recent" widens to the gap
between the last two samples, so a throw on a slow device is still a throw.

### Approach an artifact

A new place, `artifact`, is beside the artifact card in view: the selected
one, else the newest on screen; to its right when there is room, else its
left, else just above it. With no card on the page it is home.

Whenever Theo is sent anywhere more than 48 px away, the eyes turn toward the
destination first and the body sets off 170 ms later. The gaze establishes the
intention; the body follows it. The gaze lets go on arrival.

`visit`, a new performance in the book, uses it: look at the artifact, travel
to its side, wait to settle, look it over with a tilted head. In the story
`face-visit` the eyes turn about 50 ms after the call, the body sets off at
about 720 ms (after the look), and it settles 12 px beside the card.

Nothing sends Theo to an artifact by itself. The place and the performance
are there for the agent (`face.perform` with `use: "visit"`, or a `go` step in
its own program) and for reaction rules.

### React to a small disturbance

A poke pushes the body away from where it was touched, or down into the page
when touched in the middle or by keyboard: about 10 px, and the tether brings
it back to exactly where it was. The eye nearer the touch flinches more than
the other.

What the face then does is drawn from reaction rules that weigh its state, as
every reaction is. A calm Theo squints at a bump or winces; a wound-up one may
glare or go dizzy; a first throw startles, and being thrown again and again
in quick succession dizzies.

## One world with Kit

Theo and Kit used to share an engine and nothing else: two worlds, so a
thrown Theo went through Kit. Now there is one (`lib/world.ts`,
`FigureWorld`), and each figure puts its own bodies in it.

**What meets what.** Every collider says what it is and what it meets, as
bits (`IS`), and two touch only when each is among what the other meets.

| Collider                        | Is                   | Meets                          |
| ------------------------------- | -------------------- | ------------------------------ |
| Kit's surfaces and its walls    | `ground`             | `kit`                          |
| Theo's walls                    | `edge`               | `theo`                         |
| Kit standing, walking, or aimed | `kit`                | `ground`, `theoThrown`         |
| Kit loose in the air            | `kit`, `kitLoose`    | `ground`, `theoThrown`, `theo` |
| Kit just struck, or in the hand | `kit`, or nothing    | `ground`, or nothing           |
| Theo coasting                   | `theo`, `theoThrown` | `edge`, `kit`, `kitLoose`      |
| Theo resting or tethered        | `theo`               | `kitLoose`                     |
| Theo held                       | nothing              | nothing                        |

So Kit's ground is not Theo's, and Theo's edges are not Kit's. A thrown Theo
strikes Kit wherever it is. A Theo that is travelling or at rest passes a
standing Kit by, since a figure sent to stand beside a card must not shove
the fox off it. Kit loose in the air (thrown, flung, knocked, falling with
nowhere it is aimed) strikes Theo once and then goes past it, so Kit never
comes to rest on Theo; a jump aimed at a surface goes through a resting Theo.

**One clock.** Either figure steps the world when it moves, and both may be
moving. Each keeps a count of the steps it has lived through, and a step one
of them took is not taken again for the other (`pass`), so two figures in
motion do not run time twice. Theo's body has no gravity of its own; the
world's is Kit's.

**Theo thrown at Kit.**

- _Kit sees it coming._ Each step, Kit's body casts Theo's along its line
  (`KitWorld.coming`) and says how soon it arrives, from which side, whether
  ducking lets it over, how far Kit's feet must rise to clear it, and how long
  it will be passing. A throw dies away, so the forecast allows for drag: it
  looks only as far as the throw can reach, and a throw that will not get
  there, or will get there with nothing left, is not coming at all. Measured
  against the body, the forecast is right to within two steps.
- _Kit ducks_ when that lets Theo over its head, and stays down until Theo is
  no longer where it would stand up.
- _Kit jumps_ when it cannot duck: straight up, leaving the ground so as to be
  just clear as Theo arrives, and higher the longer Theo will be under it. It
  comes down where it stood.
- _With no time for either, Kit is struck._ Theo bounces off it. Kit is
  knocked off its feet the way Theo was going, with a share of Theo's speed,
  and lands on whatever is there. Being knocked is not the person's touch: no
  touch is reported for it.
- _In the person's hand_ Kit is not in the world at all.

**What Theo makes of it.** Meeting Kit is `body.meet.kit`, not a bump against
an edge: the head is knocked the same way, and the reaction is drawn from
rules of its own (startle, wince, curious, a wink when it is in good spirits,
dizzy when it keeps happening).

**Theo watches Kit jump.** While Kit is in the air, Theo's eyes follow it
(`Face.watch`). Where Theo is going still comes first, and the pointer comes
after.

**Kit thrown at Theo.** Theo, resting or travelling, is pushed and its tether
brings it back to exactly where it was. It reports the same meeting.

## Boundaries

- **The person's drag has priority.** While carried, a `go` from a
  performance, a rule or the agent does nothing. Pressing a coasting figure
  catches it where it is.
- **The response header's footprint does not change.** The gutter slot keeps
  its size; a larger Theo moves in its own layer above the page, as before.
- **Scroll and resize are anchor changes**, not throws (above).
- **Reduced motion** has no body. The figure is placed, not flown: no coast,
  no recoil, no lean, no lead of the gaze. A release is always a drop.
- **Quiet.** Asleep, the face ignores what happens to its body (`body.*`), as
  it already ignores the environment (`env.*`); a resting body runs no steps
  at all. A hand still wakes it.
- **Status stays honest.** Nothing the body does emits a run event or touches
  liveness. The face shows connection and progress only from the run's own
  events; movement is never evidence that a request is advancing. A test
  holds this.

## Decisions

| Decision           | Choice                                                                         | Why                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| How many bodies    | One, for the figure                                                            | The note's starting point. The eyes and matter already have a solver that tests run without a GPU or a physics world         |
| Engine             | `@dimforge/rapier2d-compat` 0.21.0, already a dependency, through Kit's loader | No second physics engine, no second WASM chunk                                                                               |
| Travel             | A dynamic body on a spring to a kinematic pin                                  | One body type for travel, poke and throw, so a poke mid-trip or a `go` after a throw needs no handover between two kinds     |
| Carry              | The body is placed at the hand each frame                                      | The hand is exact; a spring to the hand would lag the figure behind the pointer, and the eye matter already supplies the lag |
| Settling           | Joint stiffness with body damping, critically damped                           | Rapier's spring joint damps along its axis only                                                                              |
| Edges              | Solid only to a thrown figure, by collision groups                             | A perch flush with an edge must not collide                                                                                  |
| Kit                | One world for both figures, each collider saying what it is and what it meets  | Mirrored copies of each figure in the other's world would need keeping in step, and would still not be one collision         |
| Who steps it       | Whoever is moving, each counting the steps it has lived                        | Two figures pacing one world against the display would otherwise run it twice as fast                                        |
| Travel past Kit    | A travelling or resting Theo does not push a standing Kit                      | Theo is sent to things Kit may be standing on                                                                                |
| Where a throw ends | It stays there                                                                 | A drop stays where it is put, and a throw is a drop with speed                                                               |
| Lead of the gaze   | 170 ms, for trips over 48 px                                                   | Long enough to read as looking first, short enough not to read as a delay                                                    |
| What can be tuned  | Ten numbers in one module, set from Settings, kept per browser                 | The feel was never judged at 60 frames a second; whoever does judge it should not need a code change to act on it            |
| Without Rapier     | The earlier glide, unchanged                                                   | A browser that cannot load the WASM still has a face that moves                                                              |

## Files

```
src/lib/world.ts        FigureWorld: the one world, what each collider is and meets, the step each figure counts; loadRapier
src/lib/world.test.ts   the two figures in it together, with Rapier itself
src/lib/kit/physics.ts  Kit's body in that world: coming, duck, overhead, lift, struck
src/lib/kit/driver.ts   Kit's dodge (duck or leap) and being knocked
src/lib/face/
  body.ts         FaceBody: Theo's body in that world, the tether, hold, release, nudge, shift, the paced step; releaseVelocity
  body.test.ts    the body under bun test, with Rapier itself
  feel.ts         the numbers a person may set, their bounds, and what is in force
  feel.test.ts    the bounds, and what each setting does to the body and the face
  engine.ts       sway, heading, watch, bump, toss: how the face answers its body
  memory.ts       what a throw, a bump and meeting Kit do to mood
  reactions.ts    rules for person.throw, body.bump.* and body.meet.kit
  program.ts      the place "artifact"
  book.ts         the performance "visit"
src/components/face/
  driver.ts       loads the body, moves it by priority (hand, travel, coast, layout), tells the face, has it watch Kit in the air
  face-feel.tsx   the panel: a row for each setting with its own way back, Reset all, and Theo to try them on
src/lib/figures.ts                              keeps what the person changed of the feel
src/routes/settings/appearance.tsx              shows the panel when Theo is on
src/components/artifacts/artifact-message.tsx   the card says it is a perch
src/stories/registry.tsx                        the story face-visit
```

## Tests and evidence

**Execution correctness** (`bun test src/lib/face`, 34 of its tests came with
the body and 18 with the feel):

- the body (21, against Rapier itself): a trip rests exactly on its anchor
  with a small overshoot; a shorter `over` arrives sooner; a moving anchor is
  chased; a scroll under a resting body moves it with no velocity, and
  mid-trip adds no speed; held, it ignores travel; a slow release rests at the
  hand; a moving one coasts a bounded distance and reports where it landed;
  throw speed is capped; a throw at the right edge gives one `right` bump and
  stays inside; travel after a throw arrives; a poke recoils 3 to 24 px and
  returns exactly; a ten-second frame runs at most five steps; the pose
  between steps is interpolated; release velocity from quick, paused, sparse
  and single samples; a flush arrival beside an edge gives no bump;
- the face (13): it leans into travel and looks ahead; the visor trails; both
  stay bounded at any speed; a heading turns the eyes before the body moves
  and outranks the pointer; a bump knocks, squashes, closes the near eye more
  and recovers, for each side; a poke is asymmetric; the same bump draws a
  different reaction calm and wound up; a throw is noticed; nothing the body
  does produces a run event; asleep ignores `body.*`; reduced motion moves
  nothing; `artifact` compiles as a place and `visit` looks before it goes;
- the feel (18): every setting ships inside its bounds; a value outside them
  is brought inside and a non-number refused; tuning lays what is given over
  what ships and counts a revision only when something changed; the store
  keeps only what was changed, one setting can be put back alone, one
  dragged back to what ships is dropped and Reset all empties it; less drag
  carries a throw further; the throw threshold decides throw or drop; more bounce comes
  further back off the edge; pace changes when a trip arrives; a looser
  settle swings past and still rests exactly; a change takes hold of a trip
  and a coast under way; a pace changed while it rests is the pace a poke
  comes back at; every setting at either end still arrives and stays
  inside; lean and trail scale the face's answer and zero is none; a quicker
  recovery gets over a knock sooner; the face keeps its bounds at either end.

**In the browser**, headless Chromium on software WebGL, stories
`face-in-shell` and `face-visit`:

| What                         | Measured                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Poke                         | pushed 9.8 px, back to exactly where it was                                      |
| Carry, released at ~940 px/s | coasts 220.8 px and stays; `person.throw`                                        |
| Carry, paused, released      | moves 0 px; `person.drop`                                                        |
| Thrown at the right edge     | right edge peaks at 1265.8 of an inner 1272; `body.bump.right`                   |
| `go` during a carry          | 0 px from the hand                                                               |
| Sent home after a throw      | lands on the original gutter position                                            |
| Thread scrolled 123 px       | on its perch every frame; no event                                               |
| `visit`                      | eyes at ~49 ms, body at ~716 ms, settles 12 px beside the card, 3.1 px overshoot |
| Reduced motion               | no coast, `person.drop`; a poke moves it 0 px                                    |

The panel, at `/settings/appearance` in the same browser:

| What                                   | Measured                                                              |
| -------------------------------------- | --------------------------------------------------------------------- |
| Theo on the page                       | rests on the panel's slot, to the pixel                               |
| Send it across, as shipped             | reaches the far spot, 0 px past it, and is back on the slot after     |
| Pace 2×, Settle 0.3, Look first 470 ms | sets off about 350 ms later, swings 206 px past, and still comes back |
| Sliders by keyboard                    | each press is one step; the value and the stored setting follow       |
| Reload                                 | the three settings are in force again before anything is touched      |
| One row’s “Reset to”                   | that setting as shipped and no longer kept; the others stay           |
| Scrolled to the last row               | the strip holds the top of the sheet, with Theo still on its slot     |
| Reset all                              | every slider as shipped, nothing kept, the button disabled            |

Renders, under `docs/plans/evidence/theo-body/`: `visit.png` (looking,
travelling, arrived, looking it over), `thrown.png` (carried, in flight,
against the edge, at rest) and `tuning.png` (the panel, dark theme, scrolled
to its last rows, two settings changed).

**With Kit**, in `lib/world.test.ts` (the two bodies in one world),
`lib/kit/driver.test.ts` (Kit's driver against a thrown body) and
`lib/face/face.test.ts` (the face):

| Property                       | What holds it                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| A thrown Theo strikes Kit      | one bump against Kit on the right side, Theo comes back off it, Kit is told Theo's speed               |
| Travelling, Theo passes Kit by | an 800 px trip through where Kit stands arrives exactly, with no bump                                  |
| Whose ground is whose          | a thrown Theo goes up through Kit's surface, stops at its own bottom edge short of Kit's floor         |
| A loose Kit strikes Theo       | one meeting, Theo pushed and back exactly where it was, Kit lands on a surface                         |
| An aimed Kit does not          | a jump up through a resting Theo: no meeting, Theo stays at rest                                       |
| In the hand                    | nothing comes, nothing strikes; put down, it is struck again                                           |
| One clock                      | Theo's path step for step as alone while Kit walks or flies, whoever goes first in the frame           |
| The forecast                   | side and time; right to within two steps for three throws; nothing for a throw that falls short        |
| Duck                           | `over` for a Theo at head height; ducked it passes; standing again the same throw strikes              |
| Staying down                   | `overhead` while a slowing Theo is where Kit would stand, and not once it rests                        |
| Jump                           | a `rise` for a Theo along the ground; launched to it, Kit is not struck and lands where it stood       |
| Passing time                   | short at speed, the stated most for one that stops there                                               |
| Leaving                        | a figure that goes takes only its own bodies; the page's world is freed by the last one out            |
| Kit's driver                   | knocked the way Theo was going and lands, with no touch reported; jumps and comes down in place; ducks |
| The face                       | meeting Kit knocks the head and is `body.meet.kit`; `watch` beats the pointer and yields to `heading`  |

In headless Chromium, on the shell story with its WebGL backdrop left out
(that backdrop is why the page runs at 13 frames a second; without it, 41),
with a real mouse flick: thrown from close by, Theo met Kit and Kit was
knocked 196 px along the composer; from further off along Kit's feet, Kit was
in the air as Theo arrived, Theo went on past it, nothing met and Kit came
down where it stood; at Kit's head, Kit was crouched as Theo arrived, Theo
went over, nothing met and Kit stood again; and while Kit jumped to a message
above, Theo's gaze went from down to up and toward it, then back. Twice over,
the same each time. Renders: `meet-struck.png`, `meet-jump.png` and
`meet-duck.png`, each five frames of one throw, taken with the page's clock
turned a frame at a time so that taking the picture does not cost the page a
frame.

**How the throws were made.** That page runs at about 13 frames a second and
delivers events 75 to 190 ms apart, so a real-time mouse gesture cannot throw
anything there. The carry was driven with pointer events dispatched in the
page with their timestamps set, which is the same path a real pointer takes
from the event listener onward. A throw by a real hand on a real display has
not been seen.

**Not done here:**

- How the motion feels. What Theo ships with (`feel.ts`) was tuned against
  numbers and still frames. Whether the coast is restrained enough and the
  lean reads as weight is for someone watching it at 60 frames a second, and
  the panel is how they act on what they see: once they have, the values
  they settle on should become what ships.
- Rapier loading because of Theo alone. In the shell Kit has already loaded
  it. The loader's failure path (the glide stays) is exercised by tests only
  in that a face with no body is the path every earlier test ran.
- The desktop window's webview.

## Not yet

- **Obstacles other than the window's edges and Kit.** A thrown Theo passes
  over the composer and the sidebar. Kit's surfaces are in the same world now,
  so this is a question of which of them Theo should meet, not of building
  them.
- **An automatic visit.** A rule that sends Theo to an artifact when one
  arrives or is selected. It wants deciding how often that is welcome.
- **Places beside other things**: a tool card, a line of a diff, "the relevant
  area" inside an artifact and not just its side.
- **Bodies for parts.** Eyes that are bodies of their own, joined to the
  figure. Only if the rig's answer to the one body proves too stiff.
- **Kit minding a travelling Theo.** Sent somewhere, Theo passes through a
  standing Kit. Kit could step aside for it.
- **Kit with reduced motion** has no body, so nothing meets it.
