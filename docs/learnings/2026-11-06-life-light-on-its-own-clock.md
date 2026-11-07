# Life cells ease on their own clock, not the generation's

The first smoothing pass for the Life field (PR #33) faded every cell from its previous generation's look to the current one as the beat's `phase` ran from 0 to 1. On theorem.rs the owner saw it flash. There were three causes:

1. The fade lasted exactly one generation, so its length followed the pace: about 0.67 s at rest, but about 40 ms at 24 generations a second when the model is busy. A busy field snapped.
2. Every cell started and finished its fade on the same frame, so the whole field pulsed in step with the beat.
3. When a cell's glyph changed (a newborn ageing, a death leaving a dot), the new glyph faded in from nothing while the old one faded out on a layer above. Halfway through, the cell showed both at half weight, so it blinked on every ageing step.

The field now keeps a light per cell (`src/lib/life/light.ts`). Each frame, a cell's level and tone ease toward its look with anime.js `utils.damp`:

- Rising light uses a 0.16 s time constant, falling light 1 s, whatever the pace. A birth blooms, and a death leaves a trail.
- A slowly drifting textmode noise field scales each cell's timing between 0.55x and 1.6x, so neighbours that changed on the same step still move apart.
- A living cell shows its age's glyph at once and lets the light carry the change, so there is no dip. A cell that died keeps its last glyph until its light has dimmed to a ghost's, then shows the dot.
- The person's edits and a resize settle the cells at once. Reduced motion settles every cell every frame.

`textmode.noise` sums octaves without normalising, so `noiseDetail(2, 1)` is set to keep values spread around one half.

## Evidence

- `light.test.ts` asserts the following:
  - a birth blooms over a fraction of a second, not in one frame;
  - a death fades over about a second and keeps its glyph until it is ghost-faint;
  - ageing never dips below either look;
  - motion is the same at 30, 60 or 120 fps;
  - stretch spreads cells apart;
  - settled cells stop moving.
- A scratch simulation compared the old renderer (phase plus cross-fade) with the new one. It used a seeded 160x60 field for 8 s at 60 fps. A blink means a living cell's light drops by 0.15 or more and recovers by as much.

  | Energy | Blinks (before → after) | Other change |
  | --- | --- | --- |
  | Rest | 2203 → 0 | none |
  | Mid | 8875 → 0 | p95 whole-field brightness swing per frame: 9.7% → 1.9% |
  | Busy | 18462 → 2 | cell changes of more than 0.2 in one frame: 28.8% → 0; frame-to-frame reversals: 102394 → 0 |
- Easing 33,300 cells costs a median of 1.0 ms per frame and 2.1 ms at p95, measured in Bun without the noise call.
- Headless Chromium renders the field in light and dark with no page errors, and two frames 400 ms apart differ. Headless SwiftShader runs at about 9 fps here, so the frame-to-frame numbers come from the simulation, not the browser.
