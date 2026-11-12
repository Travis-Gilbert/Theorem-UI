# The reference voice is Buttery v3, and only the CDN still serves it

The owner named the voice Theorem should sound like: **Buttery**, the older
Claude Desktop voice, which changed after an app update. The October plan was
to extract its bundled MP3s and use them as reference audio for cloning. On
2026-11-11 the MP3s were found and extracted — and listening proved the
bundled file is _not_ the target: Buttery has generations, and the voice the
owner is after is the CDN's `buttery-v3.mp3`. This note says where each
generation's audio is, what the cloning path is, and what is left to decide.

## Found on the owner's Mac, 2026-11-11

The old Buttery audio **is still bundled in the current Claude Desktop**
(`/Applications/Claude.app`, resources dated Nov 10) — not in `app.asar`,
which was searched first and holds no audio at all (1,279 files; the October
lead `audio/voice/...` matches nothing in it), but in a second archive
beside it:

- `npx @electron/asar list .../Resources/ion-dist.asar` lists
  `/audio/voice/selection/buttery.mp3` with `airy`, `glassy`, `mellow` and
  `rounded`, plus voice-mode sfx. A `find` for loose `*.mp3` misses them:
  they exist only inside the archive.
- `buttery.mp3` was extracted to `~/Downloads/claude-buttery-voice/`
  (SHA-256 `e7407284…de9410`): mono, 44.1 kHz, 128 kbps, **13.3 seconds** —
  the old tongue-twister sample ("Betty bought a bit of butter…"), already
  the right length for a cloning reference, with no editing.
- The voice the app speaks with now is not this file. The bundle's code
  carries the voice list `["buttery","airy","glassy","rounded"]` with
  `buttery` default and streams audio through a voice SDK; the web bundle
  builds sample URLs at runtime (`selection/${encodeURIComponent…}`), so the
  version suffix comes from server config, not the bundle.
- Archived copies and the transcripts of all five bundled samples:
  `thiem.xyz/blog/claude-voice-samples` (Sep 2026).

## The generations, and which one is the target

`assets.claude.ai/voice/selection/` serves three Buttery files (the
un-suffixed `buttery.mp3` 404s), all downloaded to
`~/Downloads/claude-buttery-voice/`:

| File                 | Length  | Generation                                                                   |
| -------------------- | ------- | ---------------------------------------------------------------------------- |
| `buttery.mp3`        | 13.27 s | not from the CDN: the bundled one, oldest, the tongue-twister era            |
| `buttery-v2.mp3`     | 11.60 s | middle                                                                       |
| `buttery-v3-new.mp3` | 4.55 s  | **the target** — the owner listened on 2026-11-11: "100% the voice im after" |
| `buttery-v4.mp3`     | 8.07 s  | newest of the old family; _not_ the live voice — see below                   |

The owner listened to all of them on 2026-11-11: v2, v3 and v4 are, to his
ears, the same good voice, and the voice the live app speaks now is none of
them — "completely different ... drastically worse". So the target is a
family, and any of the three clips, or a join of them, serves as reference.

The bundled `buttery.mp3` is therefore an archival curiosity, not the eval
reference. The reference is the CDN's v3 clip — a generation the app no
longer surfaces, surviving only at that URL.

## Reported: the Phonon cloning path (Gradium, November 5)

Not exercised yet; recorded from Gradium's announcement and the `xn-ptts`
repository.

- Phonon voices are small **precomputed speaker representations** (a
  `voice.safetensors` file), not fine-tunes. The voice file is reusable
  offline; ordinary synthesis stays local.
- The public model cannot encode an arbitrary MP3 into a new speaker
  representation — its audio tokenizer is decoder-only. Voices are created
  through Gradium Studio or its API.
- Scripted path: clone `github.com/gradium-ai/xn-ptts`, set `GRADIUM_API_KEY`
  (created in Studio), then
  `uv run scripts/clone-voice.py speaker.wav --lang en -o voice.safetensors`
  and test with
  `uvx ptts --lang en --voice voice.safetensors "..." -o test.wav`.
  Studio without a terminal: create the voice, then ⋮ → Download for Phonon.
- The reference recording: clean speech only, about 10–15 seconds;
  `ffmpeg -i reference.mp3 -ac 1 -ar 24000 -t 10 speaker.wav`. Do not pad a
  short clip with silence.
- Licensing: the 31M English model — the one this repo already runs
  (`src/lib/speech/phonon.ts`) — is Apache-2.0; the 40M models are
  noncommercial unless separately licensed. Gradium's cloning service
  requires explicit consent from the voice owner.
- RunPod credits are not needed for Phonon inference. They matter only for
  other cloning models, fine-tuning, or an independently hosted pipeline.

## The consent problem, stated plainly

