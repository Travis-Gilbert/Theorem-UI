# Verifying anime.js motion in a hidden browser pane

**Kind:** method
**Captured:** 2026-10-23T18:00:00Z
**Session signature:** `1659a004-49a7-481e-b157-340073e0f5a4`
**Domain tags:** animejs, verification, browser

## Trigger

With the Claude browser pane hidden, the thread-list pill read `opacity: 0`
and stayed at its first placement. It looked like a bug, but anime pauses on
hidden documents and rAF is throttled, so no animation advanced. CSS
animations don't run there either.

## Rule

Before judging motion in a hidden pane, drive anime yourself: import the Vite deps module from `performance.getEntriesByType('resource')`, set `engine.pauseOnDocumentHidden = false`, `useDefaultMainLoop = false`, `paused = false`, then `setInterval(() => engine.update(), 16)`.

## Evidence

- This session's thread-list glide and send-flight checks

## Encoded in

- `docs/learnings/2026-10-23-verify-anime-in-a-hidden-browser-pane.md` (this file)
