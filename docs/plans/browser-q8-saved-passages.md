# Browser Q8 for saved passages

## First flow

A saved conversation shows **Search saved passages**.
Opening the search does not start the model. Submitting the first eligible
query starts the browser's Q8 worker and runs that same query when ready. A
second query in the same tab reuses the worker. A cold load in a new tab may
download the weights again; it doesn't invalidate persisted vectors. No fp32
model, Fly encoder, journal migration, or bulk reindex is needed.

Search reads the current conversation's saved branch on submission, so a
just-persisted citation doesn't have to wait for a transcript reload. It
considers at most 24 exact retained citation parts in the most recent 100
messages returned by the native history endpoint. This is not tenant-wide
recall. The list of candidate IDs is not an authorization grant,
and a preview excerpt is not indexing input. The server supplies text for
missing, currently authorized coordinates, then independently authorizes
publication and ranking. Opening a hit uses the exact retained-passage route.
A citation saved without a server-side retention observation is not eligible,
even if the old message displays an excerpt.
Normal chat sends do not initiate retrieval in this slice. They need a native
context-admission operation for exact retained citations before they can use
these results automatically; the current send owner refuses `message` as a
located context resource.

## Data boundary

- `prepare` takes message/part IDs and returns the total authorized count,
  including passages already indexed and those still missing a vector. It
  supplies exact inputs and digests only for the missing vectors. An empty
  authorized corpus does not start the browser worker.
- `publish` takes one exact input digest, browser producer identity and vector.
  A digest is an optimistic concurrency check against canonical content, not
  proof of inference. The durable coordinate is browser-provenance, not a
  node-produced vector and not a write to the shared graph vector property.
  Publication requires native chat write scope, a session CSRF token, and an
  idempotency header. Prepare and search require only read scope.
  The browser checks that the receipt names the expected digest, space, and
  producer revision.
- `search` accepts a query vector for that request and returns ranked IDs. The
  query text does not cross the wire through the search API.

See [`retained-index.ts`](../../src/lib/semantic-q8/retained-index.ts) for the
typed, same-origin adapter. The worker keeps only its resident model, and each
search holds one query vector and encodes and publishes one missing passage at
a time. RedCore owns reusable vectors; reloads don't need passage inference
when RedCore still has a compatible coordinate. There is no second browser
index or vector database. Canceling a search stops new work and publications,
not an ONNX invocation already in flight; completed publications are reusable.

## Evidence gates

| Gate                                                                                 | oracle_class          | implementation_mode                             | evidence_class                                               | substitution_allowed                                                        | live_oracle_required |
| ------------------------------------------------------------------------------------ | --------------------- | ----------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------- |
| No weights before the first query; real query and passage vectors rank expected text | real browser          | TypeScript module worker, pinned Q8/CPU WASM    | Chromium using the built Theorem-UI component and real model | No substitution for the model; API fixture is allowed on this boundary only | true                 |
| Authorization, stale revision rejection and durable coordinate reuse                 | real native authority | typed chat routes and RedCore task catalog      | scoped request tests and write → reopen → search on RedCore  | false                                                                       | true                 |
| Production asset delivery and signed-in search                                       | deployment            | same-origin assets and Theorem-UI → Theorem API | signed-in search against the deployed pair                   | false                                                                       | true                 |

Run the first gate with the staged Q8 release directory:

```sh
node scripts/semantic-q8/stage.mjs
node scripts/semantic-q8/stage.mjs --verify
E2E_Q8_ASSETS="$PWD/.semantic-q8/v1" node scripts/e2e/semantic-q8.mjs --built
```

The Chromium fixture exercises the real UI and worker; its HTTP test double
does not certify RedCore durability or access control. Deploy the
exact-passage authority (Theorem #1143, reconciled with the Q8 baseline) and
the typed vector endpoints before enabling the UI on a deployment. See the
[asset delivery runbook](../semantic-q8-assets.md#serving-the-weights) for the
private R2 model bucket and deployment verification.

Local browser evidence: Theorem-UI `c1a0e4b2` plus this change, running
Chrome for Testing `156.0.8078.4` on macOS arm64 with the Q8 producer from
Theorem `080b88ff64`. The built fixture downloaded no model weights at
page load, ranked the expected passage first for two different real queries,
reused the warm worker, and reopened the exact text. On reload it did not
publish either document again and did not rank the citation the fixture
revoked. No fp32 assets were used.
