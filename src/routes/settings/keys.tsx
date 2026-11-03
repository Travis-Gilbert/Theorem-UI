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
import { useCredential, useCredentialMutations } from '@/lib/theorem/credentials'
import type { Credential } from '@/lib/theorem/credentials'
import { isNotServed } from '@/lib/theorem/passthrough'

export const Route = createFileRoute('/settings/keys')({
  component: KeysSettings,
})

function KeysSettings() {
  return (
    <SettingsPage
      title="API keys"
      description="Keys Theorem uses to reach model providers for you. Theorem checks a key with the provider before keeping it, stores it encrypted, and never shows it again."
    >
      <OpenRouterKey />
    </SettingsPage>
  )
}

function status(credential: Credential | undefined) {
  if (credential?.source === 'personal')
    return { label: `Your key, ending ${credential.last4 ?? '····'}`, variant: 'success' as const }
  if (credential?.source === 'deployment')
    return { label: "Your Theorem's own key", variant: 'secondary' as const }
  return { label: 'No key', variant: 'warning' as const }
}

function OpenRouterKey() {
  const { data: credential, error, isPending } = useCredential('openrouter')
  const { save, remove } = useCredentialMutations('openrouter')
  const [apiKey, setApiKey] = useState('')
  const [editing, setEditing] = useState(false)

  if (error)
    return (
      <Empty className="rounded-lg border border-separator">
        <EmptyTitle>
          {isNotServed(error) ? 'This Theorem does not take keys yet' : 'Theorem did not list its keys'}
        </EmptyTitle>
        <EmptyDescription>
          {isNotServed(error)
            ? 'Turns on OpenRouter models use the key your Theorem was started with.'
            : describeError(error)}
        </EmptyDescription>
      </Empty>
    )

  const state = status(credential)
  const showForm = editing || (!isPending && credential?.source !== 'personal')

  return (
    <SettingsSection
      title="OpenRouter"
      description="Runs the models you pick from OpenRouter's list. Your own key takes precedence over your Theorem's."
    >
      <SettingsBox>
        <SettingsRow
          Mark={Icon.Key}
          title="OpenRouter key"
          description={isPending ? 'Checking...' : <Badge variant={state.variant}>{state.label}</Badge>}
        >
          {credential?.source === 'personal' && !editing && (
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
        </SettingsRow>
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
                placeholder="sk-or-v1-..."
                aria-label="OpenRouter API key"
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
                Create one at openrouter.ai/keys. It goes to your Theorem, which sends it only to OpenRouter.
              </p>
            )}
          </form>
        )}
      </SettingsBox>
    </SettingsSection>
  )
}
