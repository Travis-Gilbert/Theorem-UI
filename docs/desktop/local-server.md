# The local server in desktop mode

The desktop host (`desktop/`) runs Theorem UI's production server as a child
process and shows it in Servo. This is the contract between the two: how to
start the server, the control channel on its stdin and stdout, the HTTP routes
desktop mode adds, and the guard in front of everything. Plan D4 and D5 in
`docs/plans/vault-dynamic-documents.md` give the reasons; the message types are
`desktop/protocol/src/lib.rs`.

The server side lives in `src/server/desktop/`. `scripts/desktop-stub-host.ts`
is a working host in about 100 lines, and the quickest reference for anything
below.

## Starting the server

```
<bun> run <app>/.output/server/index.mjs
```

with stdin and stdout piped to the host. stderr carries logs only.

### Environment

- **`THEOREM_DESKTOP=1`**, exactly `1`. Anything else is web mode: no guard,
  no control channel, and every `/desktop/*` route answers 404.
- **`NITRO_HOST=127.0.0.1`**, required. Desktop mode exits with status 1,
  before binding, unless Nitro's hostname (`NITRO_HOST`, else `HOST`) is
  exactly `127.0.0.1`. Set `NITRO_HOST`; `HOST` is a common shell variable.
- **`NITRO_PORT=<port>`**, the app port, `1` to `65535`, required. Nitro reads
  `NITRO_PORT ?? PORT`, so an empty `NITRO_PORT` counts as set: Nitro would
  fall back to 3000, and desktop mode exits with status 1 instead. Port 0 is
  refused, because the guard must know the port.
- **`THEOREM_BLOCK_PORT=<port>`**, the live-block port, `1` to `65535`,
  required. The block listener (D9) binds it before `ready`, which echoes it
  back (see "The block listener" below).
- **`THEOREM_DESKTOP_DATA_DIR=<dir>`**, an absolute directory, never inside a
  granted folder. Required by the workspace service (D16), which reads it when
  it first needs it.

Do not set `NITRO_SSL_CERT` and `NITRO_SSL_KEY`: the server would speak HTTPS
while the guard expects the origin `http://127.0.0.1:<port>`.

Everything else in the environment passes through (`THEOREM_API_URL` and the
rest). Bun also loads `.env` files from the working directory, under the
variables the host sets. Pass `--no-env-file` (`<bun> --no-env-file run …`)
if the packaged app should see only the environment the host gives it.

### Startup, in order

1. The host spawns the server and writes the `hello` line at once. It does not
   wait for `ready`: `hello` is the first message, and the pipe holds it until
   the server reads it.
2. The server checks the environment. On a wrong hostname or a missing or
   invalid port it prints the reason to stderr and exits with status 1.
3. It installs the guard, starts reading stdin and binds `127.0.0.1:<port>`.
   If the port is taken it exits with status 1 (`EADDRINUSE` on stderr) and
   never writes `ready`; the host picks another port and spawns again (D4's
   stable-origin rule).
4. Once listening it writes, exactly once:

   ```
   {"ctl":"ready","port":4317,"blockPort":4318}
   ```

5. The host loads `http://127.0.0.1:<port>/desktop/session?secret=<secret>` in
   the web view.

### Shutdown

- When stdin reaches end of file (the host quit or closed the pipe), the
  server sends itself `SIGTERM`.
- On `SIGTERM` or `SIGINT` the server stops accepting connections and waits
  for open requests for up to `SERVER_SHUTDOWN_TIMEOUT` seconds (default 5),
  then closes the rest and exits with status 0. An open event stream holds the
  full timeout. Measured from the end of stdin: about 1 s with nothing open,
  about 5 s with an event stream open.
- When `CI` or `TEST` is set, srvx skips graceful shutdown and `SIGTERM` ends
  the process at once.
- A restarted server is a new process: the host sends a new `hello` with a new
  secret and loads the new session URL. Cookies from the old process no longer
  match.

## The control channel

One JSON object per line, UTF-8, `\n`-terminated, in both directions. Strings
never contain a raw newline, because JSON escapes it.

### stdout: server to host (`ToHost`)

stdout also carries logs: srvx's `➜ Listening on: …` banner, and anything
the app prints. Read every line with `ToHost::parse_line`; `None` is a log
line. The server writes control lines only through one function
(`sendToHost` in `control.ts`), each a complete line.

- `{"ctl":"ready","port":P,"blockPort":B}`: once, when listening.
- `{"ctl":"rpc","id":N,"call":{"method":…,"params":{…}}}`: a bridge call from
  the page.

About `rpc`:

- `id` counts up from 1 in each server process.
- `call` always parses as `HostCall`. The server validates the page's params
  first and sends only the fields `HostCall` names, filling an absent `notify`
  body with `null`. A call the host cannot parse would read as a log line and
  never be answered, so none is sent.
- Answer each `rpc` with exactly one `rpc-result`, in any order.
- `pickFolder` has no server-side timeout: the person may sit at the dialog.
  Every other method times out after 60 s. The page then gets error `-32002`,
  and a late answer is dropped with a note on stderr.

### stdin: host to server (`ToServer`)

- `{"ctl":"hello","secret":S,"grants":[…]}` sets the launch secret and the
  grants. `secret` must be non-empty. A later `hello` replaces a secret that
  has not been exchanged yet, which is how the host reloads the web view into
  a fresh session.
- `{"ctl":"grants","grants":[…]}` replaces the grants. The page's event stream
  gets `grantsChanged`.
