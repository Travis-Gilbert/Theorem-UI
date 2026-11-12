# Theorem for iOS: agent instructions

This is the Expo / React Native iOS app. Before changing behavior, read `README.md`, the specification `../docs/plans/theorem-ios.md` and its checklist. Presentation follows Theorem's `DESIGN.md` and the semantic roles in `src/theme/tokens.ts`.

## Theorem rules that apply here

- Native first: the app talks to the Theorem authority through `@theoremharness/sdk` and its typed APIs. Never connect through MCP `tools/call`. When no typed route exists, the feature waits for one at the owner, and the screen says it is not available.
- Show only state the app was given. No placeholder data, inferred inboxes, fake hosts or invented progress. A missing capability gets an `Unavailable` view that names what is missing.
- Detach is never stop. Unmounting a conversation, backgrounding, or closing a session never cancels anything. Only an explicit Stop calls `session.stop`.
- Sends are idempotent. Go through `HeadlessConversation` and the journal store, or `mutate` with a stable key. Never retry a POST with a fresh key, and never queue or replay an approval.
- Credentials stay in the Keychain (`src/lib/auth.ts`). They never go into SQLite, the journal, drafts, logs or the JavaScript bundle. `journal-store.ts` refuses a journal that carries credential headers; keep that check.
- When you change the SDK, change it in Theorem `packages/theorem-sdk`, then pack it into `vendor/`. Never edit `node_modules`.
- `modules/theorem-session/ios/vendor/remux` is upstream source, unmodified. Changes go in the module's own Swift files, or as a recorded patch in `VENDORED.md`.

## Expo has changed: do not trust your training data

Expo ships breaking changes in every SDK release. Before you touch an Expo, EAS or React Native API, read the `expo` major in `package.json`, then fetch `https://docs.expo.dev/versions/v<major>.0.0/` or start from `https://docs.expo.dev/llms.txt`.

## Commands

Use Bun (`bun.lock`). `bunfig.toml` holds back versions published less than three days ago.

```bash
bunx expo install <package>  # resolves SDK-compatible versions; use it instead of bun add
bun run typecheck            # app and tests (tsconfig.test.json carries bun types)
bun run test                 # bun test src
bun run doctor               # expo-doctor
bun run export:ios           # bundles the JavaScript for iOS without a native build
bun run prebuild:ios         # generates ios/ to inspect; delete it afterwards
bun run ghosttykit           # pinned GhosttyKit for the session module
```

Run typecheck and tests before declaring a change done. Report what was not run. A native build, a device run and a live sign-in are separate evidence, and none of them is implied by the commands above.

## Navigation

Expo Router: routes live in `src/app/`, and `_layout.tsx` files define navigators. Non-route code goes in `src/features`, `src/lib` and `src/ui`. Selection that must survive a resize lives in the URL (see `src/app/(tabs)/chat/index.tsx`).

## Native code

`ios/` is generated (Continuous Native Generation): never create or edit it. Configure native behavior in `app.config.ts`, config plugins or `modules/`. Native code needs a development build (`bun run ios` or `eas build --profile development`). Expo Go cannot run this app.
