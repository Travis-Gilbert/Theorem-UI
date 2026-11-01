# ide-cm

A browser IDE client for a Theorem workspace: the OpenIDEA React/CodeMirror frontend, adapted to
`@theoremharness/sdk`. It runs beside the Theia IDE in `../ide`, which is untouched, and in a
standalone browser tab with no Tauri anywhere.

Documents are SDK `DocumentSession`s. The editor owns text, selection and input locally; the
session owns the authoritative revision, the in-flight operation, per-client undo, conflicts and
reconnect catch-up. See `FORK.md` for what is upstream and what is not, and
`docs/plans/platinum-master/lanes/I02.md` in the Theorem repository for the semantics, the
parity matrix against Theia, and the evidence.

## Run

```sh
bun install
# a workspace host, e.g. apps/theorem-ide-host --http, and a file holding its bearer token
THEOREM_IDE_HOST_URL=http://127.0.0.1:8791 \
THEOREM_IDE_HOST_TENANT=<tenant> \
THEOREM_IDE_HOST_TOKEN_FILE=<path to a file holding the token> \
THEOREM_IDE_HOST_ACTOR=<caller; default stand-in:dev> \
  bun run dev
# open http://127.0.0.1:1430/?workspace=<workspace id>&name=<project name>[&file=<path>]
```

`dev/` is a STAND-IN for the Theorem UI product server (bootstrap, CSRF, credential forwarding,
and naming the caller, whose per-user state the page reads).
In production the page's own origin is that server, `/api/environment/v1/*` is its surface, and
nothing in `dev/` is used.

## Check

```sh
bun run typecheck
bun test
bun run build
sh scripts/verify-fork.sh
```