- `{"ctl":"rpc-result","id":N,"result":…,"error":…}` settles call `N`. Both
  keys must be present, one of them `null` (serde's default for `Option`). A
  non-null `error` reaches the page as a JSON-RPC error with the same `code`
  and `message`; otherwise `result` is the page's result.
- `{"ctl":"event","event":{"type":"fileSaved","path":…}}` goes to every open
  event stream.
- `{"ctl":"event","event":{"type":"grantsChanged","grants":[…]}}` is the same
  as a `grants` message: the server keeps one copy of the grants, and the
  streams get `grantsChanged` from it.

A line that is not one of these is ignored, with a note on stderr giving its
length but not its content: a malformed `hello` must not print the secret.

Grants follow `FolderGrant`: `path` absolute and canonical, `name` for display.
The server's copy is what the workspace routes check paths against
(`grantFor` in `grants.ts`).

## The guard

In desktop mode every request goes through one check before anything else
answers it: before Nitro serves `.output/public`, before route rules, routes
and TanStack Start. The plugin puts it at the front of Nitro's middleware list
at startup.

1. The `Host` header must be exactly `127.0.0.1:<port>`. `localhost:<port>`,
   a missing port or any other name gets 403. This stops DNS rebinding.
2. Except for `/desktop/session`, the request must carry the cookie
   `theorem_session` with this launch's token, compared in constant time.
   Otherwise 403. This stops other local processes and pages in the person's
   own browser.

A refusal is `403` with the body `Forbidden`. In web mode the guard is not
installed.

## Routes

All three answer 404 outside desktop mode.

### `GET /desktop/session?secret=<secret>`

- With the secret from the latest `hello`: `302` to `/`, setting
  `theorem_session=<token>; Path=/; HttpOnly; SameSite=Strict`. There is no
  `Secure` attribute: the origin is plain HTTP on loopback. The token is 32
  random bytes, base64url (43 characters).
- The secret works once. Wrong, missing or already used secrets get `403` and
  leave an unused secret valid.
- One session at a time: each exchange mints a new token, and the previous
  cookie stops working.

### `POST /desktop/host/rpc`

- Requires `Origin: http://127.0.0.1:<port>`; anything else, including
  `Origin: null` and no `Origin`, gets `403`. Requires a `Content-Type` of
  `application/json` (else `415`).
- The body is a JSON-RPC 2.0 request, or a batch of them. The response is the
  JSON-RPC response, status 200. A notification (no `id`) gets `204`.
- `method` must be a `HostCall` method: `pickFolder`, `openNativeEditor`,
  `revealInFinder`, `openWithDefault`, `openExternal`, `setDocumentEdited`,
  `notify`. Anything else gets `-32601`. `openWithDefault` opens a file inside
  a granted folder with the system's app for its type; the host answers
  `-32602` for a folder, an executable file, or a type macOS would run or
  follow (`.app`, `.command`, `.webloc` and the like). Params that do not match `HostCall` get `-32602`, without
  reaching the host. The host's own errors pass through with their codes
  (`-32602`, `-32001` not granted, `-32002` failed).
- Bun's 10 s idle timeout is off for this request, so a long `pickFolder`
  completes.

### `GET /desktop/host/events`

- `text/event-stream`. Each event is one `data:` line holding a `HostEvent` as
  JSON.
- The first event is always `grantsChanged` with the current grants, because
  no bridge call lists them. Another follows each change.
- A `: keepalive` comment every 15 s. Bun's idle timeout is off for the stream.

## The page side

`getDesktopHost()` in `src/lib/desktop/host.ts` returns the typed bridge, or
`null` on the web. The root document renders `<html data-theorem-desktop>` in
desktop mode, so the browser knows where it is before any script runs, and
the first render matches the server's. Calls go through `json-rpc-2.0`'s
client to `/desktop/host/rpc`; events come from one shared `EventSource` on
`/desktop/host/events`.

## The stub host

```
bun run build
bun scripts/desktop-stub-host.ts --grant ~/Notes --pick ~/Projects
```

It starts the built server with the environment above and the defaults
`--port 4317 --block-port 4318`, sends `hello` with a random secret and the
`--grant` folders, and prints the session URL once `ready` arrives. It answers
`pickFolder` with the next `--pick` folder, granting it, then with `null` as if
the person cancelled. It logs every other call and answers `null`. `--data-dir`
and `--server` override the data directory (a new temporary one by default)
and the server entry.

## The block listener

Live blocks (plan D9, `docs/blocks/live-blocks.md`) run in documents served
by a second listener, `Bun.serve` on `127.0.0.1:<THEOREM_BLOCK_PORT>`. It is
started from `src/server/desktop/plugin.ts`, before `ready` is sent, so the
`blockPort` in `ready` is already serving. A port that cannot be bound exits
the server before `ready`.

- It is a different origin from the app, so a block cannot read the app's
  cookies or call its routes. It has no session and is not behind the guard.
- Every request must name `Host: 127.0.0.1:<THEOREM_BLOCK_PORT>` (else `403`),
  and only `GET` and `HEAD` are answered (else `405`).
- `/cell/<workspace id>/<compile key>`: a block's document, framed only by the
  app's origin (`frame-ancestors`), with a CSP that allows its own compiled
  module, the runtime and the vendored libraries, and the hosts it declared
  under `net`.
- `/compiled/<workspace id>/<compile key>.js`: the compiled module itself.
- `/app/<token>/<path>`: an HTML app's files. The token is signed with a key
  made at startup, names the workspace and the app's folder, and lasts 12
  hours; it is issued by `POST /desktop/blocks/app-token`.
- `/__runtime/<module>` and `/vendor/<path>`: the block runtime and the
  vendored libraries of the import map.
- A folder that is not trusted gets `403` for its cells, modules and apps.

The listener's source is `src/server/desktop/blocks/`. The app-side routes
that store compiled blocks, last-run values and shared state are listed in
`docs/desktop/workspace-routes.md`.
