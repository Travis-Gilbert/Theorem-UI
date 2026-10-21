# Theorem UI

The web frontend for the Theorem agent. It provides a chat interface, artifacts that open beside the conversation, projects, and thread history. Theorem owns durable history, execution and approvals. This app renders them.

## Stack

| Concern                                    | Library                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| App framework, routing, server routes      | TanStack Start, TanStack Router                                                                                               |
| Server state                               | TanStack Query                                                                                                                |
| Conversation runtime and primitives        | assistant-ui (`@assistant-ui/react`), wired through `@theoremharness/sdk/assistant-ui`                                        |
| Custom components (menus, dialogs, drawer) | Base UI                                                                                                                       |
| Thread/artifact split                      | react-resizable-panels                                                                                                        |
| Markdown, code, diagrams                   | react-markdown + remark-gfm, react-shiki, beautiful-mermaid                                                                   |
| Theme                                      | next-themes                                                                                                                   |
| Styling                                    | Tailwind CSS v4 with the Stone tokens in `src/styles.css`                                                                     |
| Runtime and hosting                        | Bun: installs, scripts, dev server, and the production server built by Nitro's `bun` preset, run beside the Theorem authority |

Type: IBM Plex Sans for prose, Libron for titles and headings, JetBrains Mono for code. Icons are owned Noun Project SVGs (see `src/assets/icons/PROVENANCE.md`), exposed through `src/components/icons.tsx`.

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
  lib/theorem/
    client.ts             SDK client, CSRF bootstrap, idempotent mutations
    runtime.tsx           assistant-ui runtime over Theorem threads, history and live-run resume
  components/
    shell/                sidebar, project switcher, layout
    chat/theorem-parts.tsx  renderers for Theorem message parts (artifacts, approvals, progress, citations, errors)
    artifacts/            artifact model, view state, panel, renderers
    assistant-ui/elements/  installed assistant-ui elements, restyled to Stone
```

## Artifacts

The agent creates artifacts with `create_artifact` and revises them with `update_artifact`. Each revision arrives as a `theorem-artifact-v1` part with the same `artifactId`, a new `artifactRevision` and a higher `patchSequence`.

- The panel is derived from the thread's messages. Reloads, branches and history therefore show the same artifacts the agent produced.
- Renderers are chosen by `rendererId`: `theorem-document` renders Markdown, `theorem-code` renders highlighted source and `theorem-diagram` renders Mermaid.
- Any other renderer shows a named fallback that explains what is missing and displays the part's `fallbackText`.
- Artifact content is declarative text. Nothing in this app executes it.
