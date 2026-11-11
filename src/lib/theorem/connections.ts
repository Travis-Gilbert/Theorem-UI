// SOURCING: @tanstack/react-query (server state, optimistic switches) over lib/theorem/passthrough and client.mutate (the CSRF and idempotency headers every Theorem mutation carries); the wire types are copied from the Work items and Connections contract, section B
//
// The typed SDK has no Connections client yet, so every request goes through
// `connectionsApi` below, which calls the SDK's passthrough. When the SDK is
// regenerated with these routes, replace the bodies of the `connectionsApi`
// methods with the SDK methods; the hooks and every caller stay as they are.
//
// These are typed routes on Theorem's own API. Theorem speaks MCP to an
// external server on the person's behalf and holds its credentials, so the
// browser never sends a request to /mcp and never sees a stored secret.
import {
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { mutate } from './client'
import { theoremJson } from './passthrough'

export type ConnectionStatus =
  'connected' | 'disconnected' | 'needs_auth' | 'error'

export type Health = {
  state: 'ok' | 'degraded' | 'failing' | 'unknown'
  checkedAt?: string
  detail?: string
}

export type Connection = {
  /** "github", "google_gmail", "mcp:<id>", ... */
  id: string
  kind: 'github' | 'google' | 'mcp'
  label: string
  status: ConnectionStatus
  /** Whether the agent may use it. */
  enabled: boolean
  account?: { label: string; avatarUrl?: string }
  health: Health
  lastEventAt?: string
}

export type DeliveryState =
  'received' | 'processing' | 'processed' | 'failed' | 'skipped'

export type GithubRepository = {
  id: number
  fullName: string
  private: boolean
  tracked: boolean
}

export type GithubInstallation = {
  id: number
  account: string
  repositorySelection: 'all' | 'selected'
  repos: GithubRepository[]
}

export type GithubConnection = Connection & {
  installations: GithubInstallation[]
  availableActions: {
    name: string
    title: string
    effect: 'read' | 'write'
    granted: boolean
  }[]
  subscribedEvents: string[]
  webhook: {
    configured: boolean
    url?: string
    lastDeliveryAt?: string
    counts: {
      received: number
      processed: number
      pending: number
      failed: number
    }
  }
  lastEvent?: {
    event: string
    action?: string
    repo?: string
    receivedAt: string
    state: DeliveryState
  }
}

export type GithubDelivery = {
  id: string
  event: string
  action?: string
  repo?: string
  receivedAt: string
  state: DeliveryState
  attempts: number
  error?: string
  outcomes: { consumer: string; state: DeliveryState; detail?: string }[]
}

export type ToolEffect = 'read' | 'write' | 'unknown'

export type McpTool = {
  name: string
  title?: string
  description?: string
  effect: ToolEffect
  enabled: boolean
}

export type McpAuthType = 'none' | 'bearer' | 'oauth'

export type McpServer = Connection & {
  kind: 'mcp'
  transport: 'http' | 'stdio'
  /** http */
  url?: string
  /** stdio, only where a local runtime is connected */
  command?: string
  args?: string[]
  /** Secrets are never returned. */
  auth: { type: McpAuthType; configured: boolean }
  tools: McpTool[]
  /** The server declared more tools than Theorem keeps; absent before the first discovery. */
  toolsTruncated?: boolean
  discoveredAt?: string
}

export type ConnectionList = {
  connections: Connection[]
  stdioAvailable: boolean
}

export type NewMcpServer = {
  label: string
  transport: 'http' | 'stdio'
  url?: string
  command?: string
  args?: string[]
  auth?: { type: McpAuthType; token?: string }
}

export type McpServerPatch = {
  label?: string
  enabled?: boolean
  auth?: { type: McpAuthType; token?: string }
  tools?: { name: string; enabled: boolean }[]
}

export type McpTestResult = {
  ok: boolean
  latencyMs?: number
  toolCount?: number
  error?: string
}

export type ToolGroup = {
  connectionId: string
  label: string
  kind: string
  /** The connection is switched on in Settings. */
  enabled: boolean
  tools: {
    name: string
    title?: string
    description?: string
    effect: ToolEffect
  }[]
}

export type DeliveryPage = { deliveries: GithubDelivery[]; nextCursor?: string }

const root = '/api/connections/v1'

const withQuery = (
  path: string,
  params: Record<string, string | undefined>,
) => {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(params))
    if (value) query.set(name, value)
  const text = query.toString()
  return text ? `${path}?${text}` : path
}

const send = <T>(path: string, method: string, body?: unknown) =>
  mutate((headers) => theoremJson<T>(path, { method, headers, body }))

const mcpPath = (id: string) => `${root}/mcp/${encodeURIComponent(id)}`

