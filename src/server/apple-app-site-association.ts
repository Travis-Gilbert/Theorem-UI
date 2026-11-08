// SOURCING: Apple "Supporting associated domains" (apple-app-site-association, webcredentials service); ASWebAuthenticationSession.Callback.https requires the app's webcredentials association with the callback host
//
// The iOS app (mobile/) signs in through ASWebAuthenticationSession with an
// HTTPS callback on this origin (https://theorem.rs/auth/ios/callback). iOS
// completes that callback only for an app this domain names under
// webcredentials. Each app ID is "<Team ID>.<bundle ID>"; they come from
// THEOREM_IOS_APP_IDS, comma-separated. Unset, no app is associated and the
// file is not served.

const APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]*$/

export function appSiteAssociation(
  configured = process.env.THEOREM_IOS_APP_IDS,
): Response {
  const apps = (configured ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  if (apps.length === 0)
    return new Response('No iOS app is associated with this domain.\n', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  const invalid = apps.filter((id) => !APP_ID.test(id))
  if (invalid.length > 0)
    // A malformed entry would associate nothing; say so instead of serving it.
    return new Response(
      `THEOREM_IOS_APP_IDS holds ${invalid.join(', ')}, which is not "<Team ID>.<bundle ID>".\n`,
      {
        status: 500,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      },
    )
  // Apple's CDN fetches this without following redirects and caches it.
  return Response.json(
    { webcredentials: { apps } },
    { headers: { 'cache-control': 'public, max-age=3600' } },
  )
}
