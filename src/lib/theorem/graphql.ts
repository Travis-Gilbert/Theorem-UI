// SOURCING: theoremJson (the SDK's fetch passthrough) against Theorem's /graphql (rustyred-thg-mcp's async-graphql schema; a handful of fixed operations need no GraphQL client)
import type { MutationHeaders } from './client'
import { theoremJson } from './passthrough'

const ENDPOINT = '/graphql'

type GraphQLError = { message: string; path?: (string | number)[] }

/** A response that came back with GraphQL errors and no usable data. */
export class GraphQLRequestError extends Error {
  readonly errors: GraphQLError[]
  constructor(errors: GraphQLError[]) {
    super(errors.map((error) => error.message).join('; '))
    this.name = 'GraphQLRequestError'
    this.errors = errors
  }
}

/** One operation against Theorem's GraphQL schema; errors without data throw. */
export async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
  headers?: MutationHeaders,
): Promise<T> {
  const body = await theoremJson<unknown>(ENDPOINT, {
    method: 'POST',
    headers,
    body: { query, variables },
  })
  const { data, errors } = (body ?? {}) as {
    data?: T | null
    errors?: GraphQLError[]
  }
  if (errors?.length || data == null)
    throw new GraphQLRequestError(errors ?? [{ message: 'Empty response' }])
  return data
}