An MP3 served or bundled by Claude does not grant permission to clone or
distribute that voice through Theorem. Buttery is Anthropic's voice. The
downloaded `buttery-v3-new.mp3` serves as the owner's **eval reference** —
the target a candidate voice is compared against — which is a private, local
use.
Turning it into a distributed `voice.safetensors` is the step the bundle
grants no rights for. For a published product the realistic options are an
authorized recording, or **designing a new voice with a similar character**
in Gradium Studio — the latter is what the owner's own guidance recommends,
and it produces the same `voice.safetensors` artifact.

## The eval runs, 2026-11-11

The whole path was run end to end on the owner's Mac, twice — once from the
bundled MP3 before the generations were understood, then from the real
target, v3 — with the owner's Gradium key (an `x-api-key`; a `gsk_` prefix,
and it worked) held only in the environment, never written to a file.
Artifacts in `~/Downloads/claude-buttery-voice/`:

| File                             | Is                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `speaker.wav`                    | the extracted `buttery.mp3` as mono 24 kHz, 13.27 s, untrimmed                    |
| `buttery-eval.safetensors`       | the cloned voice, 256 KB; voice `xN8rjfSK2Wu7MX0m` in the owner's Gradium account |
| `theo-test.wav`                  | "Hello. I'm Theo. What are we working on today?", 3.92 s                          |
| `buttery-eval-tonguetwister.wav` | the original sample's text read by the clone, 12.56 s — A/B against `buttery.mp3` |

`clone-voice.py` took seconds: upload, poll, download the blob. Synthesis on
Metal ran at RTF 0.06–0.27 with about 245 MB peak RSS, first chunk in under a
second. `check-speech.py` (Whisper WER) judged the tongue twister `ok` at 9%,
the misses on the butter/better repeats. The owner's verdict on this first
clone: "impressed" — but it is the wrong generation, and kept only as a
baseline.

The second run cloned the v3 clip:

| File                                | Is                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `speaker-v3.wav`                    | `buttery-v3-new.mp3` as mono 24 kHz, 4.55 s — below Gradium's 10–15 s guidance, and accepted anyway |
| `buttery-v3-eval.safetensors`       | the cloned voice, 256 KB; voice `wX0j7nVFwWKKTD0p` in the owner's Gradium account                   |
| `theo-test-v3.wav`                  | "Hello. I'm Theo. What are we working on today?", 4.24 s                                            |
| `buttery-v3-eval-tonguetwister.wav` | the tongue-twister text read by the v3 clone, 11.28 s — WER 2%, `ok`                                |

A 4.5-second reference was enough for a clean clone; the 10–15 s guidance is
not a floor.

## The join, the rights-cleared recording, and blends, 2026-11-12

The owner heard v2 and v4 as the same voice as v3 and asked for a longer
reference: `speaker-buttery-combined.wav` joins v4 then v2 (19.67 s). The API
still takes its 10 s window from the start, so the join mostly buys a window
made entirely of v4 plus 2 s of v2 — clone `KtDVnkQ8XhyVLI1w`,
`buttery-combined-eval.safetensors`, tongue twister at WER 2% again.

The owner also supplied a recording they can use in production:
`ScreenRecording_11-11-2026 23-18-48_1.MP3` in Downloads — an iPhone screen
recording (MP4: HEVC video, AAC audio, misnamed `.MP3`), 29.3 s, capturing
playback audio (the Control Center media tile reads "Yes to both—and"). Its
transcript is continuous narration about expressive speech synthesis. From
its 5–15 s window: clone `OyrOCBR9ccGr6BLj`, `production-rights.safetensors`.

Phonon's voice file is a single tensor, `speaker_wavs`, shape (1, 512, 125),
float32 — so "combining" two voices has a direct meaning: interpolate the
latents. Blends of the buttery join and the rights-cleared voice at 35/50/65
% buttery are `blend-35/50/65.safetensors`; the local `ptts` accepts each and
speaks from it (`hello-blend-*.wav`), which says the interpolated latent is
inside the space the model expects. Whether a blend _sounds_ like a person
rather than a smear is the owner's ears' call.

Rights, stated once: a blend inherits the buttery component's provenance.
Mixing in a rights-cleared voice does not clear the part of the sound that
came from Anthropic's; a published product still needs the consent question
answered, or a blend built only from cleared material.

## Tuning sweep, 2026-11-12

At the owner's request (and an outside analysis of the blend clips), a
controlled sweep ran over blend-65 in `~/Downloads/claude-buttery-voice/tuning/`,
with a manifest in its `README.md`: temperature 0.2/0.3/0.45 at fixed seed
42; `duration_delta` -0.1/0/+0.1; a same-backend weights diagnostic (cpu f32
vs cpu q8_0); and a four-sentence listening set — correction, celebration,
technical statement, question — against the unblended buttery join as
control.

