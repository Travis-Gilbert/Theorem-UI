// SOURCING: @tanstack/react-query over Theorem's life_*, jmap_* and connector doors, with coss ui
// Input, Textarea, Group and Badge and ui Button. The panel is the life agent's standing
// state: its addresses, what arrived and how the gate ranked it, what it sent, and which
// inboxes it may read. The agent's reach itself runs as standing programs on the canvas.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '@/components/coss/badge'
import { Checkbox } from '@/components/coss/checkbox'
import { Group } from '@/components/coss/group'
import { Input } from '@/components/coss/input'
import { Textarea } from '@/components/coss/textarea'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { bootstrap, mutate } from '@/lib/theorem/client'
import { callTool } from '@/lib/theorem/native'
import { theoremJson } from '@/lib/theorem/passthrough'
import { Choice, Section, ToolError } from './section'

const lifeKey = (...parts: Array<string>) => ['life', ...parts]

type Alias = {
  address?: string
  alias: string
  counterparty: string
  status: string
}
type GateEntry = {
  row_id: string
  decided_at: string
  title?: string | null
  route: { class: string; kind: string; item_id: string; evidence: unknown }
}
type SendEntry = {
  row_id: string
  sent_at: string
  receipt: {
    to?: string
    subject?: string
    provider_message_id?: string
    template?: string
  }
}
type Grant = {
  source: string
  status: string
  scopes: Array<string>
  stored_at: string
}
type AgentIdentity = { agent_name: string; user_display_name: string }
type Connector = {
  provider: string
  status: string
  account: { label?: string } | null
}
/** An inbox the agent may read, and the account connector that reaches it. */
const INBOXES = [
  { source: 'gmail', provider: 'gmail' },
  { source: 'calendar', provider: 'google_calendar' },
] as const
type JmapConnection = {
  connection_id: string
  host_base: string
  mailbox_ids: Array<string>
  last_sync_at_ms?: number | null
  last_status?: string | null
}

function useLifeMutation<TArgs, TData = unknown>(
  run: (args: TArgs) => Promise<TData>,
  keys: Array<ReadonlyArray<string>>,
) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      for (const queryKey of keys) void client.invalidateQueries({ queryKey })
    },
  })
}

