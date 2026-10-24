# Bun.serve's 10s idle timeout cuts proxied requests before upstream headers arrive

**Kind:** gotcha
**Captured:** 2026-10-21T05:00:00Z
**Session signature:** `8cc1eafd-4081-4cc2-b179-7b59507a35b5`
**Domain tags:** frontend, bun, proxy, nitro, sse

## Trigger

With the Theorem authority stalled, `GET /api/chat/v1/projects` through the
same-origin proxy returned Vite's HTML "Internal server error: The socket
connection was closed unexpectedly" after 9.4 s, while a direct curl to the
authority simply hung. The proxy only called `server.timeout(request, 0)` after
event-stream headers arrived, so any reply that took over 10 s to *start* was
dropped by the nitro dev worker's Bun.serve. The error escaped the proxy's
`try`, because it came from the Vite-to-worker hop, not from the upstream fetch.

## Rule

Opt a proxied request out of Bun's idle timeout before awaiting the upstream fetch, not after its response headers arrive.

Bun.serve closes any connection that is silent for 10 seconds, and a request
waiting for upstream headers is silent. Let the client's own timeout and the
request's abort signal bound the wait instead. In dev the failure surfaces as
a full-page Vite overlay; in production it is a bare network error.

## Evidence

- `src/server/theorem-proxy.ts` (`server.timeout(request, 0)` now precedes `fetch`)
- Dev server log: `Internal server error: The socket connection was closed unexpectedly`, each preceded by `DOMException AbortError "The connection was closed."`

## Encoded in

- `docs/learnings/2026-10-21-bun-idle-timeout-before-upstream-headers.md` (this file)
