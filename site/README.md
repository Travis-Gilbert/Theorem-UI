# join.theorem.rs

The Theorem marketing site and waitlist. A single prerendered page served from
its own Cloudflare Worker (`theorem-join`), apart from the app on `theorem.rs`.

## Layout

```
src/
  content.ts            every word on the page; rewrite copy here
  App.tsx               section order
  components/
    Header, Hero, GraphWindow, Marquee, Statement, Steps,
    Features, Faq, Closing, Footer, WaitlistForm
    tailark/            Tailark Veil primitives (button, card, accordion), MIT
    figures/            the theorem drawings, ruled in as they scroll into view
  styles.css            tokens (Veil names, warm cream/ink/ember palette) and motion
  entry-server.tsx      renders the page at build time
worker/index.ts         serves dist/ and handles POST /api/waitlist
scripts/prerender.ts    writes the rendered page into dist/index.html
```

The page blends three references: Tailark's Veil kit for the blocks (header,
bento features, FAQ, footer), Antimetal for motion (the drifting haze, particle
graph and run log in the hero window, the statement that fills in on scroll,
the turn to night with copper-bezelled panels), and Arc for the scalloped
marquee and the grainy closing band. Heron's contribution is the line-art
theorems and mono section labels.

### Tailark

Tailark's hosted registry (`npx shadcn add @tailark/...`) needs a paid plan, so
the blocks come from the MIT-licensed open-source repo
([tailark/blocks](https://github.com/tailark/blocks)), copied in and adapted
the way a shadcn registry would install them. Copied files say so in their
first line; the licence is in `src/components/tailark/LICENCE.md`. To pull in
another block, take it from `registry/bases/base/veil/` in that repo and point
its imports at `@/components/tailark` and `@/lib/utils`.

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
