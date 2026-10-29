# Canonical Theorem sign-in

## Request, October 28, 2026

The user identified theorem.rs as canonical and theoremweb.com as abandoned. They cannot use passkeys in the agent browser and report a regular-browser sign-in returning to the same page. They requested a working login using the Coss Form component.

## Change

- Add a server-rendered `/login` page using the upstream Coss Form wrapper and existing Base UI Button. It uses the existing GitHub OAuth authorization-code / PKCE flow. No password database, alternate identity provider, or extra OAuth scopes were added.
- Reuse the page in the signed-out chat shell. Explain regular-browser passkey use.
- Return failed callbacks to `/login` so error display does not depend on a successful project/bootstrap fetch. Explain missing cookies, cancelled consent, expired codes, state mismatch, configuration failure and service unavailability. Preserve the intended local destination for retry.
- Remove stale `signin_error` parameters on success. Reject external, malformed and authentication-loop return destinations using platform URL parsing. Expire new pending flows after ten minutes and keep auth redirects uncached.
- Existing oauth4webapi validates provider responses and exchanges codes; iron-session continues sealing tokens in an HttpOnly cookie. No credentials were copied from the user's other checkout.

## Evidence

- Live public entrypoint: theorem.rs `/auth/sign-in` returns 302 to the personal authority, then 307 to GitHub. This proves initiation only. The authenticated GitHub callback has not been completed by the user.
- `bun test tests/sign-in.test.mjs`: ten passing tests, 33 assertions. Uses real oauth4webapi and iron-session with a local test OAuth issuer and a mocked TanStack cookie adapter. Covers successful PKCE exchange, safe return paths, missing configuration/cookies, state mismatch, expiration, cancellation, invalid grant/retry and callback replay. This does not establish live GitHub acceptance.
- `tsc --noEmit` and focused ESLint: pass.
- Cloudflare production build and `wrangler deploy --dry-run`: pass. Existing dependency module-directive warnings remain. The first dry run rejected a 31.4 MiB development Theia bundle. Rebuilt the existing Theia source with its `build:prod` command (zero errors); the resulting 15 MiB bundle and complete app pass the dry run. No Theia source changes.
- Browser: desktop and 390×844 phone render; document width equals phone viewport. Continue submits to the actual local auth handler and missing configuration appears as a visible error. No console warnings/errors. Screenshots in `evidence/sign-in/`.

## Remaining acceptance

The change is prepared for review, not deployed. Deployment to theorem.rs is separate from the already-authorized Mott subdomain deployment. After deployment, the user must complete GitHub authentication in their regular browser and confirm that projects load and a reload retains the session. If it still fails, use the displayed error category to diagnose the authority/callback; do not claim the original live reload was reproduced or fixed by these tests.

The Mott project and a restricted project credential remain unprovisioned. A successful personal login does not itself configure or enable the public Mott runtime.

## HTTP callback mismatch, October 28, 2026

The user supplied the authority error `redirect_uri is not registered for client_id` after the first deployment. Reproduced it exactly: `http://theorem.rs/auth/sign-in` generated `redirect_uri=http://theorem.rs/auth/callback`, which the authority rejected with HTTP 400. Both configured HTTPS origins were accepted and redirected to GitHub. Reaching GitHub in the earlier HTTPS-only check did not cover this entry path.

Sign-in and callback now upgrade non-loopback HTTP requests to the same HTTPS URL before reading/writing the session or deriving the OAuth callback. This preserves return destinations and callback parameters, keeps the pending session intact, and leaves localhost development unchanged. The registered redirect allowlist and OAuth scopes are unchanged.

Validation: 13 tests / 43 assertions pass, including HTTP entry, HTTP callback with an existing pending session, and all three loopback hosts. TypeScript, focused ESLint, production build and full Cloudflare dry run pass. The unchanged embedded IDE production assets were reused from the prior reviewed release.
