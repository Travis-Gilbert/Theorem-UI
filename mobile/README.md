# Theorem for iOS

The Theorem app for iPhone and iPad. It is built with Expo and React Native, renders chat with native assistant-ui, talks to Claude Code and Codex on your own computers through a Remux-derived Swift module, and opens links in a contextual WebKit browser.

- The product specification is `../docs/plans/theorem-ios.md`.
- Status, per phase and acceptance item, is `../docs/plans/theorem-ios.checklist.json`.
- Phase 0 decisions and evidence are in `docs/phase-0.md`.

This is an early slice. Hosted Theorem conversations are implemented. Areas Theorem cannot serve yet show a plain "not available" state instead of guessed content: Inbox, Artifacts, pairing, Platinum, note editing and providers. Nothing here has been built natively or run on a device yet.

## Stack

| Concern           | Library                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| App, navigation   | Expo SDK 58, Expo Router (`src/app`), native tabs with the adaptable iPad sidebar                                    |
| Conversation      | `@assistant-ui/react-native` over `@theoremharness/sdk` `HeadlessConversation` (external store, `projectThreadView`) |
| Theorem API       | `@theoremharness/sdk` 0.6.0-alpha.1, packed from Theorem `claude/theorem-ios-app-knkszc` into `vendor/`              |
| Sign-in           | `expo-web-browser` (ASWebAuthenticationSession), `expo-crypto`, `expo-secure-store` (Keychain)                       |
| Local data        | `expo-sqlite`: conversation journal, drafts, small preferences                                                       |
| Browser           | `react-native-webview` (WKWebView)                                                                                   |
| Computers         | `modules/theorem-session`: Remux (MIT) and GhosttyKit, headless behind chat, see its README                          |
| Type              | Manrope, IBM Plex Sans, IBM Plex Mono, JetBrains Mono (`@expo-google-fonts`)                                         |

## Setup

Requires Bun 1.4 or later. A native build also needs a Mac with Xcode for the iOS 18 SDK, or EAS.

```bash
bun install
bun run ghosttykit    # downloads the pinned GhosttyKit, checks its sha256, keeps the iOS slices (316 MB)
bun run typecheck
bun run test
```

The app is a development build, not Expo Go: it carries native code that Expo Go lacks. Use either:

- `bun run ios` locally: prebuild, `pod install`, then run in a simulator or on a device.
- EAS with `bunx eas-cli build --profile development --platform ios`. `eas.json` has the development, simulator, preview, preview-simulator and production profiles. EAS runs `eas-build-pre-install`, which fetches GhosttyKit.

Then `bun run start` serves the JavaScript.

`ios/` is generated (Continuous Native Generation) and never committed. Native configuration goes in `app.config.ts`, and native code goes in `modules/`.

Sign-in needs the `theorem-ios` client on the authority and the app's association on theorem.rs. See `docs/sign-in.md`. Until both exist, development builds accept a bearer token on the sign-in screen.

`app.config.ts` reads these variables at build time:

| Variable                     | Default                                   |
| ---------------------------- | ----------------------------------------- |
| `THEOREM_AUTHORITY`          | `https://travis-theorem-personal.fly.dev` |
| `THEOREM_OAUTH_CLIENT_ID`    | `theorem-ios`                             |
| `THEOREM_OAUTH_REDIRECT_URI` | `https://theorem.rs/auth/ios/callback`    |
| `THEOREM_IOS_BUNDLE_ID`      | `rs.theorem.app`                          |
| `EAS_PROJECT_ID`             | unset                                     |

`bunfig.toml` installs only package versions that have been public for three days.

## Layout

```
src/
  app/                    routes: sign-in, (tabs)/chat|inbox|library|platinum, settings, computer, terminal (modals)
  features/chat/          runtime (assistant-ui over HeadlessConversation), one conversation surface, recipient picker, list, messages
  features/agents/        Claude Code and Codex over SSH: scripts, log readers, discovery, runtime
  features/browser/       the contextual browser: one retained layer over every destination
  features/library/       notes read through the typed documents API
  lib/                    config, OAuth and Keychain session, Theorem client, SQLite (journal, drafts, kv)
  ui/, theme/             Stone tokens shared with the web client, text variants, buttons, status, unavailable states
modules/theorem-session/  Expo module over the vendored Remux feature
vendor/                   the Theorem SDK tarball this app is pinned to
docs/                     sign-in setup, Phase 0 record
```

## Behavior that must hold

- Leaving a conversation, backgrounding the app or closing the terminal never stops a run, an agent or a remote session. Only Stop cancels a run or interrupts an agent.
- A message typed into an agent that cannot be confirmed goes back into the composer. It is never typed again automatically.
- The terminal stays hidden unless the person turns on Show terminal in Settings.
- Sends are idempotent. The SDK journal keeps each command id across relaunches, so a lost response is reconciled instead of sent twice. Approvals are never queued or replayed.
- Tokens stay in the Keychain and go only to the authority.
- The app shows state it was given: a missing API gives an explanation, not a stand-in.
