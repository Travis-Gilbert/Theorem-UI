// SOURCING: expo-constants (the build-time values app.config.ts puts in extra.theorem)
import Constants from 'expo-constants'

type TheoremExtra = {
  authority: string
  oauthClientId: string
  oauthRedirectUri: string
}

function read(): TheoremExtra {
  const extra = (Constants.expoConfig?.extra as { theorem?: Partial<TheoremExtra> })?.theorem
  if (!extra?.authority || !extra.oauthClientId || !extra.oauthRedirectUri)
    throw new Error('app.config.ts did not provide extra.theorem')
  return {
    authority: extra.authority.replace(/\/+$/, ''),
    oauthClientId: extra.oauthClientId,
    oauthRedirectUri: extra.oauthRedirectUri,
  }
}

/** The Theorem authority this build talks to; it is also the OAuth issuer. */
export const config = read()
