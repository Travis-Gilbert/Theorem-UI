// SOURCING: coss ui Input, Badge, Empty; the settings frame (Twenty's API keys page: one row per key with its state and its action); lib/theorem/credentials (Theorem stores and verifies keys and connections, and never hands a key back)
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Badge } from '@/components/coss/badge'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/coss/empty'
import { Input } from '@/components/coss/input'
import { Icon } from '@/components/icons'
import {
  SettingsBox,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import {
  useConnectionMutations,
  useConnections,
  useCredential,
  useCredentialMutations,
} from '@/lib/theorem/credentials'
import type { Connection, Credential } from '@/lib/theorem/credentials'
import { isNotServed } from '@/lib/theorem/passthrough'

export const Route = createFileRoute('/settings/keys')({
  component: KeysSettings,
})

/** What the page says about each provider Theorem ships a connection for. */
const PROVIDERS: Record<string, { label: string; runs: string; placeholder: string; where: string }> = {
  openrouter: {
    label: 'OpenRouter',
    runs: "Runs the models you pick from OpenRouter's list, decision models included.",
    placeholder: 'sk-or-v1-...',
    where: 'openrouter.ai/keys',
  },
  anthropic: {
    label: 'Anthropic',
    runs: 'Runs Claude models straight from Anthropic.',
    placeholder: 'sk-ant-...',
    where: 'console.anthropic.com/settings/keys',
  },
  openai: {
    label: 'OpenAI',
    runs: 'Runs OpenAI models straight from OpenAI.',
    placeholder: 'sk-...',
    where: 'platform.openai.com/api-keys',
  },
}

function KeysSettings() {
  const { data: connections, error } = useConnections()
  // A Theorem that predates connections takes an OpenRouter key only.
  const shipped = connections
    ? connections.filter((c) => !c.custom && PROVIDERS[c.id]).map((c) => c.id)
    : error && isNotServed(error)
      ? ['openrouter']
      : []
  return (
    <SettingsPage
      title="API keys"
      description="Keys Theorem uses to reach model providers for you. Theorem checks a key with the provider before keeping it, stores it encrypted, and never shows it again. Your own key takes precedence over your Theorem's."
    >
      <SettingsSection title="Providers" description="Add a key for any provider you want models from.">
        <ProviderKeys ids={shipped} />
      </SettingsSection>
      {connections && <CustomEndpoints connections={connections.filter((c) => c.custom)} />}
    </SettingsPage>
  )
}

function ProviderKeys({ ids }: { ids: readonly string[] }) {
  const { error } = useCredential('openrouter')
  if (error)
    return (
      <Empty className="rounded-lg border border-separator">
        <EmptyTitle>
          {isNotServed(error) ? 'This Theorem does not take keys yet' : 'Theorem did not list its keys'}
        </EmptyTitle>
        <EmptyDescription>
          {isNotServed(error)
            ? 'Turns use the keys your Theorem was started with.'
            : describeError(error)}
        </EmptyDescription>
      </Empty>
    )
  if (!ids.length) return <p className="px-1 text-sm text-ink-muted">Loading providers...</p>
  return (
    <SettingsBox>
      {ids.map((id) => (
        <ProviderKey key={id} provider={id} />
      ))}
    </SettingsBox>
  )
}

function status(credential: Credential | undefined) {
  if (credential?.source === 'personal')
    return { label: `Your key, ending ${credential.last4 ?? '····'}`, variant: 'success' as const }
  if (credential?.source === 'deployment')
    return { label: "Your Theorem's own key", variant: 'secondary' as const }
  return { label: 'No key', variant: 'warning' as const }
}

/** One provider's key: its state, and a form to add, replace or remove the person's own. */
function ProviderKey({ provider }: { provider: string }) {
  const copy = PROVIDERS[provider]
  const { data: credential, isPending } = useCredential(provider)
  const { save, remove } = useCredentialMutations(provider)
  const [apiKey, setApiKey] = useState('')
  const [editing, setEditing] = useState(false)
  if (!copy) return null
  const state = status(credential)
  const personal = credential?.source === 'personal'

  return (
    <div>
      <SettingsRow
        Mark={Icon.Key}
        title={copy.label}
        description={
          isPending ? (
            'Checking...'
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={state.variant}>{state.label}</Badge>
              <span>{copy.runs}</span>
            </span>
          )
        }
      >
        {!editing && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              {personal ? 'Replace' : 'Add key'}
            </Button>
            {personal && (
              <Button
                variant="ghost"
                size="sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Remove
              </Button>
            )}
          </div>
        )}
      </SettingsRow>
      {editing && (
        <form
          className="flex flex-col gap-2 px-3 pb-3"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate(apiKey.trim(), {
              onSuccess: () => {
                setApiKey('')
                setEditing(false)
              },
            })
          }}
        >
          <div className="flex gap-2">
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={copy.placeholder}
              aria-label={`${copy.label} API key`}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="flex-1 font-mono"
            />
            <Button type="submit" size="sm" className="h-9" disabled={!apiKey.trim() || save.isPending}>
              {save.isPending ? 'Checking...' : 'Save key'}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          {save.error ? (
            <p className="text-sm text-redwood">{describeError(save.error)}</p>
          ) : (
            <p className="text-xs text-ink-faint">
              Create one at {copy.where}. It goes to your Theorem, which sends it only to {copy.label}.
            </p>
          )}
        </form>
      )}
    </div>
  )
}

