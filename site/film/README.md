# The Experience film

Remotion, at build time only. The site gets ordinary video files and never runs
Remotion. Everything here is its own package, so nothing in it reaches the site's
bundle.

## Make it

With the demo stack up (`node demo/local-stack.mjs`, from `site/`):

```bash
PLAYWRIGHT_BROWSERS_PATH=0 node film/capture/capture.mjs
```

That records the real app: a question and a follow-up, two real model turns, once.
It throws away a take that did not finish, used tools, or has corrupted text, and
archives earlier takes so the rail shows one conversation. `CAPTURE_THREAD=1` keeps
the current take and only refreshes the phone scroll and the final stills.

```bash
cd film && bun run dev
```

Studio, for reviewing scenes. Then:

```bash
cd film && bun run render
```

renders both layouts, the ambient loops and the posters into `../public/film/`, with
captions and the transcript. `node evidence/oracles/film.mjs`, from `site/`, checks
the result.

## What is what

- `src/timeline.ts` is the only place frame numbers live: scenes, narration, captions.
- `src/film.tsx` is the film. `src/ambient.tsx` is the loop behind Watch.
- `src/Root.tsx` registers the compositions and reads the capture's marks from
  `state/thread.json`, which retime the product footage to fit.
- `capture/` is everything that touches the app.
- `manifest.json` is every source, with its rights status. Read it before adding
  anything from outside.

## Before publishing

The voice is scratch, for timing. `manifest.json` says how to swap in the founder's
take. Archival clips go in through the `archival` prop only when they are cleared,
with their own labels; the film is complete without them.

The Remotion licence is free for individuals and companies of up to three people,
including commercial use. A company of more needs a licence. Versions are pinned to
4.0.540 because bun's three-day release gate blocked 4.0.541 on 2026-11-06.
