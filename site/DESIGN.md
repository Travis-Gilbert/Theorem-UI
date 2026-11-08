# join.theorem.rs: design

The page is one thing to look at and one thing to do: a screen on a slate desk, showing a short film that becomes the real app in the same rectangle. Everything else stays small.

Source of truth for the idea: the Marketing Experience v2 brief. This file says how the code does it. `evidence/LEDGER.md` says where each part came from.

## Three destinations

| Destination   | What it is                                                                                  | Code                                 |
| ------------- | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| Experience    | The monitor: poster and ambient loop, film, the live app                                    | `src/experience/`                    |
| Possibilities | One surface with three tabs: Follow a curiosity, Make something, Find a way forward. Each can set a draft | `src/possibilities/possibilities.tsx` |
| Join          | The signup and the technical links                                                          | `src/join/join.tsx`                  |

Nothing else is a destination. There is no scroll of feature sections.

Two pages of reading sit outside the scene, the way the docs do: `/how-it-works` and `/our-thinking` (`src/reading/reading-page.tsx`). Their words are sections 4 to 7 of the Marketing Brief. Join links to both and the credits link to Our thinking, in a new tab, so the film and the live app stay as they were.

## Two layouts

- **Scene** (wide enough, and motion allowed): `src/scene/`. Real HTML on surfaces in a world, and a small table of named views. `camera.ts` moves between views with anime.js, and nothing a visitor does inside a surface moves it. The world stands on a slate desk under a paper wall: the monitor's foot rests on the desk, and the two sheets lie on it toward one vanishing point. Possibilities and Join flatten to face the visitor when focused. A tall window puts the intro above the scene and keeps the monitor as wide as it can.
- **Flow** (narrow, or reduced motion): the same components stacked, with no transforms and no camera.

The navigation sits outside every transform and outside the iframe, so it is always reachable. Hash routes: `#experience`, `#possibilities`, `#join`.

## Material

Tokens are in `src/styles.css` and scoped to this site. The app in the frame keeps its own theme.

| Token                       | Value                 | Use                                                                     |
| --------------------------- | --------------------- | ----------------------------------------------------------------------- |
| `--paper`, `--paper-raised` | `#F1F3F5`, `#F8F9FA`  | Cool paper                                                              |
| `--slate`, `--slate-raised` | `#202733`, `#2C3544`  | Terminal slate                                                          |
| `--muted-ink`               | `#626B78`             | Secondary text                                                          |
| `--brass`                   | `#C8A45D`             | Fills controls and marks on slate. On paper it is decoration (2.12:1)   |
| `--brass-deep`              | `#806126`             | Anything on paper that means something (5.16:1)                         |

Type: IBM Plex Sans. Block Berthold Condensed for the wordmark only; the file is licensed and not committed. The wordmark is `--slate-raised`, because at this size and weight `--slate` reads as black.

## The field

`src/field/` is real Conway's Life, B3/S23 through `@life`, and `conway.test.ts` proves every generation follows the rule. Each load starts a new field from small seeds (R-pentomino, acorn, soups) that grow at four generations a second. Living cells are slate; dying cells turn gold and fade over a few seconds. The pointer brings real cells to life along its stroke, and from then on they follow the rule like any other cell. Over a control, text, or the monitor it does nothing.

This departs from v2 section 10, which reserves gold for a response near the pointer. The owner's direction is that deaths fade to gold and the pointer is part of the Life, and that direction governs.

## The reveal gate

`src/experience/machine.ts` is a pure reducer, tested in `machine.test.ts`. It stores what is true and derives what is seen:

```
ambient -> watching -> preparing -> live
                    \-> unavailable
```

Live needs all three: the film finished or was skipped, the app said it was ready, and the camera settled. A timeout can fail the app and can never make it ready.

Rules the code keeps:

- The iframe does not exist until Watch or Try, and it is never remounted. Leaving and returning keeps what the visitor did.
- The final still covers the frame only until the app has been shown once. After that the app's own state is what the visitor left.
- Nothing replays by itself. The end of the film takes no focus. Only an explicit Try focuses the message box.
- Try this in Theorem sets a draft on an explicit click and never replaces a draft the visitor already has.