const STATUS = {
  live: { label: 'Answering', variant: 'success' },
  cached: { label: 'Not answering, last list kept', variant: 'warning' },
  unavailable: { label: 'Not answering', variant: 'error' },
} as const

/** The person's own OpenAI-compatible endpoints: a local server, LiteLLM, vLLM, a hosted gateway. */
function CustomEndpoints({ connections }: { connections: readonly Connection[] }) {
  const { create, remove } = useConnectionMutations()
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const reset = () => {
    setLabel('')
    setBaseUrl('')
    setApiKey('')
    setAdding(false)
  }

  return (
    <SettingsSection
      title="OpenAI-compatible endpoints"
      description="Any server that speaks OpenAI's chat API. Theorem checks the address and lists its models before keeping it; its models then appear beside the others."
      action={
        !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Icon.Add className="size-3.5" />
            Add endpoint
          </Button>
        )
      }
    >
      {(connections.length > 0 || adding) && (
        <SettingsBox>
          {connections.map((connection) => (
            <SettingsRow
              key={connection.id}
              Mark={Icon.Link}
              title={connection.label}
              description={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS[connection.status].variant}>{STATUS[connection.status].label}</Badge>
                  <span className="font-mono text-xs">{connection.baseUrl}</span>
                  {connection.credential?.configured && <span>key ending {connection.credential.last4 ?? '····'}</span>}
                </span>
              }
            >
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove ${connection.label}`}
                disabled={remove.isPending && remove.variables === connection.id}
                onClick={() => remove.mutate(connection.id)}
              >
                Remove
              </Button>
            </SettingsRow>
          ))}
          {adding && (
            <form
              className="flex flex-col gap-2 px-3 py-3"
              onSubmit={(event) => {
                event.preventDefault()
                create.mutate(
                  {
                    label: label.trim(),
                    baseUrl: baseUrl.trim(),
                    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
                  },
                  { onSuccess: reset },
                )
              }}
            >
              <div className="flex gap-2">
                <Input
                  placeholder="Name"
                  aria-label="Endpoint name"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="w-40"
                />
                <Input
                  type="url"
                  spellCheck={false}
                  placeholder="https://example.com/v1"
                  aria-label="Base URL"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  className="flex-1 font-mono"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="API key, if it needs one"
                  aria-label="Endpoint API key"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="flex-1 font-mono"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-9"
                  disabled={!label.trim() || !baseUrl.trim() || create.isPending}
                >
                  {create.isPending ? 'Checking...' : 'Add'}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9" onClick={reset}>
                  Cancel
                </Button>
              </div>
              {create.error ? (
                <p className="text-sm text-redwood">{describeError(create.error)}</p>
              ) : (
                <p className="text-xs text-ink-faint">
                  A hosted Theorem reaches only public https addresses. A Theorem on your own machine can reach localhost.
                </p>
              )}
            </form>
          )}
        </SettingsBox>
      )}
      {remove.error && <p className="text-sm text-redwood">{describeError(remove.error)}</p>}
    </SettingsSection>
  )
}
