# Theo and sound

Theo's face (`theo-face.md`) could be moved by a program, by the person's
hands and by the run. This plan lets it hear what the page plays: a reply
read aloud turns Theo into a small retro loudspeaker for as long as the
voice is really sounding, and the page gets a voice to read replies with.

Three things are added, each usable without the other two:

- **Signals.** Live numbers the page measures. A program ties a channel to
  one with a new step, `follow`.
- **Forms.** A rule that says what ends it gives the face a form: a
  performance held from one event until another, under whatever else the
  face does.
- **A voice.** One sound graph for the page, a meter on it, a provider seam
  (text in, audio out) with a model that runs in the browser behind it, and
  a Read aloud button on a reply.

The checklist in `theo-sound.checklist.json` tracks this spec item by item.

## Source

Agreed with the owner in the session that built it, on 2026-11-11. In their
words: no "animation for listening" but "the ability to react to sound and
the ability to draw self a mouth and speak"; "Theo is sort of already boom
box shaped ... instead of showing Theo talking it's Theo turning into boom
box speakers with sound waves emitting from the sides"; "just a retro boom
box design"; "pair its activities with transforming into electronic
devices"; "wire up phonon", the 31M model; and people may "bring their own
ElevenLabs or similar provider keys". It is not a file, so it has no hash.

On seeing the first loudspeaker the owner asked for two changes, made
here: "remove the middle piece on the bottom", which "looks like a bear's
nose", and make the eyes "less subwoofer shaped and more like the mesh of
a speaker cover". On seeing that, of the mesh: "not quite granular
enough, like what if we reduced the size of the dots by a little bit more
than half and instead used 10 dots?". That is made here too.

Two limits were agreed with it and are kept here:

- Theo never opens the microphone and never starts speech to text by
  itself. The sound graph has outputs only; every sound signal is measured
  from audio the page is playing.
- Nothing is inferred about the person from a voice. The meter reads level
  and timing.

## Signals and `follow`

A signal is a named number between bounds that the page measures as it
happens (`src/lib/face/signals.ts`):

| Signal        | Is                                                               |
| ------------- | ---------------------------------------------------------------- |
| `sound.level` | how loud what the page is playing is, now; 0 while nothing plays |
| `sound.low`   | the low end of it: the body of a voice, a bass                   |
| `sound.mid`   | the middle: vowels                                               |
| `sound.high`  | the top: consonants, hiss                                        |
| `sound.beat`  | 1 when a sound sets in (a syllable, a beat), dying away after    |
| `body.speed`  | how fast the figure is moving on the page                        |

A program cannot set one. It ties a channel to one:

```json
{ "op": "follow", "channel": "mouth.h", "signal": "sound.level", "amp": 6 }
```

Each frame the channel is `amp` times the signal away from wherever it
otherwise is. With `for` the tie lasts that many milliseconds; without, as
long as the performance holds, which with `keep` is until something lets
go. A `release` of the channel ends what it followed too, and a `release`
of everything ends every tie. A tie comes in and goes out over 140 ms.

This is the whole of how a face speaks. Nothing says "speaking": the mouth
opens because the level is above nothing, and it is above nothing only
while audio is going out of the loudspeaker. A pause in a sentence shuts
it.

With motion reduced nothing follows the sound. A tie still ends when it is due to,
so what reads the ties (the steady arcs) does not show one that is over.

## Forms

A reaction rule may now say what ends it:

```json
{
  "id": "sound-boombox",
  "on": "sound.start",
  "until": "sound.stop",
  "do": "boombox"
}
```

A rule with `until` gives the face a **form**. A form plays on its own
layer, between the mood and the reactions (`mood`, `form`, `reaction`,
`performance`, `hand`), and is held from the `on` event until the `until`
event. So the face still blinks at a poke, still performs what the agent
asks, and is a loudspeaker again after.

- A form is drawn by weight among the rules that fit, and is never left
  out by chance: doing nothing is not a candidate.
- While a form is held the face does not fall asleep, and does not smile
  at the person with eyes that are now something else.