/** Every Connections request, one method per route in section B of the contract. */
export const connectionsApi = {
  list: () => theoremJson<ConnectionList>(root),
  github: () => theoremJson<GithubConnection>(`${root}/github`),
  connectGithub: (returnTo: string) =>
    send<{ authorizationUrl: string }>(`${root}/github/connect`, 'POST', {
      returnTo,
    }),
  disconnectGithub: () => send<void>(`${root}/github`, 'DELETE'),
  setGithubEnabled: (enabled: boolean) =>
    send<GithubConnection>(`${root}/github`, 'PATCH', { enabled }),
  saveRepositories: (tracked: string[]) =>
    send<GithubConnection>(`${root}/github/repositories`, 'PUT', { tracked }),
  deliveries: (params: { state?: DeliveryState; cursor?: string } = {}) =>
    theoremJson<DeliveryPage>(withQuery(`${root}/github/deliveries`, params)),
  retryDelivery: (id: string) =>
    send<GithubDelivery>(
      `${root}/github/deliveries/${encodeURIComponent(id)}/retry`,
      'POST',
    ),
  mcpServers: () => theoremJson<{ servers: McpServer[] }>(`${root}/mcp`),
  mcpServer: (id: string) => theoremJson<McpServer>(mcpPath(id)),
  addMcpServer: (server: NewMcpServer) =>
    send<McpServer>(`${root}/mcp`, 'POST', server),
  updateMcpServer: (id: string, patch: McpServerPatch) =>
    send<McpServer>(mcpPath(id), 'PATCH', patch),
  removeMcpServer: (id: string) => send<void>(mcpPath(id), 'DELETE'),
  testMcpServer: (id: string) =>
    send<McpTestResult>(`${mcpPath(id)}/test`, 'POST'),
  connectMcpServer: (id: string, returnTo: string) =>
    send<{ authorizationUrl: string }>(`${mcpPath(id)}/connect`, 'POST', {
      returnTo,
    }),
  /**
   * Finishes a sign-in from the signed-in app. Theorem trades the provider's
   * answer for access only here, where it can see who is asking; the token is
   * the one it put on the address this browser was returned to. A tool
   * server ("mcp:<id>") and an account Theorem connects itself ("github",
   * "google_gmail", ...) finish on their own routes.
   */
  completeSignIn: async (connector: string, completion: string) => {
    if (connector.startsWith('mcp:'))
      return send<{ connector: string }>(`${root}/oauth/complete`, 'POST', {
        completion,
      })
    await send<unknown>(
      `/api/chat/v1/connectors/${encodeURIComponent(connector)}/complete`,
      'POST',
      { completion },
    )
    return { connector }
  },
  tools: (q?: string) =>
    theoremJson<{ groups: ToolGroup[] }>(withQuery(`${root}/tools`, { q })),
}

const base = ['theorem', 'connections'] as const
export const connectionKeys = {
  all: base,
  list: [...base, 'list'] as const,
  github: [...base, 'github'] as const,
  deliveries: (state: DeliveryState | undefined) =>
    [...base, 'github', 'deliveries', state ?? 'all'] as const,
  mcp: [...base, 'mcp'] as const,
  tools: [...base, 'tools'] as const,
}

export const connectionsQuery = queryOptions({
  queryKey: connectionKeys.list,
  queryFn: connectionsApi.list,
})

/** Everything connected, and whether a local runtime can run stdio servers. */
export const useConnections = () => useQuery(connectionsQuery)

/** GitHub in full. Pass `enabled: false` while GitHub is not connected. */
export const useGithub = (enabled: boolean) =>
  useQuery({
    queryKey: connectionKeys.github,
    queryFn: connectionsApi.github,
    enabled,
  })

