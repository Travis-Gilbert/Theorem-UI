// SOURCING: @neon/auth client (src/lib/theorem/neon-auth.ts) for the client lookup and the consent call, @tanstack/react-query, existing Base UI Button and theme tokens.
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { hasAuthorizationQuery, neonAuth } from '@/lib/theorem/neon-auth'

/**
 * Neon Auth's consent page for Theorem. Theorem's issuer is registered at
 * Neon to skip consent, so a person reaches this page only for a client that
 * is not; it says which client asks and lets them allow or refuse it.
 */
export function EmailConsent() {
  // The signed query exactly as Neon sent it.
  const search = useLocation({ select: (location) => location.searchStr })
  const query = new URLSearchParams(search)
  const clientId = query.get('client_id')
  const authorizing = hasAuthorizationQuery(search) && Boolean(clientId)

  const client = useQuery({
    queryKey: ['neon-auth', 'client', clientId],
    queryFn: async () => {
      const auth = await neonAuth()
      const { data } = await auth.oauth2.publicClient({
        query: { client_id: clientId! },
      })
      return data ?? null
    },
    enabled: authorizing,
    retry: false,
  })
  const answer = useMutation({
    mutationFn: async (accept: boolean) => {
      const auth = await neonAuth()
      const { error } = await auth.oauth2.consent({ accept })
      if (error) throw new Error(error.message ?? 'consent failed')
    },
  })
  const name = client.data?.client_name ?? clientId
  const host = (() => {
    try {
      return client.data?.client_uri
        ? new URL(client.data.client_uri).host
        : undefined
    } catch {
      return undefined
    }
  })()
  const scopes = (query.get('scope') ?? '').split(' ').filter(Boolean)
  const busy = answer.isPending || answer.isSuccess

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12 text-foreground">
      <section aria-labelledby="consent-heading" className="w-full max-w-sm">
        <a href="/" className="font-heading text-xl font-semibold">
          Theorem
        </a>
        <h1
          id="consent-heading"
          className="mt-12 font-heading text-3xl font-medium"
        >
          Allow access?
        </h1>
        {!authorizing ? (
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            Nothing is waiting for your approval. Start from the{' '}
            <a href="/login" className="text-link underline underline-offset-4">
              sign-in page
            </a>
            .
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              <span className="font-medium text-foreground">{name}</span>
              {host && <> ({host})</>} wants to use your account
              {scopes.length > 0 && <> for: {scopes.join(', ')}</>}. Allow it
              only if you started this yourself.
            </p>
            {answer.isError && (
              <p role="alert" className="mt-6 text-sm leading-6">
                That didn’t go through. This request may have expired; start
                again from where you signed in.
              </p>
            )}
            <div className="mt-8 flex gap-3">
              <Button
                size="lg"
                className="flex-1"
                disabled={busy}
                onClick={() => answer.mutate(true)}
              >
                Allow
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => answer.mutate(false)}
              >
                Refuse
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