- `face.read` reports it in the state as `form: {name, until}`, with the
  signals that are away from nothing.

Three rules come with Theo: `sound-boombox` (weight 3) and `sound-speak`
(weight 1) are forms for a sound from start to stop, and `sound-thump` is
an ordinary reaction to a sound getting loud.

## The loudspeaker

`boombox` is the first device. It is made of the face's own matter, with
three additions to what a feature can be (`src/lib/face/feature.ts`):

- `mesh`: the matter gathered into dots inside a rim, that many across the
  middle, every other row set between the dots of the last. Ten is a
  speaker's cover: it was five, and the owner asked for ten with dots
  less than half the size. A dot is now 0.3 of the step between two,
  which with half the step is a third of the width it had.
- `slats`: the matter gathered into that many bars. Seven, turned a
  quarter, is a tuner strip.
- `rings`: the matter gathered into that many rings from the middle out.
  The first loudspeaker's cones were three of these. Nothing in the book
  uses it now; it is kept for a device that wants it.

The eyes become the mesh covers of two speakers and move apart, with a
`dial` above and between them. Nothing sits under the dial: the first
version had a cassette deck there, and it read as a nose. The speakers
swell with `sound.low` and `sound.beat`, the dial with `sound.high`.

Ten dots across a cover are 2.6 face units apart, and a grain at its
usual size is wider than that, so the first render of ten was a filled
disc. The form therefore draws its matter at half size and a third
brighter (`matter.size` 0.5, `matter.glow` 1.35) for as long as it is
held. The rim and the dial are finer for it too. In the gutter the dots
are about two CSS pixels apart: a 2x screen shows them as dots, and a 1x
screen as a texture.

What leaves the sides is not matter. Matter is clipped to the visor, so
the arcs are drawn by the page outside it (`.face-waves`, three arcs a
side) from two channels, `emit.left` and `emit.right`, which the form ties
to `sound.level`. A quiet sound's arcs die close by; a loud one's reach
the end. Their colour is the eyes' leaned toward the page's ink, so they
show on a light page.

A form is larger than Theo at rest: three times, or as much of that as
fits between the window's edge and the words it perches beside, never less
than twice. Once it has emitted it keeps room for its arcs until it lets
go, so a pause does not slide it about.

With motion reduced the form is taken and does not pump. Two arcs a side
are drawn still for as long as there is sound, and go when there is none.

`speak` is the other form: a `mouth` feature whose height follows
`sound.level` and whose width narrows with `sound.mid`. `thump` is a short
kick for a sudden loud sound.

Later devices are meant to be built the same way: features, meshes, bars
and rings, and ties to signals.

## The page's sound

`src/lib/sound/graph.ts` is one Web Audio graph for the page. Everything
the page plays goes through it to the loudspeaker and past an analyser, so
whatever speaks is heard by the same meter and the face never needs to
know who is talking. It plays raw audio as it arrives, block after block
with no gap, and an audio file. Nothing is made until something is played
or the graph is woken. `wake()` is for the moment a press is handled:
Safari starts audio only from inside one, and the voice a press asks for
can be seconds away, so the speech adapter wakes the graph in the call
the press makes, before it waits for anything.

`src/lib/sound/meter.ts` reads the analyser's latest block once a frame
into the five sound signals and three events:

| Event         | When                                                             |
| ------------- | ---------------------------------------------------------------- |
| `sound.start` | the level is above the audible mark and was not                  |
| `sound.stop`  | silence for 0.35 s with nothing left to play                     |
| `sound.loud`  | the level is near the top and well over where it has lately been |

A pause while more is due is not a stop, so a form is held through the
gaps in a sentence. A sound's own start is not a jump: `sound.loud` waits
until the sound has been going a second.

The driver feeds the signals to the face and gives it the events each
frame (`src/components/face/driver.ts`, `hear`). A driver that stops takes
the form off, since nobody is left to hear the sound end. One that starts
while sound is playing was not told it began, so it asks the graph
(`sounding`) and gives the face the start it missed.

## Where the voice comes from

