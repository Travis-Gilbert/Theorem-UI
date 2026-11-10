// SOURCING: ui/dialog over Base UI Dialog, coss ui Switch, Input and Badge, lib/theorem/connections' queries and mutations; the tool list is the server's own, as Theorem discovered it
import { useState } from 'react'
import { Input } from '@/components/coss/input'
import { Switch } from '@/components/coss/switch'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { describeError } from '@/lib/theorem/client'
import { useMcpMutations, useMcpServers } from '@/lib/theorem/connections'
import type { McpServer } from '@/lib/theorem/connections'
import { EffectBadge, StatusBadge, addressOf, ago } from './parts'
import { matching } from './search'
import {
  ConnectButton,
  ServerNotice,
  TestOutcome,
  TokenReplace,
} from './server-actions'

/** Past this many tools the list gets a search box. */
const SEARCHABLE = 8

/** One server in full: how it is doing, how it signs in, and each tool it offers. */
export function ServerDetail({
  id,
  onOpenChange,
}: {
  /** The open server's id; undefined keeps the dialog closed. */
  id: string | undefined
  onOpenChange: (open: boolean) => void
}) {
  const { data: servers } = useMcpServers()
  const server = servers?.find((entry) => entry.id === id)
  return (
    <Dialog open={Boolean(server)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {server && <Body server={server} />}
      </DialogContent>
    </Dialog>
  )
}

function Body({ server }: { server: McpServer }) {
  const { test, setToolEnabled, connect } = useMcpMutations()
  const [query, setQuery] = useState('')
  const tools = matching(
    server.tools,
    query,
    (tool) => tool.name,
    (tool) => tool.title ?? '',
  )
  const checked = ago(server.health.checkedAt)
  const discovered = ago(server.discoveredAt)

  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 pe-8">
          <span className="min-w-0 truncate">{server.label}</span>
          <StatusBadge status={server.status} health={server.health} />
        </DialogTitle>
        <DialogDescription className="break-all font-mono text-xs">
          {addressOf(server)}
        </DialogDescription>
      </DialogHeader>

      <ServerNotice server={server} />

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Connection</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={test.isPending}
            onClick={() => test.mutate(server.id)}
          >
            {test.isPending ? 'Testing...' : 'Test connection'}
          </Button>
          <span className="text-xs text-ink-muted">
            {[
              checked && `Checked ${checked}`,
              discovered && `Tools last discovered ${discovered}`,
            ]
              .filter(Boolean)
              .join('. ') || 'Not checked yet'}
          </span>
        </div>
        <TestOutcome
          pending={test.isPending}
          result={test.data}
          error={test.error}
        />
        {server.health.detail && server.status === 'connected' && (
          <p className="text-xs text-ink-muted">{server.health.detail}</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Sign-in</h3>
        {server.auth.type === 'none' && (
          <p className="text-sm text-ink-muted">
            This server does not ask for sign-in.
          </p>
        )}
        {server.auth.type === 'bearer' && (
          <>
            <p className="text-sm text-ink-muted">
              {server.auth.configured
                ? 'A bearer token is saved. It is never shown; replace it below if it stops working.'
                : 'This server uses a bearer token, and none is saved.'}
            </p>
            <TokenReplace server={server} />
          </>
        )}
        {server.auth.type === 'oauth' && (
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-ink-muted">
              {server.auth.configured
                ? 'Signed in with the server.'
                : 'Not signed in yet.'}
            </p>
            <ConnectButton server={server} connect={connect} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          Tools{server.tools.length > 0 ? ` (${server.tools.length})` : ''}
        </h3>
        {server.tools.length > SEARCHABLE && (
          <Input
            type="search"
            aria-label="Search tools"
            placeholder="Search tools"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
        {server.toolsTruncated && (
          <p className="text-xs text-ink-muted">
            This server lists more tools than Theorem keeps. The first{' '}
            {server.tools.length} are here; the rest are not offered to your
            agent.
          </p>
        )}
        {server.tools.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No tools found yet. Test the connection to look again.
          </p>
        ) : tools.length === 0 ? (
          <p className="text-sm text-ink-muted">No tool matches that.</p>
        ) : (
          <ul className="flex max-h-72 flex-col divide-y divide-separator overflow-y-auto rounded-lg border border-separator">
            {tools.map((tool) => (
              <li key={tool.name} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">
                    {tool.title ?? tool.name}
                  </span>
                  {tool.title && tool.title !== tool.name && (
                    <span className="truncate font-mono text-xs text-ink-faint">
                      {tool.name}
                    </span>
                  )}
                  {tool.description && (
                    <span className="line-clamp-2 text-xs text-ink-muted">
                      {tool.description}
                    </span>
                  )}
                </div>
                <EffectBadge effect={tool.effect} />
                <Switch
                  aria-label={`Allow ${tool.title ?? tool.name}`}
                  checked={tool.enabled}
                  onCheckedChange={(enabled) =>
                    setToolEnabled.mutate({
                      id: server.id,
                      tool: tool.name,
                      enabled,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-faint">
          A tool marked Write changes something on the server, so your agent
          asks you first. Switching a tool off removes it from every
          conversation.
        </p>
        {setToolEnabled.error && (
          <p role="alert" className="text-xs text-error-ink">
            {describeError(setToolEnabled.error)}
          </p>
        )}
      </section>
    </div>
  )
}