Two build facts came out of it:

- The desktop CLI takes only long forms of the exotic flags
  (`--condition`, `--device`, `--quant`); the short `-c/-d/-q` of the Python
  `uvx ptts --help` are not there.
- `--quant` is CPU-only on this build and Metal runs f32 weights, so the
  q8-vs-f32 crispness question is a CPU and browser question, not a Metal
  one. The browser package's documented q8 default is therefore worth its
  own comparison when the voice moves into `phonon-tts`.

The sweep clips are diagnostics; the picks are the owner's ears', and are
still open. The checkpoint's conditioner inventory (its `config.json`)
settles one design question: `phonon-31m-en` ships exactly two conditioners,
`num_speakers` and `duration_delta`. There is no energy, intent or emotion
knob to map direction onto — so a direction layer's only engine-side levers
are pace, punctuation as prosody (a dash buys a pause and a shift of
emphasis), and seed choice. Runtime knobs do not live in the voice file: whatever wins is a
setting the app must carry, and per Gradium the Swift/Core ML export fixes
conditions like `duration_delta` at export time while temperature and seed
stay runtime — so a pace control needs a platform-aware implementation.

Two notes from the same analysis that belong to the build, not the sweep:

- **No premature fragmentation today.** Read aloud speaks a finished reply
  in one synthesis call (`theo-sound.md`); Phonon itself sentence-chunks
  longer input. When reading-as-it-streams lands (still Not yet), it must
  hand the synthesizer whole sentences, not token fragments.
- **Direction as metadata, later.** The proposal that the model emit
  conversational direction (intent, energy, pace, emphasis, pauses) beside
  the spoken text, translated only where the engine genuinely supports it,
  is recorded under Open for the build. The owner's rights-cleared recording
  is itself a demonstration of such directed delivery.

Two gotchas for whoever repeats this:

- `uvx ptts` is the Python package and refuses a voice file path ("no voice
  … is registered"). The desktop CLI — `brew install gradium-ai/tap/ptts`,
  0.7.0 here — takes the path directly. Python wants `tts.add_voice(NAME,
path)` instead.
- `uv run scripts/…` inside an `xn-ptts` clone fails building the repo's own
  package (a hatchling LICENSE error). Run the scripts with `uv run
--no-project`, or from outside the clone.

## Verdicts and the canonical pick, 2026-11-12

The owner listened to the pairs and the sweep:

- **Identity.** Blend-65 and the unblended join were indistinguishable
  blind; on a relisten the **unblended join** is a bit better. The blends
  drop out of the running — they added provenance complexity for no audible
  gain. The canonical voice file is `buttery-combined-eval.safetensors`
  (Gradium voice `KtDVnkQ8XhyVLI1w`). The rights-cleared recording and its
  clone stay on disk as the cleared parent for any future production blend.
- **Weights.** CPU q8_0 is "slightly better" than CPU f32 and very close:
  quantization is not the dullness, and q8 is what the browser package
  defaults to and what its WebGPU auto path wants. Nothing changes.
- **s2.** Seed 23 on the original text beat the dash rewrite and the other
  re-rolls. The lever for a hard sentence is the seed per utterance, not
  punctuation surgery; no rewrite is adopted into the speech layer. The
  owner's sentence ratings (s4 best, s1 and s3 good, s2 the weak one) were,
  as clarified afterwards, of the unblended join's clips — which is the
  voice picked, so they stand as ratings of the canonical voice. One
  caveat: the seed-23 read was rated on the blend, and a seed's reading does
  not transfer verbatim across voices; `tuning/s2-seed23-combined.wav`
  regenerates it on the canonical voice for a confirm.
- **Temperature and pace.** No verdict; the defaults (0.3, 0) stand.

Production shape: random seed per utterance; a pinned seed only for fixed
demo lines, where seed 23 keeps the celebration sentence its good read.

**Shipped, 2026-11-12.** The owner's call after hearing the grafts: the
canonical voice ships as-is for ordinary sentences — "every other sentence
fragment ... was so good" — and s2's directed tonality waits for sometime.
`src/lib/speech/voice-theo.safetensors` is the file; `phonon.ts` adds it to
the model with `addVoice('theo', …)` once the model loads, and falls back to
the model's default voice if the add fails. The graft route (WORLD-vocoder
f0 replacement) stays here as the closest s2 approach yet and the reason it
is parked: it measures right and sounds processed.

## The browser seam, answered

