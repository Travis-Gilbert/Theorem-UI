# Phase 0 record: integration boundaries

Date: 2026-11-08. Spec: `../../docs/plans/theorem-ios.md` §18. The status of each item is in `../../docs/plans/theorem-ios.checklist.json`.

This record covers two things:

- **Decided and verified in source:** what was decided and what the source and tooling checks show.
- **Not established:** what no check has established yet.

No native build, simulator or device run, and no live sign-in have been done. Read every "verified" below as limited to the command that produced it.

## Decisions

| Decision             | Choice                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where the app lives  | `Theorem-UI/mobile`, its own Bun workspace; SDK changes in Theorem `packages/theorem-sdk`                                                     | Owner's choice. The root web app ignores `mobile/` (tsconfig, eslint, prettier, `bun test`).                                                                                                                                                                                                                                                                                                                                                                              |
| Conversation binding | External store: `useExternalStoreRuntime` over the SDK's `projectThreadView(state)`                                                           | The SDK's `HeadlessConversation` keeps the only send, journal, idempotency and snapshot/event recovery path, so web and native share one set of semantics. The projection never dispatches, so a view unmounting cannot stop a run.                                                                                                                                                                                                                                       |
| SDK version          | Mobile: 0.6.0-alpha.1 packed from Theorem `5a18077c` (branch `claude/theorem-ios-app-knkszc`). Web, on main: 0.6.0-alpha.5 with a local patch | 0.6.0-alpha.1 adds `projectThreadView` and takes its types from `@assistant-ui/core`, which both the web and the native assistant-ui re-export. Tarball SHA-256 `bb47692908b0db6494dfeee47af79e9f482a4bec9add37c3b9a82ab5ffc7abd0`; repacking `5a18077c` reproduces it byte for byte. The web's alpha.5 comes from another SDK line, which has no `projectThreadView`. The two lines have to be merged into one release before the web and the phone can share a version. |
| Sign-in              | PKCE public client `theorem-ios`; ASWebAuthenticationSession with the HTTPS callback `https://theorem.rs/auth/ios/callback`                   | Theorem refuses custom-scheme redirect URIs. An HTTPS callback needs the app's `webcredentials` association, which Theorem UI now serves (see `sign-in.md`).                                                                                                                                                                                                                                                                                                              |
| Session feature      | Remux vendored unmodified; its `RootView` hosted as an Expo native view                                                                       | Owner's choice ("copy remux in"). Remux's public entry is `RootView`; its shell types are private, and its feature layers use App-layer types, so everything except the `@main` file is compiled.                                                                                                                                                                                                                                                                         |
| Deployment floor     | iOS 18.0 (`expo-build-properties`)                                                                                                            | Remux and its GhosttyKit build target iOS 18. The HTTPS callback needs iOS 17.4, so 18 covers it.                                                                                                                                                                                                                                                                                                                                                                         |
| Devices              | One universal target (`supportsTablet`, no full-screen requirement)                                                                           | iPad uses the same app with the adaptable sidebar and a split Chat view from 768pt.                                                                                                                                                                                                                                                                                                                                                                                       |

## Pinned versions

JavaScript (exact versions from `bun.lock`):

- `expo` 58.0.23, `expo-router` 58.0.30, `react-native` 0.88.1, `react` 19.3.0
- `@assistant-ui/react-native` 0.1.51, with `@assistant-ui/core` 0.3.32
- `expo-sqlite` 58.0.15, `expo-secure-store` 58.0.2, `expo-web-browser` 58.0.7, `expo-crypto` 58.0.7, `expo-dev-client` 58.0.18
- `react-native-webview` 14.0.1, `react-native-screens` 4.30.1

Native: the Remux revision, GhosttyKit release and SHA-256, and the Swift package revisions are in `../modules/theorem-session/ios/vendor/remux/VENDORED.md`.

## Platform globals

`src/lib/polyfills.ts` runs first. It installs `TextDecoder` and CSPRNG-backed `crypto.randomUUID` and `getRandomValues`. Then it asserts every global the SDK reaches for, so a missing one fails at launch instead of during a send. Expo's runtime already provides streaming `fetch`, `URL`, `structuredClone` and `TextDecoderStream`. Whether streaming works on a device has not been observed.

## Verified (2026-11-08, Linux, no Xcode)

| Check                                                    | Result                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run typecheck` (app and tests)                      | clean                                                                                                                                      |
| `bun run test`                                           | 30 pass, 0 fail: OAuth steps (with the RFC 7636 vector), journal store on SQLite, approvals, binding                                       |
| `bunx expo export --platform ios`                        | Hermes bundle built; 6 font files shipped                                                                                                  |
| `bunx expo prebuild --platform ios --no-install --clean` | succeeds; entitlements `webcredentials:theorem.rs`, device family 1,2, deployment target 18.0, Info.plist usage strings present            |
| `expo-modules-autolinking`                               | resolves `theorem-session` as pod `TheoremSession`                                                                                         |
| `pod ipc spec` (CocoaPods 1.17)                          | the podspec evaluates                                                                                                                      |
| `scripts/fetch-ghosttykit.sh` and `--verify`             | pinned archive downloads, SHA-256 matches, xcframework unpacks                                                                             |
| `bunx expo-doctor`                                       | 20/20                                                                                                                                      |
| Theorem SDK (`packages/theorem-sdk`)                     | typecheck clean; the new projection tests pass. The suite's 8 failures predate this change: a missing generated `openapi-components.json`. |
| Theorem UI `/.well-known/apple-app-site-association`     | unit tests pass; served by the dev server as JSON                                                                                          |

## Not established

- The Swift in `modules/theorem-session` has never been compiled, linked or run.
- No Herdr version is pinned and no Herdr session has been opened. The matched Remux/Herdr pair in the Phase 0 exit criteria is open.
- Codex and Claude Code communication, provider authentication and the tool permission round trip have not been started.
- Attachment uploads are not implemented or validated.
- Attach and detach of the native view, and background and resume, have not been observed.
- iPad resizing has not been observed.
- Sign-in has not been run. It needs the `theorem-ios` client deployed on the store and `THEOREM_IOS_APP_IDS` set on theorem.rs, as described in `sign-in.md`.

## Remux hosting limits

The hosted view is Remux's own interface. It keeps Remux's own saved-server library, connection setup, JSON stores under Application Support, and SSH credentials in the Keychain under its own service name.

Phase 4 work is still to do:

- Theorem pairing;
- a Theorem-carried Herdr transport;
- typed attach, detach and focus commands from React Native;
- session-state events into the app.

Closing the screen detaches this device. Sessions keep running on their host.
