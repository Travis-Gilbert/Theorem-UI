# A second penpal connect on the same channel can drop a finished handshake's port

**Kind:** postmortem
**Captured:** 2026-11-07T00:00:00Z
**Session signature:** `aefa3afe-5ef5-490c-a5bc-7f7ced9d744d`
**Domain tags:** site, embed, penpal, strict-mode, oracles

## Trigger

The site's transition oracle failed about one run in three. The fixture app in the frame
never said it was ready, so the site waited on "loading". The fixture
(`site/src/stories/demo-fixture.story.tsx`) called penpal's `connect` inside a `useEffect`.
In dev, strict mode ran that effect twice, so two connections went out on one channel. The
first was destroyed at once, but its SYN had already been posted.

penpal 8.0.1's `WindowMessenger` destroys its MessagePort whenever a SYN arrives, and the
handshake's handler stays registered after it completes. When the late SYN lands after the
handshake has finished, both sides lose the port. The child's `ready()` then fails with
TRANSMISSION_FAILED, and the fixture swallowed that error. Whether it happens depends on
message order, which is why it came and went.

## Rule

- A frame opens one penpal connection per document load. Connect at module scope (as the
  app's `src/lib/embed/site-bridge.tsx` does) or guard with a module-level flag. Never
  connect in an effect that strict mode can run twice.
- A flaky handshake in dev is this race before it is a timing problem. Don't raise timeouts.

## Evidence

- `site/src/stories/demo-fixture.story.tsx` (`opened`, one handshake per load)
- `node_modules/penpal/dist/penpal.mjs`: `WindowMessenger.#handleMessageFromRemoteWindow` calls `#destroyPort()` on every SYN
- `site/evidence/oracles/transition.mjs`: three full runs passed after the change; before it, `mediaFailure` or `reduced` failed about one run in three

## Encoded in

- `docs/learnings/2026-11-07-penpal-second-connect-drops-the-port.md` (this file)
