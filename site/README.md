# join.theorem.rs

The Theorem marketing site and waitlist. A single prerendered page served from
its own Cloudflare Worker (`theorem-join`), apart from the app on `theorem.rs`.

## Layout

```
src/
  content.ts            every word on the page; rewrite copy here
  components/
    sections.tsx        nav, hero, thesis, propositions, architecture, CLI, FAQ, closing, footer
    WaitlistForm.tsx    posts to /api/waitlist
    figures/            the theorem drawings, ruled in as they scroll into view
  styles.css            Theorem's tokens (cream, terracotta, teal, IBM Plex)
  entry-server.tsx      renders the page at build time
worker/index.ts         serves dist/ and handles POST /api/waitlist
scripts/prerender.ts    writes the rendered page into dist/index.html
```

The figures are real results drawn from their geometry: Euclid I.47 (hero),
the Petersen graph with a proper 3-colouring, Königsberg's bridges, a
commutative square, a cobweb converging to the fixed point of cos x, and
Moroń's squared rectangle.

## Commands

```bash
bun install
bun run dev         # vite on :3100; the waitlist API is not served here
bun run preview     # build, then wrangler dev with a local KV on :8787
bun run typecheck   # app and worker
bun run deploy      # build and deploy the theorem-join Worker
```

## Waitlist

`POST /api/waitlist` takes `{ email, source }` as JSON or form data and stores
one KV key per address (`email:<address>`), so repeat signups are idempotent.
A hidden `company` field is a honeypot: anything in it is answered as a success
and not stored.

Before the first deploy, create the namespace and put its id in
`wrangler.jsonc`:

```bash
bunx wrangler kv namespace create theorem-join-waitlist
```

To export signups:

```bash
bunx wrangler kv key list --binding WAITLIST --remote
```