`SpeechProvider` (`src/lib/speech/provider.ts`) is the seam: `speak(text)`
resolves to a stream of mono blocks at a sample rate. A provider plays
nothing; playing is the graph's.

One provider is built: **Phonon** (`src/lib/speech/phonon.ts`), Gradium's
`phonon-tts`, with its default 31M English model. It runs in the browser
in the package's own worker and needs no key. The model, about 65 MB, is
fetched from its pinned Hugging Face commit the first time someone presses
Read aloud and kept in the browser's cache; a page that never speaks never
fetches it.

The voice it speaks with ships in the repo:
`src/lib/speech/voice-theo.safetensors`, a Phonon speaker latent the owner's
ears chose on 2026-11-12 — a clone of the Buttery v4+v2 join (Gradium voice
`KtDVnkQ8XhyVLI1w`), its provenance and the consent caveat in
`docs/learnings/2026-11-11-buttery-reference-voice-and-phonon-cloning.md`.
`phonon.ts` adds it to the model with `addVoice` once the model is loaded,
and falls back to the model's default voice if the add fails. What ships is
a touch quicker than the model's own pace (`duration_delta` -0.05, fixed at
load as the package asks) and carries `lib/speech/eq`'s tilt — +2.5 dB
peaking at 3.2 kHz, +1.5 dB high shelf at 7 kHz — the owner's pick of
2026-11-12 (`tune2-fast05-crisp`). The tilt raises the spectral centroid
about 9% with the f0 median untouched, crispness without pitch, and the
in-app biquads match the approved ffmpeg render to 0.46% rms. Directed
prosody is deferred: ordinary sentences ship as the model reads them.

`phonon-tts` is pinned at 0.7.0, bumped at the owner's ask on 2026-11-12,
two days and 21 hours after its release — inside the three days this
repository waits before installing a release (`bunfig.toml`) — so it lands
under `minimumReleaseAgeExcludes` with a dated comment, as dockview did
before it. Against 0.6.0 the typings differ only in comments, but
`worker.js`, `hub.js` and the wasm binaries differ and a `gpu/` directory
(the WebGPU path) is added: the bump is not comment-only, and the next
listening pass in a browser doubles as its verification.

`speechAdapter` (`src/lib/speech/adapter.ts`) is assistant-ui's
`SpeechSynthesisAdapter` over the seam. An utterance is `starting` until
the first audio is handed to the graph, then `running`, then `ended` with
how the playback ended. One thing is said at a time. What is spoken is the
reply as it would be read aloud (`speakable.ts`): no marks, a block of
code named and not read, a link by its words, at most 4,000 characters.

The Read aloud button (`src/components/chat/read-aloud.tsx`) sits after
Copy on an assistant message. While the voice is being fetched it says so,
with a percentage when the size is known; while it reads it is Stop
reading. A reading that fails, because the voice could not be fetched or
broke off, says "This could not be read aloud." beside the button until
something is read again. The button tells the adapter which reply it is
on (`asked`), and the adapter names that reply when it fails (`failed`).

**Hugging Face refuses pages on `workers.dev`.** A request whose `Referer`
is any `workers.dev` address is answered 404 with no CORS header, for the
model's listing and for its files; other hosts tried (`theorem.rs`,
`pages.dev`, `vercel.app`, `example.com`, `localhost`) are answered. So the
voice cannot be fetched on a Workers preview or on the
`theorem-ui.<account>.workers.dev` address, and Read aloud there ends in
the message above. `theorem.rs` is not refused. Serving the model from
Theorem's own origin would end the dependence; that is the owner's call
(see Not yet).

## Decisions

- **A tie, not a flag.** The face is given numbers, and a program decides
  what they move. A talking state would have been simpler and would have
  let the face lie.
- **One graph.** A second player with its own context would be invisible
  to the meter.
- **Arcs outside the visor.** The visor is what Theo is; a device that
  only showed inside it could not send anything out of its sides.
- **The form is sized to the room.** In a narrow gutter a three-times
  figure with arcs covered the reply's first words.
- **No timings in the seam yet.** A provider could say when each word
  falls; nothing reads that today, so it is not in the interface.
