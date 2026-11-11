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

Type: IBM Plex Sans for prose, Libron for titles and headings, JetBrains Mono for code. Icons are owned Noun Project SVGs and owner-supplied Streamline Ultimate PNGs (see `src/assets/icons/PROVENANCE.md`), exposed through `src/components/icons.tsx`.

## Setup

Requires [Bun](https://bun.com) 1.4 or later.

```bash
bun install
cp .env.example .env
```

Fill in `.env`:

- `THEOREM_API_URL`: the Theorem authority. The default is `http://127.0.0.1:8082`.
- `THEOREM_API_TOKEN`: a bearer with `tenant:read`, `tenant:write` and `models:invoke` scopes.

The token stays on the server. Browser requests go to this origin, and `src/server/theorem-proxy.ts` forwards `/api/chat/v1/*` and `/v1/theorem/agent/stream/*` with the bearer attached. Never put a token in client code. Bun loads `.env` into `process.env` for both the dev and production servers.

```bash
bun run dev        # http://localhost:3000
bun run build      # writes .output/
bun run start      # serves .output/ on $PORT (default 3000)
bun run typecheck
bun run lint
```

### Cloudflare

`bun run deploy:cloudflare` builds Theia for production, builds the app with Nitro's `cloudflare_module` preset and deploys the `theorem-ui` Worker on `theorem.rs`. The Worker's name, domain, `THEOREM_API_URL` and OAuth client id are in `vite.config.ts`. Theia's source maps are left out, because Workers cap a static asset at 25 MiB.

People sign in at the personal Theorem (`travis-theorem-personal.fly.dev`), which lists the `theorem-ui` client with its redirect URIs and the extra `models:invoke` scope in `RUSTY_RED_OAUTH_CLIENTS_JSON` on its store. Set the session secret once:

```bash
openssl rand -hex 32 | bunx wrangler secret put THEOREM_SESSION_SECRET --name theorem-ui
```

`bunfig.toml` holds back package versions published less than three days ago. Exemptions are listed there with the reason.

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
    settings.tsx          layout: the settings shell (client-only)
    settings/observe/     /settings/observe and /settings/observe/runs/:run
    api/observe/v1/$.ts   proxy to the node's turn observations (read only)
  lib/theorem/
    client.ts             SDK client, CSRF bootstrap, idempotent mutations
    runtime.tsx           assistant-ui runtime over Theorem threads, history and live-run resume
    observe.ts            the observe API's responses parsed with zod, polling queries, span and wait wording
  components/
    shell/                rail, context panel, project switcher, sheet and dock layout
    settings/             settings shell and page primitives; observe/ holds the Observe page and a turn's trace
    chat/theorem-parts.tsx  renderers for Theorem message parts (artifacts, approvals, progress, citations, errors)
    artifacts/            artifact model, view state, panel, renderers
    assistant-ui/elements/  installed assistant-ui elements, restyled to Stone
```

`ide/` holds the IDE: an Eclipse Theia app on Bun with a Zed look. It installs, builds and runs on its own; see `ide/README.md`. The rail's IDE mode shows it in the sheet, served at `/theia`. Until `ide/` is built, `/theia` answers 503 with the build command. `patches/` carries nitro's merged dev fix (nitrojs/nitro#4159), which stops the dev server brotli-compressing Theia's bundle on every load. Drop it once a nitro release includes that fix.

## Settings and Observe

Settings opens from the account menu and takes the whole window: its list of pages sits where the rail and panel were, and the page is the sheet. The anatomy follows Twenty's settings (a grouped list with the way out at its head, a breadcrumb, titled sections of bordered rows), studied from screenshots; none of its code is used.

`/settings/observe` shows what the Theorem node observed of the signed-in identity's turns: whether the node is serving, the alert rules as they stand, what each running turn is waiting for, and how recent turns ended. `/settings/observe/runs/:run` shows one turn's trace: where its time went and each step with its state. Both read `/api/observe/v1` every five seconds while open, and a turn that has ended is read once.

The pages show what the node reports and label what it does not record. A value that was never measured is a dash, a state that was not observed is a hollow mark, and each page ends with the limits of what it can tell you. The node does not learn whether a page drew what a stream delivered, so "sent" is never shown as "seen".

The proxy logs one JSON line, `theorem_proxy.stream_upstream_dropped`, when an event stream's upstream fails mid-stream. The browser sees an ordinary end of stream in that case, so the line is the only record on this side.

## Artifacts

The agent creates artifacts with `create_artifact` and revises them with `update_artifact`. Each revision arrives as a `theorem-artifact-v1` part with the same `artifactId`, a new `artifactRevision` and a higher `patchSequence`.

- The panel is derived from the thread's messages. Reloads, branches and history therefore show the same artifacts the agent produced.
- Renderers are chosen by `rendererId`: `theorem-document` renders Markdown, `theorem-code` renders highlighted source and `theorem-diagram` renders Mermaid.
- Any other renderer shows a named fallback that explains what is missing and displays the part's `fallbackText`.
- Artifact content is declarative text. Nothing in this app executes it.
