// SOURCING: coss ui Input, Badge, Empty; the settings frame (Twenty's API keys page: one row per key with its state and its action); lib/theorem/credentials (Theorem stores and verifies the key, and never hands it back)
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
import { useCredentialMutations, useCredentials } from '@/lib/theorem/credentials'
import type { Credential } from '@/lib/theorem/credentials'

export const Route = createFileRoute('/settings/keys')({
  component: KeysSettings,
})

const MAIN_PROVIDER = 'openrouter'

function KeysSettings() {
  const { data: credentials = [], error, isPending } = useCredentials()
  const main = credentials.find((credential) => credential.provider === MAIN_PROVIDER)
  const others = credentials.filter((credential) => credential.provider !== MAIN_PROVIDER)

  return (
    <SettingsPage
      title="API keys"
      description="Keys Theorem uses to reach model providers for you. Your agent runs the same way on any of them. Theorem checks a key with the provider before keeping it, stores it encrypted, and never shows it again."
    >
      {error ? (
        <Empty className="rounded-lg border border-separator">
          <EmptyTitle>Theorem did not list its keys</EmptyTitle>
          <EmptyDescription>{describeError(error)}</EmptyDescription>
        </Empty>
      ) : isPending ? (
        <p className="text-sm text-ink-muted">Checking...</p>
      ) : (
        <>
          {main && (
            <SettingsSection
              title={main.name}
              description="Reaches most models Theorem offers, including its default. Your own key takes precedence over your Theorem's."
            >
              <SettingsBox>
                <ProviderKey credential={main} main />
              </SettingsBox>
            </SettingsSection>
          )}
          {others.length > 0 && (
            <SettingsSection
              title="Other providers"
              description="Theorem reaches these directly. A key here adds that provider's models to the picker, for you only."
            >
              <SettingsBox>
                {others.map((credential) => (
                  <ProviderKey key={credential.provider} credential={credential} />
                ))}
              </SettingsBox>
            </SettingsSection>
          )}
        </>
      )}
    </SettingsPage>
  )
}

function status(credential: Credential) {
  if (credential.source === 'personal')
    return { label: `Your key, ending ${credential.last4 ?? '····'}`, variant: 'success' as const }
  if (credential.source === 'deployment')
    return { label: "Your Theorem's own key", variant: 'secondary' as const }
  return { label: 'No key', variant: 'warning' as const }
}

function ProviderKey({ credential, main = false }: { credential: Credential; main?: boolean }) {
  const { save, remove } = useCredentialMutations(credential.provider)
  const [apiKey, setApiKey] = useState('')
  const [editing, setEditing] = useState(false)

  const { name } = credential
  const state = status(credential)
  const isTheirs = credential.source === 'personal'
  const showForm = editing || (main && !isTheirs)

  return (
    <>
      <SettingsRow
        Mark={Icon.Key}
        title={`${name} key`}
        description={<Badge variant={state.variant}>{state.label}</Badge>}
      >
        {!editing && isTheirs && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Remove
            </Button>
          </div>
        )}
        {!editing && !isTheirs && !main && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Add key
          </Button>
        )}
      </SettingsRow>
      {remove.error && (
        <p className="px-3 pb-3 text-sm text-redwood">{describeError(remove.error)}</p>
      )}
      {showForm && (
        <form
          className="flex flex-col gap-2 px-3 py-3"
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
              placeholder={main ? 'sk-or-v1-...' : 'API key'}
              aria-label={`${name} API key`}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="flex-1 font-mono"
            />
            <Button type="submit" size="sm" className="h-9" disabled={!apiKey.trim() || save.isPending}>
              {save.isPending ? 'Checking...' : 'Save key'}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            )}
          </div>
          {save.error ? (
            <p className="text-sm text-redwood">{describeError(save.error)}</p>
          ) : (
            <p className="text-xs text-ink-faint">
              {main && 'Create one at openrouter.ai/keys. '}
              It goes to your Theorem, which sends it only to {name}.
            </p>
          )}
        </form>
      )}
    </>
  )
}