`phonon-tts` takes a custom voice — the seam was verified against 0.6.0's
typings; 0.7.0's differ only in comments, though its worker and wasm do
change (a `gpu/` directory is added):
`LoadOptions.model` accepts a `ModelSpec` whose `voices` maps names to
`.safetensors` URLs, and `PhononTTS.addVoice(name, source)` takes a URL or
raw bytes (`ArrayBuffer`, `Uint8Array`, `Blob`). `stream(text, {voice,
temperature, seed})` carries the per-request knobs; `conditions` (so
`duration_delta`) is set at load, matching Gradium's portability note. The
seam work is therefore: serve the voice file from Theorem's own origin,
`addVoice('theo', bytes)`, speak with `{voice: 'theo'}` — no new machinery
in `SpeechProvider` beyond naming a voice. Serving the voice ourselves also
sidesteps the Hugging Face `workers.dev` refusal for that file; hosting the
model there too remains the owner's open decision.

## Matching a reference performance, 2026-11-12

The owner recorded themselves performing s2 as the target delivery
(`ScreenRecording_11-12-2026 01-28-03_1.mov`, 4.7 s) and asked to base the
read on it. Measured with `silencedetect`: "Oh" voiced 0.35 s, gap 0.356 s,
then "that" ⌇0.198⌇ "actually" ⌇0.231⌇ "worked" with a terminal rise
(Whisper hears a question). So the direction is a segment list: texts,
measured gaps, and a seed cast for the rise.

Two trustworthy assemblies in `tuning/`, verdict pending:

- `s2-matched-a.wav` — gap, then the resumption as one flow with the
  terminal rise (question form, seed 11).
- `s2-matched-b.wav` — gap, then a hesitation before "actually", statement
  close.

Neither has both the internal hesitations and the rise, because of three
fragility rules this session established:

- The question mark is seed-fragile: seed 23 read "worked?" as "won't" and
  "the actual world", seed 4242 likewise, seed 11 read it clean at delta 0
  but broke at `duration_delta=-0.2` ("That art should work."), and
  "actually worked?" at seed 11 became "walked". A rise is a seed cast,
  never a guarantee.
- One-word segments hallucinate: "worked." alone became "That's it." and
  "next.". Segments want two words or more.
- Therefore every segment is transcribed with ASR before it is joined; a
  directed utterance is only as good as its worst unverified segment.

Segments are trimmed of model padding by RMS envelope (-45 dB); -35 dB cut
word tails. Gaps are explicit silence buffers, which is exactly what the
sound graph's back-to-back scheduling will insert in the app.

### Prosody: the tune, not just the rhythm

The owner's outside analysis (`feedback/`, from their zip) confirmed the
pause timing was close but the melody was not: the reference "Oh" rises then
falls (138→174→72 Hz, peak mid-word) while both assemblies fell monotonically,
and B reversed the reference's terminal rise. It also caught a real bug in
my variants: A and B shared a sample-identical opening fragment, so
switching between them never tested a new "Oh".

Matching the gesture took three steps, each measured with the same Praat
pipeline as the feedback (parselmouth, 800 Hz lowpass, ac pitch, voicing
0.45):

- **Seed casting fails for the opening.** Ten seeds of "Oh," all fall
  monotonically (peak position ≈ 0.0); period and ellipsis forms do too.
  The engine's opening-prosody space does not contain a rise-then-fall.
- **The terminal rise is castable.** Of ten question-form seeds, the
  ASR-clean ones with upward endings are s11 (used in matched-a), s4
  (+0.35) and s7 (+0.32); the rest misread the word or fall.
- **So the opening is grafted.** WORLD vocode (pyworld): decompose Theo's
  take into f0, spectral envelope and aperiodicity; replace only f0 with
  the reference's normalized contour in Theo's own register; resynthesize.
  Measured result: rise +0.26 (reference +0.26), fall +0.35 (reference
  +0.59 — a shallower release), peak position 0.59 (reference 0.49). The
  gesture is there; the timbre is Theo's.

`s2-gest-a/b/c.wav` join the grafted opening, the measured 0.356 s gap, and
the endings s11/s4/s7. Verdict pending — including whether a vocoded vowel
reads as a person. Tooling: this parselmouth build has no Manipulation, so
the graft goes through pyworld, which needs `setuptools<81` for
pkg_resources.

## Open for the build

- Shipping consent and hosting: the canonical voice is Anthropic-derived;
  whether Theorem ships it, and serving voice and model from Theorem's own
  origin, are the owner's calls.
- A direction layer for Theo's speech: v1 shipped in this worktree on
  2026-11-12 (`direction.ts`, `perform.ts`): energy as the sweep's
  temperature, a held beat at an opening interjection, an optional seed,
  read for now from the reply's own punctuation. What remains is the
  answering model proposing a direction with its answer — the `Direction`
  type carries it unchanged — and cues from the environment (an explicit
  quiet request, an interruption), not inference from a person's voice.
- Reading a reply as it streams must hand the synthesizer whole sentences
  (see Tuning sweep).
- A setting for which voice speaks: the voice is chosen; the setting around
  it is not built.
