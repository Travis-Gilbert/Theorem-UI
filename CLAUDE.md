# Theorem UI

This is the public deployment of Theorem. Theorem UI is a modular interface for a personal agent: chat, artifacts, panels and tools are separate surfaces mounted in one shell, and each one should be addable, swappable or removable without touching the others. The Theorem authority owns history, execution and approvals. This app only renders them. The README covers the stack, setup and layout.

## Don't hand-roll

- Before writing a component, hook or parser, check what already solves it: the installed dependencies (assistant-ui, Base UI, dockview, TanStack, react-markdown, shiki), the shadcn and `@assistant-ui` registries in `components.json`, then the wider ecosystem.
- Bind to the library even when that means more lines overall.
- Open every new `src/` file with a `// SOURCING:` line naming the library it builds on. If it is hand-rolled, that line says why nothing upstream fits.
- Restyle installed elements in place (`src/components/assistant-ui/elements/`) rather than rebuilding them.

## Public deployment

- Secrets stay on the server. `THEOREM_API_TOKEN` lives in `.env`, and `src/server/theorem-proxy.ts` attaches it. Never put a token or tenant data in client code, fixtures or commits.
- Artifact content is declarative text. Never execute it.

## Design

- Colors, radii and shadows come from the Stone tokens in `src/styles.css`. Don't write raw colors in markup.
- Accent color marks state, never decoration.
- Selection never uses a left-edge rail.
- Icons come from `Icon` in `src/components/icons.tsx`: owned Noun SVGs, judged at rendered size.
- Type is IBM Plex Sans at a 15px base, zero tracking and a 430 regular, with JetBrains Mono for code.
- Check UI changes in the running app, in light and dark.

## Working here

- Use Bun for everything: `bun run dev`, `bun run typecheck`, `bun run lint`, `bun run check`. Run typecheck and lint before committing.
- `src/routeTree.gen.ts` is generated. Don't edit it by hand.
- `bunfig.toml` holds back packages published less than three days ago. Add an exemption there with its reason rather than working around it.
- Commits use `<type>(<scope>): <description>`, with the scope required.