function Aliases({ userSlug }: { userSlug: string }) {
  const aliases = useQuery({
    queryKey: lifeKey('aliases'),
    queryFn: () =>
      callTool<{ domain: string; aliases: Array<Alias> }>('life_aliases', {
        user_slug: userSlug,
      }),
  })
  const [counterparty, setCounterparty] = useState('')
  const mint = useLifeMutation(
    (name: string) =>
      callTool('life_mint_alias', {
        alias: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 6)}`,
        user_slug: userSlug,
        counterparty: name,
        created_at: new Date().toISOString(),
      }),
    [lifeKey('aliases')],
  )
  const revoke = useLifeMutation(
    (alias: string) => callTool('life_revoke_alias', { alias }),
    [lifeKey('aliases')],
  )
  return (
    <Section title="Addresses">
      <ToolError error={aliases.error ?? mint.error ?? revoke.error} />
      <ul className="flex flex-col gap-1">
        {aliases.data?.aliases.map((alias) => (
          <li key={alias.alias} className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ink">
                {alias.address ?? `${alias.alias}@${aliases.data.domain}`}
              </span>
              <span className="block truncate">
                {alias.counterparty}, {alias.status}
              </span>
            </span>
            {alias.status === 'active' && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => revoke.mutate(alias.alias)}
              >
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          mint.mutate(counterparty.trim())
          setCounterparty('')
        }}
      >
        <Group className="w-full">
          <Input
            aria-label="Who this address is for"
            size="sm"
            placeholder="Who this address is for"
            value={counterparty}
            onChange={(event) => setCounterparty(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            type="submit"
            disabled={!counterparty.trim() || mint.isPending}
          >
            Mint
          </Button>
        </Group>
      </form>
    </Section>
  )
}

function Arrivals() {
  const log = useQuery({
    queryKey: lifeKey('gate'),
    queryFn: () =>
      callTool<{ entries: Array<GateEntry> }>('life_gate_log', { limit: 50 }),
  })
  return (
    <Section title="Arrivals">
      <ToolError error={log.error} />
      {log.data?.entries.length === 0 && <p>Nothing has arrived yet.</p>}
      <ul className="flex flex-col gap-1.5">
        {log.data?.entries.map((entry) => (
          <li key={entry.row_id}>
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-ink">
                {entry.title ?? entry.route.item_id}
              </span>
              <Badge size="sm" variant="outline">
                {entry.route.class}
              </Badge>
            </span>
            <span className="block truncate">
              {entry.route.kind}, {entry.decided_at}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** Who the agent says it is and who it speaks for, in everything it sends. */
function Identity() {
  const identity = useQuery({
    queryKey: lifeKey('identity'),
    queryFn: () =>
      callTool<{ identity: AgentIdentity | null }>('life_agent_identity', {}),
  })
  const [draft, setDraft] = useState<Partial<AgentIdentity>>({})
  const current = identity.data?.identity
  const agentName = draft.agent_name ?? current?.agent_name ?? ''
  const displayName =
    draft.user_display_name ?? current?.user_display_name ?? ''
  const save = useLifeMutation(
    () =>
      callTool('life_set_agent_identity', {
        agent_name: agentName.trim(),
        user_display_name: displayName.trim(),
      }),
    [lifeKey('identity')],
  )
  const changed =
    agentName !== (current?.agent_name ?? '') ||
    displayName !== (current?.user_display_name ?? '')
  return (
    <Section title="Identity" Mark={Icon.Agent}>
      <ToolError error={identity.error ?? save.error} />
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate(undefined)
        }}
      >
        <Input
          aria-label="Agent name"
          size="sm"
          placeholder="Agent name"
          value={agentName}
          onChange={(event) =>
            setDraft((value) => ({ ...value, agent_name: event.target.value }))
          }
        />
        <Input
          aria-label="Your name"
          size="sm"
          placeholder="Your name"
          value={displayName}
          onChange={(event) =>
            setDraft((value) => ({
              ...value,
              user_display_name: event.target.value,
            }))
          }
        />
        <Button
          size="xs"
          type="submit"
          variant="outline"
          className="self-start"
          disabled={
            !agentName.trim() ||
            !displayName.trim() ||
            !changed ||
            save.isPending
          }
        >
          Save
        </Button>
      </form>
    </Section>
  )
}

function Outbound() {
  const log = useQuery({
    queryKey: lifeKey('outbound'),
    queryFn: () =>
      callTool<{ entries: Array<SendEntry> }>('life_outbound_log', {
        limit: 50,
      }),
  })
  const templates = useQuery({
    queryKey: lifeKey('templates'),
    queryFn: () =>
      callTool<{ templates: Array<string> }>('life_outbound_templates', {}),
  })
  const [draft, setDraft] = useState({
    template: '',
    to: '',
    subject: '',
    original_body: '',
  })
  const template = draft.template || templates.data?.templates[0] || ''
  const send = useLifeMutation(
    () => callTool('life_outbound_send', { ...draft, template }),
    [lifeKey('outbound')],
  )
  const change =
    (field: keyof typeof draft) => (event: { target: { value: string } }) =>
      setDraft((current) => ({ ...current, [field]: event.target.value }))
  return (
    <Section title="Outbound" Mark={Icon.Sink}>
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          send.mutate(undefined)
        }}
      >
        <Choice
          label="Template"
          value={template || undefined}
          options={templates.data?.templates ?? []}
          onChange={(name) =>
            setDraft((current) => ({ ...current, template: name }))
          }
        />
        <Input
          aria-label="To"
          size="sm"
          placeholder="To"
          type="email"
          value={draft.to}
          onChange={change('to')}
        />
        <Input
          aria-label="Subject"
          size="sm"
          placeholder="Subject"
          value={draft.subject}
          onChange={change('subject')}
        />
        <Textarea
          aria-label="Original message"
          size="sm"
          placeholder="Original message"
          rows={3}
          value={draft.original_body}
          onChange={change('original_body')}
        />
        <Button
          size="xs"
          type="submit"
          className="self-start"
          disabled={!template || !draft.to || !draft.subject || send.isPending}
        >
          Send
        </Button>
      </form>
      <ToolError error={log.error ?? send.error} />
      <ul className="flex flex-col gap-1.5">
        {log.data?.entries.map((entry) => (
          <li key={entry.row_id}>
            <span className="block truncate text-ink">
              {entry.receipt.subject}
            </span>
            <span className="block truncate">
              {entry.receipt.to}, {entry.sent_at}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Inboxes() {
  const grants = useQuery({
    queryKey: lifeKey('grants'),
    queryFn: () => callTool<{ grants: Array<Grant> }>('life_grants', {}),
  })
  const connectors = useQuery({
    queryKey: lifeKey('connectors'),
    queryFn: () =>
      theoremJson<{ providers: Array<Connector> }>('/api/chat/v1/connectors'),
  })
  // The account is granted at the provider, which sends the person back here.
  const connect = useMutation({
    mutationFn: (provider: string) =>
      mutate((headers) =>
        theoremJson<{ authorizationUrl: string }>(
          `/api/chat/v1/connectors/${provider}/connect`,
          {
            method: 'POST',
            headers: { ...headers },
            body: { returnTo: location.pathname + location.search },
          },
        ),
      ),
    onSuccess: ({ authorizationUrl }) => location.assign(authorizationUrl),
  })
  const toggle = useLifeMutation(
    ({ source, active }: { source: string; active: boolean }) =>
      callTool(active ? 'life_revoke_grant' : 'life_store_grant', { source }),
    [lifeKey('grants')],
  )
  const sync = useLifeMutation(
    (source: string) => callTool('life_sync_inbox', { source }),
    [lifeKey('gate'), lifeKey('grants')],
  )
  return (
    <Section title="Inboxes" Mark={Icon.Mail}>
      <ToolError
        error={
          grants.error ??
          connectors.error ??
          connect.error ??
          toggle.error ??
          sync.error
        }
      />
      {INBOXES.map(({ source, provider }) => {
        const grant = grants.data?.grants.find((row) => row.source === source)
        const active = grant?.status === 'active'
        const account = connectors.data?.providers.find(
          (row) => row.provider === provider,
        )
        const connected = account?.status === 'connected'
        return (
          <div key={source} className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-ink capitalize">
              {source}
              {connected && account.account?.label && (
                <span className="ml-1.5 text-ink-muted normal-case">
                  {account.account.label}
                </span>
              )}
            </span>
            {account && !connected && (
              <Button
                size="xs"
                variant="outline"
                disabled={connect.isPending}
                onClick={() => connect.mutate(provider)}
              >
                Connect
              </Button>
            )}
            {active && connected && (
              <Button
                size="xs"
                variant="outline"
                disabled={sync.isPending}
                onClick={() => sync.mutate(source)}
              >
                Sync
              </Button>
            )}
            {(active || connected) && (
              <Button
                size="xs"
                variant={active ? 'ghost' : 'outline'}
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ source, active })}
              >
                {active ? 'Revoke' : 'Allow'}
              </Button>
            )}
          </div>
        )
      })}
    </Section>
  )
}

type JmapMailbox = { id: string; name: string; role?: string | null }

function JmapAccounts() {
  const accounts = useQuery({
    queryKey: lifeKey('jmap'),
    queryFn: () =>
      callTool<{ connections: Array<JmapConnection> }>('jmap_connections', {}),
  })
  const [draft, setDraft] = useState({ host_base: '', bearer_token: '' })
  const [chosen, setChosen] = useState<Array<string>>([])
  // Asking the host for its mailboxes is also what proves the host and token work.
  const find = useLifeMutation(
    () =>
      callTool<{ mailboxes: Array<JmapMailbox> }>(
        'jmap_mailboxes_discover',
        draft,
      ),
    [],
  )
  const connect = useLifeMutation(
    () =>
      callTool('jmap_connect', {
        connection_id: new URL(draft.host_base).hostname.replaceAll('.', '-'),
        host_base: draft.host_base,
        bearer_token: draft.bearer_token,
        mailbox_ids: chosen,
      }),
    [lifeKey('jmap')],
  )
  const edit = (change: Partial<typeof draft>) => {
    setDraft((current) => ({ ...current, ...change }))
    setChosen([])
    find.reset()
  }
  const sync = useLifeMutation(
    (id: string) => callTool('jmap_sync', { connection_id: id }),
    [lifeKey('jmap'), lifeKey('gate')],
  )
  const disconnect = useLifeMutation(
    (id: string) => callTool('jmap_disconnect', { connection_id: id }),
    [lifeKey('jmap')],
  )
  return (
    <Section title="Mail accounts">
      <ToolError
        error={
          accounts.error ??
          find.error ??
          connect.error ??
          sync.error ??
          disconnect.error
        }
      />
      <ul className="flex flex-col gap-1.5">
        {accounts.data?.connections.map((account) => (
          <li key={account.connection_id} className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ink">
                {account.connection_id}
              </span>
              <span className="block truncate">{account.last_status}</span>
            </span>
            <Button
              size="xs"
              variant="outline"
              disabled={sync.isPending}
              onClick={() => sync.mutate(account.connection_id)}
            >
              Sync
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => disconnect.mutate(account.connection_id)}
            >
              Disconnect
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!find.data) {
            find.mutate(undefined, {
              onSuccess: ({ mailboxes }) =>
                setChosen(
                  mailboxes
                    .filter((mailbox) => mailbox.role === 'inbox')
                    .map((mailbox) => mailbox.id),
                ),
            })
            return
          }
          connect.mutate(undefined, {
            onSuccess: () => edit({ host_base: '', bearer_token: '' }),
          })
        }}
      >
        <Input
          aria-label="JMAP host"
          size="sm"
          placeholder="https://api.fastmail.com"
          type="url"
          value={draft.host_base}
          onChange={(event) => edit({ host_base: event.target.value })}
        />
        <Input
          aria-label="API token"
          size="sm"
          placeholder="API token"
          type="password"
          autoComplete="off"
          value={draft.bearer_token}
          onChange={(event) => edit({ bearer_token: event.target.value })}
        />
        {find.data?.mailboxes.map((mailbox) => (
          <label key={mailbox.id} className="flex items-center gap-1.5">
            <Checkbox
              checked={chosen.includes(mailbox.id)}
              onCheckedChange={(checked) =>
                setChosen((current) =>
                  checked
                    ? [...current, mailbox.id]
                    : current.filter((id) => id !== mailbox.id),
                )
              }
            />
            <span className="min-w-0 truncate text-ink">{mailbox.name}</span>
          </label>
        ))}
        <Button
          size="xs"
          variant="outline"
          type="submit"
          className="self-start"
          disabled={
            !draft.host_base ||
            !draft.bearer_token ||
            find.isPending ||
            connect.isPending ||
            (find.data && chosen.length === 0)
          }
        >
          {find.data ? 'Connect' : 'Find mailboxes'}
        </Button>
      </form>
    </Section>
  )
}

export function LifePanel() {
  const session = useQuery({
    queryKey: ['session', 'bootstrap'],
    queryFn: () => bootstrap(),
    staleTime: Infinity,
  })
  return (
    <>
      <ToolError error={session.error} />
      {session.data && <Aliases userSlug={session.data.tenantId} />}
      <Arrivals />
      <Identity />
      <Outbound />
      <Inboxes />
      <JmapAccounts />
    </>
  )
}
