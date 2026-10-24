// SOURCING: @tanstack/react-query. Block views render inside the app's
// providers, or, in an editor that gives its node views no React tree, in a
// root of their own; there they use this module's client.
import { QueryClient, QueryClientContext } from '@tanstack/react-query'
import { useContext } from 'react'

const own = new QueryClient()

/** The app's query client, or the blocks' own outside the app's providers. */
export function useBlocksQueryClient(): QueryClient {
  return useContext(QueryClientContext) ?? own
}