- **The story's fake API answers only its own origin.** It answered every
  host's `/api/` path with a 404, which stopped the model being fetched.

## Files

```
src/lib/face/
  signals.ts      the signals and their bounds
  program.ts      the `follow` step
  player.ts       ties laid each frame, kept with a kept performance; which signals a channel is tied to
  layers.ts       the `form` layer
  reactions.ts    `until`, and drawing a form; the three sound rules
  engine.ts       feed, forms taken and let go, emitting, the manual's signals
  feature.ts      mesh, bars and rings
  channels.ts     `mesh`, `slats`, `rings`, `emit.left`, `emit.right`
  book.ts         boombox, speak, thump
  memory.ts       what a sound does to the mood
  operations.ts   `follow` and `until` in the descriptions
src/lib/sound/
  graph.ts        the page's one audio graph
  meter.ts        level, bands, beat; start, stop, loud
src/lib/speech/
  provider.ts     the seam
  phonon.ts       Phonon in the browser
  speakable.ts    a reply as it is read aloud
  adapter.ts      assistant-ui's speech adapter over the seam
src/components/face/
  driver.ts       hears the graph each frame; sizes a form; draws the arcs
  face-stage.tsx  the arcs' element
src/components/chat/read-aloud.tsx   the button
src/components/icons.tsx             the owner's read-aloud icon, now used
src/lib/theorem/runtime.tsx          the adapter given to the runtime
src/styles.css                       .face-waves
src/stories/                         the story `face-sound`; the fake API's origin
```

## Tests and evidence

**Execution correctness** (`bun test src/lib/face src/lib/sound
src/lib/speech src/stories`):

- signals, `follow`, forms, rings, bars and mesh (25, `lib/face/sound.test.ts`):
  bounds; a tied channel moving with the signal and with nothing else;
  `for`; a kept performance keeping its ties; refusals by path; nothing
  following with motion reduced, and a tie with `for` ending then all the
  same; a `release` ending the ties of what it lets go, one channel or
  all; the layer order; a form held from start
  to stop and the face back to two eyes; never left out, and both forms
  drawn; the loudspeaker's parts and what it emits; the steady arcs with
  motion reduced; the mouth; a reaction over a form; no sleep while one is
  held; a loud sound as a moment; the manual; the three performances
  compiling without a note; rings in bands; bars in rows; a mesh in dots
  inside a rim; a plain feature
  unchanged;
- the meter (9, `lib/sound/meter.test.ts`, tones the test makes): the
  decibel scale; silence; one start and a level that follows loudness;
  each band hearing its own pitch; a pause with more to come, and one stop
  when nothing is left; a beat that dies away; a jump that is loud once;
  a sound loud from its start that is not a jump; a long frame;
- the read-aloud text (10, `lib/speech/speakable.test.ts`);
- the adapter (7, `lib/speech/adapter.test.ts`, with a provider and a
  player the test supplies): starting until audio is on its way; stopped;
  one at a time; a provider that fails; a failure named for the reply it
  was asked for, a voice that breaks off part way being one and a stop
  not; the sound woken before anything is awaited; nothing to read;
- the story's fake API (1 added, `stories/fake-theorem.test.ts`): another
  host's `/api/` is passed on.

The whole list (`src/lib/face src/lib/kit src/lib/figures.test.ts
src/lib/world.test.ts src/lib/sound src/lib/speech src/components/face
src/components/kit src/components/chat src/components/artifacts
src/stories`) is 553 tests in 45 files.

**Built.** `NITRO_PRESET=cloudflare_module bun --bun vite build` finishes.
The voice package's worker and four WebAssembly files (about 4.4 MB each,
1.5 MB compressed) are emitted as public assets and fetched only on use;
the server bundle carries 21 kB of its JavaScript and none of the
WebAssembly.

**Seen** (headless Chromium on software WebGL, the story `face-sound` at
1280 by 800, 2x; renders in `evidence/theo-sound/`):