## The bridge

Two halves of one contract, over penpal, the library the app already uses for its IDE frame:

- Parent: `src/experience/bridge.ts`. Starts listening first, then loads the app, with `location.replace` so the frame's loads never reach the visitor's Back button.
- Child: `src/lib/embed/site-bridge.tsx` in Theorem UI, branch `claude/site-embed-bridge`.

The child is inert until the site activates it. Ready means the thread has loaded, the fonts are in, the composer is laid out and the thread is scrolled to its end. On mount it only reads: no model turn, no write. Signed out or unreachable comes back as a failure, and the site shows its own recovery. Escape inside the frame reaches the parent only when nothing in the app closed on it.

The app is given a logical size (1280 by 720, or 390 by 720) and scaled, so it lays out the same however big the monitor is. That is what lets a recorded frame and the live app agree.

## The film

`film/` is its own Remotion package, used at build time only. `film/README.md` says how to make it, and `film/manifest.json` lists every source with its rights status.

| Time        | Picture                                                                 | Voice                                       |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| 0 to 3.5 s  | Typographic plate: Licklider, Man-Computer Symbiosis, 1960              | Licklider imagined thinking with computers. |
| 3.5 to 7.4  | Illustration, labelled as one: two people writing on one display        | Engelbart showed what people could do...    |
| 7.4 to 9.4  | The turn: one mark held still over speed-ramped cuts of the product     | That idea still matters to me...            |
| 9.4 to 15.6 | The real app: a question, an answer, a follow-up                        | ...understand, try, and create.             |
| 15.6 to 20  | The outcome, ending on the still the live app takes over from           | I'm building Theorem...                     |

The turn takes its idea from the motion reference supplied with the brief: one registered mark, cuts slowing from 100 ms to 400 ms. None of its assets. The fast cuts stay on the light side of the luminance range, and the colour changes only once they slow, so the film stays under three flashes a second. `evidence/oracles/film.mjs` measures that.

Product footage is real and retimed to fit. Nothing is staged.

## Stories and checks

Every component has a story at `/story/<id>`, listed in `/stories.json`. Both exist only in development: a production build ships neither, nor the fixture film.

`/story/experience` runs the whole page against a fixture app, with each failure reachable by URL: `?delay=ms`, `?fail=reason`, `?silent`, `?film=broken`, `?absent`. `?real` uses `VITE_DEMO_URL`, and `?film=real` uses the rendered film.

| Oracle                         | Class                  | Claim                                                                        |
| ------------------------------ | ---------------------- | ---------------------------------------------------------------------------- |
| `bun test src/experience`      | logic                  | The gate's table                                                             |
| `evidence/oracles/transition.mjs` | interaction         | End, skip, delay, failures, return, resize, reduced motion, against the fixture |
| `evidence/oracles/app-bridge.mjs` | interaction         | The same contract against the real app                                       |
| `evidence/oracles/handoff.mjs` | static and interaction | Final still against the live frame, with a collage                           |
| `evidence/oracles/film.mjs`    | static                 | Exports, flash count, captions                                               |
| `bun test src/field`           | logic                  | Every generation is B3/S23; it grows and renews, and neither empties nor floods |
| `evidence/oracles/field.mjs`   | motion                 | Deaths fade in gold, the pointer makes real cells, quiet over surfaces, a new field each load |
| `evidence/oracles/destinations.mjs` | interaction       | Three destinations, tabs, signup states, the reading pages                   |

The oracles run against the dev server on port 3100. `destinations.mjs` also needs `wrangler dev` on 8799, for the real signup endpoint.

## Deploying

`wrangler` must be given `--config wrangler.jsonc`, which `package.json`'s scripts do. Without it, a `.wrangler/deploy/config.json` in the parent repository redirects wrangler to the app's Worker.

The production build has no app configured, so it ends the film with an honest "not open to try here yet" and a way to Join. The public demo is a separate piece of work: until it exists, `VITE_DEMO_URL` stays unset in production.