/** GitHub's webhook deliveries, newest first, a page at a time. */
export const useGithubDeliveries = (
  state: DeliveryState | undefined,
  enabled: boolean,
) =>
  useInfiniteQuery({
    queryKey: connectionKeys.deliveries(state),
    queryFn: ({ pageParam }) =>
      connectionsApi.deliveries({ state, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor,
    enabled,
  })

export const useMcpServers = () =>
  useQuery({
    queryKey: connectionKeys.mcp,
    queryFn: async () => (await connectionsApi.mcpServers()).servers,
  })

/** What the composer lists: every connection's tools, grouped by connection. */
export const connectionToolsQuery = queryOptions({
  queryKey: connectionKeys.tools,
  queryFn: async () => (await connectionsApi.tools()).groups,
  staleTime: 30_000,
})

export const useConnectionTools = () => useQuery(connectionToolsQuery)

/**
 * Applies a change to a cached value before the server has answered, and
 * returns the way back for when it refuses. The caller invalidates once the
 * request settles, so the page ends on what the server holds.
 */
async function optimistic<T>(
  client: QueryClient,
  key: QueryKey,
  change: (current: T) => T,
) {
  await client.cancelQueries({ queryKey: key, exact: true })
  const previous = client.getQueryData<T>(key)
  if (previous !== undefined) client.setQueryData<T>(key, change(previous))
  return { restore: () => client.setQueryData<T>(key, previous) }
}

type Rollback = { restore: () => void } | undefined
const rollback = (_error: Error, _vars: unknown, context: Rollback) =>
  context?.restore()

const withServer = (servers: McpServer[], next: McpServer) =>
  servers.map((server) => (server.id === next.id ? next : server))

/** GitHub's writes. The agent switch is optimistic and rolls back on a refusal. */
export function useGithubMutations() {
  const client = useQueryClient()
  const settle = () =>
    client.invalidateQueries({ queryKey: connectionKeys.all })
  const remember = (next: GithubConnection) =>
    client.setQueryData(connectionKeys.github, next)

  const connect = useMutation({
    mutationFn: connectionsApi.connectGithub,
  })
  const disconnect = useMutation({
    mutationFn: connectionsApi.disconnectGithub,
    onSettled: settle,
  })
  const setEnabled = useMutation({
    mutationFn: connectionsApi.setGithubEnabled,
    onMutate: (enabled) =>
      optimistic<GithubConnection>(client, connectionKeys.github, (github) => ({
        ...github,
        enabled,
      })),
    onSuccess: remember,
    onError: rollback,
    onSettled: settle,
  })
  const saveRepositories = useMutation({
    mutationFn: connectionsApi.saveRepositories,
    onSuccess: remember,
    onSettled: settle,
  })
  const retryDelivery = useMutation({
    mutationFn: connectionsApi.retryDelivery,
    onSettled: () =>
      client.invalidateQueries({
        predicate: ({ queryKey }) =>
          queryKey[1] === 'connections' && queryKey[3] === 'deliveries',
      }),
  })
  return { connect, disconnect, setEnabled, saveRepositories, retryDelivery }
}

/** The MCP servers' writes. Switches are optimistic and roll back on a refusal. */
export function useMcpMutations() {
  const client = useQueryClient()
  const settle = () =>
    client.invalidateQueries({ queryKey: connectionKeys.all })
  const remember = (next: McpServer) => {
    client.setQueryData<McpServer[]>(connectionKeys.mcp, (servers) =>
      servers?.some((server) => server.id === next.id)
        ? withServer(servers, next)
        : [...(servers ?? []), next],
    )
  }

  const add = useMutation({
    mutationFn: connectionsApi.addMcpServer,
    onSuccess: remember,
    onSettled: settle,
  })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: McpServerPatch }) =>
      connectionsApi.updateMcpServer(id, patch),
    onSuccess: remember,
    onSettled: settle,
  })
  const setEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      connectionsApi.updateMcpServer(id, { enabled }),
    onMutate: ({ id, enabled }) =>
      optimistic<McpServer[]>(client, connectionKeys.mcp, (servers) =>
        servers.map((server) =>
          server.id === id ? { ...server, enabled } : server,
        ),
      ),
    onSuccess: remember,
    onError: rollback,
    onSettled: settle,
  })
  const setToolEnabled = useMutation({
    mutationFn: ({
      id,
      tool,
      enabled,
    }: {
      id: string
      tool: string
      enabled: boolean
    }) =>
      connectionsApi.updateMcpServer(id, { tools: [{ name: tool, enabled }] }),
    onMutate: ({ id, tool, enabled }) =>
      optimistic<McpServer[]>(client, connectionKeys.mcp, (servers) =>
        servers.map((server) =>
          server.id === id
            ? {
                ...server,
                tools: server.tools.map((entry) =>
                  entry.name === tool ? { ...entry, enabled } : entry,
                ),
              }
            : server,
        ),
      ),
    onSuccess: remember,
    onError: rollback,
    onSettled: settle,
  })
  const remove = useMutation({
    mutationFn: connectionsApi.removeMcpServer,
    onSettled: settle,
  })
  // A test also refreshes the discovered tools, so the server is read again.
  const test = useMutation({
    mutationFn: async (id: string) => {
      const result = await connectionsApi.testMcpServer(id)
      remember(await connectionsApi.mcpServer(id))
      return result
    },
    onSettled: settle,
  })
  const connect = useMutation({
    mutationFn: ({ id, returnTo }: { id: string; returnTo: string }) =>
      connectionsApi.connectMcpServer(id, returnTo),
  })
  return { add, update, setEnabled, setToolEnabled, remove, test, connect }
}