| Render               | Shows                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `boombox.png`        | a speech-shaped test tone playing: two mesh speaker covers, the dial, arcs both sides, clear of the words |
| `boombox-light.png`  | the same in the light theme, on the visor                                                                 |
| `speak.png`          | the mouth form under the same tone                                                                        |
| `reduced-motion.png` | motion reduced: the form taken, two still arcs a side                                                     |
| `in-shell.png`       | the story `face-in-shell`: the form at its full three times, where the gutter has room                    |
| `reading.png`        | the real voice reading the reply: the form held, the button now Stop reading                              |
| `page.png`           | the whole story page                                                                                      |
| `could-not-read.png` | the model's host unreachable: the button back to Read aloud, and the words beside it                      |

With the real voice in that browser: pressing Read aloud fetched
65,049,306 bytes, the first audio came after about five seconds, the form
was held for the whole reading including its silent gaps, and Theo was two
eyes again at the end. Pressing Stop reading two and a half seconds in
silenced it at once and Theo was at rest within half a second.

With the browser's own autoplay rule left on, the page had no audio
context before the press and a running one 0.15 seconds after it, seconds
before the voice had anything to play. And with a fifteen-second tone
playing, swapping the story for another (which stops one driver and starts
the next) left Theo a loudspeaker; with the driver's new line taken out,
the same swap left it at rest while the tone played on.

**Deployed** (the Workers preview of commit `538f74f`). Stories are left
out of a production build, and the app wants a sign-in, so Read aloud
itself was not pressed there. What was checked:

- the preview serves the voice's chunk, its worker and the four
  WebAssembly files, the WebAssembly as `application/wasm`, and each is
  byte for byte the file of the local production build (SHA-256);
- that chunk, loaded in a page on the preview's origin, could not fetch
  the model: Hugging Face answered 404 (see Where the voice comes from);
- the same chunk served from `localhost` fetched the model and spoke: 4.08
  seconds of audio at 24 kHz, the first of it 4.6 seconds after the load
  began.

## Not seen

- A person's ears and eyes on it. Whether the voice is good, whether the
  loudspeaker reads as one at this size, and whether the mouth is worth
  keeping are judgements nobody has made.
- Read aloud pressed in the deployed app, signed in, on `theorem.rs`. The
  deployed files speak when served from `localhost`, and Hugging Face
  answers a request that names `theorem.rs`; nobody has pressed the button
  there.
- Threads. Phonon uses several only on a cross-origin isolated page, which
  this is not, so it runs on one.
- A phone, and a slow machine. Five seconds to first audio was on this
  container's network and processor.
- Safari. Waking the graph inside the press is what Safari's rule asks
  for, and in Chromium the graph is running straight after the press, but
  Read aloud has not been pressed in Safari, on a Mac or a phone.
- Music, or any sound but speech and test tones. The meter's marks were
  set against those.
- In the shell the full-size form reaches over the sidebar's edge while it
  plays (`in-shell.png`).

## Not yet

- **A provider with a key.** The seam has `keyed`; no keyed provider is
  built. Where a person's key is kept is an open decision for the owner
  and comes first.
- **The model served from Theorem's own origin**, so that the voice does
  not depend on what Hugging Face will answer, and works on a Workers
  preview. The model is Apache-2.0. Where it would be kept is the owner's
  decision.
- The voice ships: `src/lib/speech/voice-theo.safetensors`, the Buttery
  v4+v2 join the owner picked by ear, added to the model with `addVoice` on
  load (2026-11-12, provenance and consent caveat recorded in
  `docs/learnings/2026-11-11-buttery-reference-voice-and-phonon-cloning.md`).
  Serving the model from Theorem's own origin is still the owner's call, and
  a setting for which voice or provider speaks remains.
- Directed prosody — reference-matched vocal gestures for sentences like s2
  — is deferred. The measured recipe (segments, measured gaps, seed casts,
  contour grafts through a WORLD vocoder) lands the gestures on paper and
  still sounds processed in the ear; ordinary sentences ship as the model
  reads them.
- Reading a reply as it streams. Read aloud is pressed on a finished one.
- Word timings from a provider, for a mouth that shapes vowels.
- Other devices.
- Speech to text. It will start only when the person starts it.
