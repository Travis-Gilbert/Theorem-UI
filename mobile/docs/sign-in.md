# Signing in on iOS

The app signs a person in to the Theorem authority (the OAuth issuer) as the public client `theorem-ios`:

- authorization code with PKCE (S256) and no client secret;
- scope `run:read run:write models:invoke`. That covers everything the app calls: the chat API, document reads (`run:read` stands in for `tenant:read`) and the environment API. The web app also asks for graph and agency scopes, for features the phone does not have;
- `resource` set to `<authority>/mcp` (RFC 8707);
- the callback's `iss` checked against the issuer (RFC 9207).

The protocol steps are in `src/lib/oauth.ts`, which has tests. The device side is in `src/lib/auth.ts`. Tokens are stored only in the Keychain (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`) and sent only to the authority. They never go into the conversation journal, a draft or a log.

Theorem refuses custom-scheme redirect URIs (`redirect_uri_is_permitted` in `rustyred-thg-server/src/oauth.rs`), so the app cannot use `theorem://`. Instead, sign-in runs in `ASWebAuthenticationSession` with an HTTPS callback, `https://theorem.rs/auth/ios/callback`. iOS 17.4 and later hand that callback to the app only when the app is associated with `theorem.rs` through `webcredentials`. Three things have to be in place.

## 1. The authority lists the client

The personal store lists `theorem-ios` in `RUSTY_RED_OAUTH_CLIENTS_JSON`, beside `theorem-ui`. The entry is in the Theorem repository at `infra/fly/personal-core/store/fly.toml`:

```json
{
  "client_id": "theorem-ios",
  "client_name": "Theorem for iOS",
  "redirect_uris": ["https://theorem.rs/auth/ios/callback"],
  "extra_scopes": ["models:invoke"]
}
```

`travis-theorem-personal-store` reads it only after a redeploy. A production store needs the same entry.

## 2. theorem.rs names the app

Theorem UI serves `/.well-known/apple-app-site-association` (`src/server/apple-app-site-association.ts`). The app IDs come from `THEOREM_IOS_APP_IDS`, comma-separated, each written `<Team ID>.<bundle ID>`. When the variable is unset, the route answers 404.

1. Find the Team ID under Membership in the Apple Developer account. EAS also shows it once it manages the app's credentials.
2. Add `THEOREM_IOS_APP_IDS: '<TEAMID>.rs.theorem.app'` to the Worker's `vars` in Theorem UI's `vite.config.ts`, then run `bun run deploy:cloudflare`.
3. Check the file: `curl -s https://theorem.rs/.well-known/apple-app-site-association` should print `{"webcredentials":{"apps":["<TEAMID>.rs.theorem.app"]}}`.

Devices fetch the file through Apple's CDN, which caches it, so a change can take a while to reach them.

## 3. The build carries the entitlement

`app.config.ts` sets `associatedDomains: ['webcredentials:<callback host>']`. The host comes from `THEOREM_OAUTH_REDIRECT_URI`. When EAS signs a build, it turns on the Associated Domains capability for the bundle ID.

## Other authorities

Four build-time variables point a build at a production store without code changes:

- `THEOREM_AUTHORITY`
- `THEOREM_OAUTH_CLIENT_ID`
- `THEOREM_OAUTH_REDIRECT_URI`
- `THEOREM_IOS_BUNDLE_ID`

`src/lib/config.ts` reads them from `extra.theorem`. A session saved for another authority is ignored at launch.

## Before sign-in works: development tokens

Development builds (`__DEV__`) show a field on the sign-in screen that accepts a bearer from the authority's operator. The app stores it like a session (`kind: 'token'`) and never refreshes it. It acts as whoever the token names, which may be no person. Release builds refuse it.
