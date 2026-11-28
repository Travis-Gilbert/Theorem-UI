# Theorem UI

The web frontend for the Theorem agent. It provides a chat interface, artifacts that open beside the conversation, projects, and thread history. Theorem owns durable history, execution and approvals. This app renders them.

## Stack

| Concern                                    | Library                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| App framework, routing, server routes      | TanStack Start, TanStack Router                                                                                               |
| Server state                               | TanStack Query                                                                                                                |
| Conversation runtime and primitives        | assistant-ui (`@assistant-ui/react`), wired through `@theoremharness/sdk/assistant-ui`                                        |
| Custom components (menus, dialogs, drawer) | Base UI                                                                                                                       |
| Desktop layout                             | dockview-react: a dock for the conversation and artifacts, and a split view for the context panel beside it                   |
| Markdown, code, diagrams                   | react-markdown + remark-gfm, react-shiki, beautiful-mermaid                                                                   |
| Theme                                      | next-themes                                                                                                                   |
| Styling                                    | Tailwind CSS v4 `src/styles.css`                                                                                              |
| Runtime and hosting                        | Bun: installs, scripts, dev server, and the production server built by Nitro's `bun` preset, run beside the Theorem authority |

Type: IBM Plex Sans for prose and titles (titles at a heavier weight, tracked as IBM's Carbon type sets track Plex), JetBrains Mono for code. Icons are owned Noun Project SVGs and owner-supplied Streamline Ultimate PNGs (see `src/assets/icons/PROVENANCE.md`), exposed through `src/components/icons.tsx`. Palettes other than Stone and GitHub Sharp, their syntax themes and the paper material credit their sources in `docs/themes/PROVENANCE.md`.

## Setup

Requires [Bun](https://bun.com) 1.4 or later.

```bash
bun install
cp .env.example .env
```

Fill in `.env`:

- `THEOREM_API_URL`: the Theorem authority. The default is `http://127.0.0.1:8082`.
- `THEOREM_API_TOKEN`: a bearer with `tenant:read`, `tenant:write` and `models:invoke` scopes.

The Explorer reads one project folder from the Theorem server, which binds it from `THEOREMWEB_PROJECT_ROOT` and `THEOREMWEB_PROJECT_ID`. Without them, the Explorer says no project folder is connected.

The token stays on the server. Browser requests go to this origin, and `src/server/theorem-proxy.ts` forwards `/api/chat/v1/*` and `/v1/theorem/agent/stream/*` with the bearer attached. Never put a token in client code. Bun loads `.env` into `process.env` for both the dev and production servers.

```bash
bun run dev        # http://localhost:3000
bun run build      # writes .output/
bun run start      # serves .output/ on $PORT (default 3000)
bun run typecheck
bun run lint
```

### Cloudflare

`bun run build:cloudflare` installs the IDE's locked dependencies, builds the terminal WebAssembly and Theia for production, then builds the app with Nitro's `cloudflare_module` preset. `bun run deploy:cloudflare` runs that complete build and deploys the `theorem-ui` Worker on `theorem.rs`. The Worker's name, domain, `THEOREM_API_URL` and OAuth client id are in `vite.config.ts`. Theia's source maps are left out, because Workers cap a static asset at 25 MiB.

For Workers Builds, use `bun run build` as the build command and `bunx wrangler deploy` as the deploy command. Cloudflare's `WORKERS_CI=1` selects the complete Worker build automatically. The root `packageManager` field pins Bun 1.4.3 for Workers Builds and both lockfiles; do not override it with an older `BUN_VERSION`. In Workers CI the build provisions the pinned Rust toolchain and the wasm-bindgen CLI version declared in `terminal/Cargo.toml`; local builds use the installed tools. The generated Worker config is discovered through `.wrangler/deploy/config.json`.

People sign in at the personal Theorem (`travis-theorem-personal.fly.dev`), which lists the `theorem-ui` client with its redirect URIs and the extra `models:invoke` scope in `RUSTY_RED_OAUTH_CLIENTS_JSON` on its store. Set the session secret once:

```bash
openssl rand -hex 32 | bunx wrangler secret put THEOREM_SESSION_SECRET --name theorem-ui
```

The issuer does not have to be Theorem. `THEOREM_OAUTH_ISSUER`, `THEOREM_OAUTH_SCOPE` and `THEOREM_OAUTH_RESOURCE` point sign-in at another OAuth 2.1 issuer, such as WorkOS AuthKit; `.env.example` says what each is. Unset, sign-in is as above.

Browser Q8 model downloads use an optional [private R2 binding](docs/semantic-q8-assets.md#provision-and-seed-r2). Configure `THEOREM_SEMANTIC_Q8_R2_BUCKET` in the Worker build environment after seeding the bucket; the weights do not ship in the Worker bundle.

`bunfig.toml` holds back package versions published less than three days ago. Exemptions are listed there with the reason.

## Model request inspection

A reply's **Details** opens its model request captures through the native chat API. The list reads only request metadata; selecting a request reads its captured body. Messages, system text, tool declarations, other request fields, and downloadable captured JSON retain what the node recorded. Event positions are shown separately from request order.

Captures are made before a send attempt, so they do not establish provider receipt. The inspector shows any exclusions, the original body hash, and original/captured sizes. Older runs whose requests were not recorded say so; unavailable endpoints and authorization failures remain distinct from an empty capture list. The existing Observe run page reuses the same inspector.

App declaration reads are labeled as reads. App inspections report build, type, runtime, pending-cell and capture facts separately; an applied receipt without inspection evidence is never shown as a clean check.

## Layout

```
src/
  routes/
    __root.tsx            document, theme provider
    _chat.tsx             pathless layout: project, runtime provider, shell (client-only)
    _chat/index.tsx       /            new chat
    _chat/c.$threadId.tsx /c/:thread   existing chat
    api/chat/v1/$.ts      proxy to the Theorem chat API
    v1/theorem/agent/stream/$.ts  proxy to the agent event stream
    api/scene/v1/$.ts     proxy to the page that draws a reply's scene
    api/observe/v1/$.ts   proxy to the node's turn observations (read only)
    settings/observe/     /settings/observe and /settings/observe/runs/:run
  lib/theorem/
    client.ts             SDK client, CSRF bootstrap, idempotent mutations
    runtime.tsx           assistant-ui runtime over Theorem threads, history and live-run resume
    observe.ts            the observe API's responses parsed with zod, polling queries, span and wait wording
    model-requests.ts     native chat request captures, paginated metadata and lazy body reads
  components/
    shell/                rail, context panel, project switcher, sheet and dock layout
    chat/theorem-parts.tsx  renderers for Theorem message parts (artifacts, scenes, approvals, progress, citations, errors)
    chat/scene-part.tsx   a reply's interactive scene, framed inline and expandable
    artifacts/            artifact model, view state, panel, renderers
    assistant-ui/elements/  installed assistant-ui elements, restyled to Stone
```

`mobile/` holds the iOS app: Expo and React Native with native assistant-ui over the Theorem SDK. It is its own Bun workspace, and the root typecheck, lint, format and tests leave it out; see `mobile/README.md`. `/.well-known/apple-app-site-association` names that app for its sign-in callback on theorem.rs once `THEOREM_IOS_APP_IDS` is set (`mobile/docs/sign-in.md`).

`ide/` holds the IDE: an Eclipse Theia app on Bun with a Zed look. It installs, builds and runs on its own; see `ide/README.md`. The rail's IDE mode shows it in the sheet, served at `/theia`. Until `ide/` is built, `/theia` answers 503 with the build command. `patches/` carries nitro's merged dev fix (nitrojs/nitro#4159), which stops the dev server brotli-compressing Theia's bundle on every load. Drop it once a nitro release includes that fix.

## Observe

`/settings/observe` is a section of Settings. It shows what the Theorem node observed of the signed-in identity's turns: whether the node is serving, the alert rules as they stand, what each running turn is waiting for, and how recent turns ended. `/settings/observe/runs/:run` shows one turn's trace: where its time went and each step with its state. Both read `/api/observe/v1` every five seconds while open, and a turn that has ended is read once.

The pages show what the node reports and label what it does not record. A value that was never measured is a dash, a state that was not observed is a hollow mark, and each page ends with the limits of what it can tell you. The node does not learn whether a page drew what a stream delivered, so "sent" is never shown as "seen".

## Artifacts

The agent creates artifacts with `create_artifact` and revises them with `update_artifact`. Each revision arrives as a `theorem-artifact-v1` part with the same `artifactId`, a new `artifactRevision` and a higher `patchSequence`.

- The panel is derived from the thread's messages. Reloads, branches and history therefore show the same artifacts the agent produced.
- The artifact's representation selects its renderer, including Markdown,
  highlighted source, Mermaid and saved Apps. An unrecognized renderer shows
  a named fallback and the part's `fallbackText`.
- Documents, code and diagrams render their saved content. A `theorem.app`
  artifact runs authored JavaScript or TypeScript/TSX in the existing App
  sandbox, with its source revisions and declared state saved in the App document.

### TypeScript and component Apps

An App may define its own React components, event handlers, CSS, canvas/WebGL
renderers and ordinary TypeScript modules. Component names and layouts do not
need registration in a UI catalog. Each file is an inert
`<script type="text/theorem-source" data-path="main.tsx">` (or another relative
`.ts`, `.tsx`, `.js`, `.jsx`, `.css` or `.json` path) in the saved HTML. The existing
App compiler bundles those files before mounting the frame. See
[TypeScript Apps](docs/blocks/live-blocks.md#typescript-apps) for the full form.

Imports may name another local source file, a browser-compatible npm package,
or an HTTPS ES module. Vendored React and the existing drawing libraries remain
available offline; their import map no longer limits App dependencies. For
example, an App can import `@luma.gl/core` and include this source file:

```html
<script type="text/theorem-source" data-path="package.json">
  {"dependencies":{"@luma.gl/core":"9.2.3"}}
</script>
```

Exact versions in `package.json`, versioned imports such as
`npm:@luma.gl/core@9.2.3`, or immutable HTTPS URLs pin direct dependency choices
when a source revision is opened again. Transitive version ranges still resolve
through the CDN. Bare names without a version also resolve,
but can select a newer release on a later page load. npm imports are resolved via
esm.sh; direct HTTPS modules must permit browser cross-origin fetches. Resolution
responses are shared by build and check during the page session. This cache is
not a saved dependency lockfile.

Direct and transitive imports in an npm-managed graph carry the same React
external settings to package wrappers. Their declarations use the matching
build advertised by the CDN, so a shared class keeps one runtime and type
identity. Explicit HTTPS graphs retain their build choices; different versions
and explicit build variants remain distinct.

Dependency source, imported CSS and its font/image assets are fetched while
building and bundled into the frame; this
does not grant the running App additional network access. Packages requiring
Node APIs or runtime assets/workers still need a browser build and the relevant
App capabilities. Published declaration metadata is loaded for the same resolved
dependencies. tsrs checks those declarations with the App's local code, React
and `window.theorem`; missing or unavailable external types remain visible
diagnostics. A successful JavaScript build can run while type problems are shown.

Run the focused tests with `bun test src/lib/blocks/app-dependency-identity.test.ts
src/lib/blocks/app-dependencies.test.ts src/lib/blocks/app-source.test.ts
src/lib/blocks/app-check.test.ts`. They check shared runtime classes and nominal
private-member types, late transitive headers, and intentionally distinct HTTPS
builds. The optional real CDN/Luma compile and type-check integration is
`THEOREM_TEST_REMOTE_DEPS=1 bun test src/lib/blocks/app-dependencies.live.test.ts`.
It checks that the bundle contains one core module and no declaration errors.

`node scripts/e2e/app-luma.mjs` also runs the product builder, checker and sandbox
in Chromium and verifies a rendered green pixel. Set `E2E_CHROMIUM` to a browser
executable when Playwright's Chromium is not installed. The
[Luma fixture](test/fixtures/app-luma.html) pins core, webgl and engine to 9.4.2,
passes `webgl2Adapter` to `luma.createDevice`, and passes an active `RenderPass`
to `Model.draw` before ending the pass and submitting the device. Those are
required API steps; a resolver fix does not supply them. The smoke reports its
renderer so a software WebGL result is distinguishable from hardware validation.

## Scenes

A question that an interactive diagram explains better than prose (the first is "How does a CPU work?") can get one inline in the answer. Theorem's `show_scene` tool validates the scene package and writes it to the reply as a `scene` part ahead of the text. The model reads back only a receipt. The part arrives here as `theorem-scene` with `contractVersion: "theorem-scene-v1"`.

- `chat/scene-part.tsx` draws it in a frame of the authority's scene page (`/api/scene/v1/host`, forwarded with the bearer). The frame is sandboxed to `allow-scripts`, so it runs in an opaque origin. The page's own policy forbids any network and allows only this origin to frame it.
- The card posts the package to the page once the page says it is ready. It reads back only the page's `host-ready`, `mounted` and `dismiss` messages (`chat/scene-model.ts`). A page that cannot draw the package, or does not answer within 20 seconds, is replaced by the part's `fallbackText`.
- Expand shows the card's `<dialog>` modal, so the scene fills the window from the top layer. The frame stays where it is, so the scene keeps its state. Escape, in the frame or on the page, collapses it. The card opens in the reply without taking focus from the composer.
- `scene-os-web/web/test/embed-browser.mjs` in the Theorem repository checks the page under that policy in a browser.
