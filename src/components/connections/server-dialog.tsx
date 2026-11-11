// SOURCING: ui/dialog over Base UI Dialog, coss ui Field, Input, Textarea and SegmentedControl; validation in ./server-form (zod); lib/theorem/connections' mutations. Adding connects and discovers tools, so the dialog follows the request through to the tools it found or the server's own error.
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/coss/field'
import { Input } from '@/components/coss/input'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/coss/segmented-control'
import { Textarea } from '@/components/coss/textarea'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { describeError } from '@/lib/theorem/client'
import { useMcpMutations, useMcpServers } from '@/lib/theorem/connections'
import type { McpAuthType, McpServer } from '@/lib/theorem/connections'
import { EffectBadge, StatusBadge } from './parts'
import { ServerNotice, TestOutcome, TokenReplace } from './server-actions'
import {
  draftFromServer,
  emptyDraft,
  validateNewServer,
  validateServerEdit,
} from './server-form'
import type { DraftErrors, ServerDraft } from './server-form'

const AUTH_CHOICES: { value: McpAuthType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'oauth', label: 'Sign in' },
]

/** Adds a server, or with `server` edits its name and how it signs in. */
export function ServerDialog({
  open,
  onOpenChange,
  server,
  stdioAvailable,
  onReviewTools,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  server?: McpServer
  stdioAvailable: boolean
  onReviewTools?: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ServerEditor
          server={server}
          stdioAvailable={stdioAvailable}
          close={() => onOpenChange(false)}
          onReviewTools={onReviewTools}
        />
      </DialogContent>
    </Dialog>
  )
}

/** The dialog's body. It mounts with the dialog, so each opening starts clean. */
function ServerEditor({
  server,
  stdioAvailable,
  close,
  onReviewTools,
}: {
  server?: McpServer
  stdioAvailable: boolean
  close: () => void
  onReviewTools?: (id: string) => void
}) {
  const { add, update } = useMcpMutations()
  const [draft, setDraft] = useState<ServerDraft>(
    server ? draftFromServer(server) : emptyDraft,
  )
  const [errors, setErrors] = useState<DraftErrors>({})
  const [savedId, setSavedId] = useState<string>()

  if (savedId)
    return (
      <Saved id={savedId} close={close} onReviewTools={onReviewTools} />
    )

  const pending = add.isPending || update.isPending
  const failure = add.error ?? update.error
  const change = (next: Partial<ServerDraft>) => setDraft({ ...draft, ...next })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (server) {
      const checked = validateServerEdit(server, draft)
      setErrors(checked.ok ? {} : checked.errors)
      if (!checked.ok) return
      if (Object.keys(checked.value).length === 0) return close()
      update.mutate({ id: server.id, patch: checked.value }, { onSuccess: close })
      return
    }
    const checked = validateNewServer(draft, { stdioAvailable })
    setErrors(checked.ok ? {} : checked.errors)
    if (checked.ok)
      add.mutate(checked.value, { onSuccess: (saved) => setSavedId(saved.id) })
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{server ? `Edit ${server.label}` : 'Add MCP server'}</DialogTitle>
        <DialogDescription>
          {server
            ? 'Change its name or how it signs in. To change its address, remove it and add it again.'
            : 'Theorem connects to the server for you, finds the tools it offers, and keeps its credentials. Your browser never talks to it.'}
        </DialogDescription>
      </DialogHeader>

      <fieldset
        disabled={pending}
        className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0"
      >
        <Field invalid={Boolean(errors.label)}>
          <FieldLabel>Name</FieldLabel>
          <Input
            autoFocus
            placeholder="Docs search"
            value={draft.label}
            onChange={(event) => change({ label: event.target.value })}
          />
          <FieldError match={Boolean(errors.label)}>{errors.label}</FieldError>
        </Field>

        {server ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Address</span>
            <p className="break-all font-mono text-xs text-ink-muted">
              {server.transport === 'http'
                ? server.url
                : [server.command, ...(server.args ?? [])].join(' ')}
            </p>
          </div>
        ) : (
          <>
            <Choice
              label="Connection"
              hint={
                stdioAvailable
                  ? undefined
                  : 'Local command servers need a connected local runtime. Until one is connected, add a server by its web address.'
              }
            >
              <SegmentedControl size="sm" role="group" aria-label="Connection">
                <SegmentedControlItem
                  aria-pressed={draft.transport === 'http'}
                  data-pressed={draft.transport === 'http' ? '' : undefined}
                  onClick={() => change({ transport: 'http' })}
                >
                  Web address
                </SegmentedControlItem>
                <SegmentedControlItem
                  disabled={!stdioAvailable}
                  aria-pressed={draft.transport === 'stdio'}
                  data-pressed={draft.transport === 'stdio' ? '' : undefined}
                  onClick={() => change({ transport: 'stdio' })}
                >
                  Local command
                </SegmentedControlItem>
              </SegmentedControl>
            </Choice>

            {draft.transport === 'http' ? (
              <Field invalid={Boolean(errors.url)}>
                <FieldLabel>Address</FieldLabel>
                <Input
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://mcp.example.com/mcp"
                  value={draft.url}
                  onChange={(event) => change({ url: event.target.value })}
                  className="font-mono"
                />
                <FieldError match={Boolean(errors.url)}>{errors.url}</FieldError>
              </Field>
            ) : (
              <>
                <Field invalid={Boolean(errors.command)}>
                  <FieldLabel>Command</FieldLabel>
                  <Input
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="npx"
                    value={draft.command}
                    onChange={(event) => change({ command: event.target.value })}
                    className="font-mono"
                  />
                  <FieldError match={Boolean(errors.command)}>
                    {errors.command}
                  </FieldError>
                </Field>
                <Field>
                  <FieldLabel>Arguments</FieldLabel>
                  <Textarea
                    spellCheck={false}
                    placeholder={'-y\n@modelcontextprotocol/server-everything'}
                    value={draft.args}
                    onChange={(event) => change({ args: event.target.value })}
                    className="font-mono"
                  />
                  <FieldDescription>One argument per line.</FieldDescription>
                </Field>
              </>
            )}
          </>
        )}

        <Choice label="Sign-in">
          <SegmentedControl size="sm" role="group" aria-label="Sign-in">
            {AUTH_CHOICES.map(({ value, label }) => (
              <SegmentedControlItem
                key={value}
                aria-pressed={draft.auth === value}
                data-pressed={draft.auth === value ? '' : undefined}
                onClick={() => change({ auth: value })}
              >
                {label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </Choice>

        {draft.auth === 'bearer' && (
          <Field invalid={Boolean(errors.token)}>
            <FieldLabel>Token</FieldLabel>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={
                server?.auth.type === 'bearer' && server.auth.configured
                  ? 'Leave blank to keep the current token'
                  : 'Token'
              }
              value={draft.token}
              onChange={(event) => change({ token: event.target.value })}
              className="font-mono"
            />
            <FieldDescription>
              It goes to your Theorem, which sends it only to this server. It is
              never shown again.
            </FieldDescription>
            <FieldError match={Boolean(errors.token)}>{errors.token}</FieldError>
          </Field>
        )}
        {draft.auth === 'oauth' && (
          <p className="text-xs text-ink-muted">
            After saving, use Connect to sign in with the server. It stays
            unusable until you do.
          </p>
        )}
      </fieldset>

      {pending && !server && (
        <p role="status" className="text-sm text-ink-muted">
          Connecting to the server and finding its tools...
        </p>
      )}
      {failure && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(failure)}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {server ? 'Save' : pending ? 'Connecting...' : 'Add server'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function Choice({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

/** What adding a server came to: the tools it found, or why it is saved but not working. */
function Saved({
  id,
  close,
  onReviewTools,
}: {
  id: string
  close: () => void
  onReviewTools?: (id: string) => void
}) {
  const { data: servers } = useMcpServers()
  const { test } = useMcpMutations()
  const server = servers?.find((entry) => entry.id === id)
  if (!server)
    return (
      <DialogHeader>
        <DialogTitle>Server saved</DialogTitle>
        <DialogDescription>Reading it back...</DialogDescription>
      </DialogHeader>
    )
  const working = server.status === 'connected'
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {server.label}
          <StatusBadge status={server.status} health={server.health} />
        </DialogTitle>
        <DialogDescription>
          {working
            ? `Connected. Found ${server.tools.length} ${server.tools.length === 1 ? 'tool' : 'tools'} your agent can use.`
            : 'The server is saved, but Theorem could not use it yet.'}
        </DialogDescription>
      </DialogHeader>

      {working ? (
        <ul className="flex max-h-60 flex-col divide-y divide-separator overflow-y-auto rounded-lg border border-separator">
          {server.tools.map((tool) => (
            <li key={tool.name} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{tool.title ?? tool.name}</span>
              <EffectBadge effect={tool.effect} />
            </li>
          ))}
          {server.tools.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-muted">
              The server did not list any tools.
            </li>
          )}
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          <ServerNotice server={server} />
          {server.auth.type === 'bearer' && <TokenReplace server={server} />}
          <div className="flex flex-col gap-2">
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={test.isPending}
                onClick={() => test.mutate(server.id)}
              >
                Test again
              </Button>
            </div>
            <TestOutcome
              pending={test.isPending}
              result={test.data}
              error={test.error}
            />
          </div>
        </div>
      )}

      <DialogFooter>
        {working && onReviewTools && server.tools.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              close()
              onReviewTools(server.id)
            }}
          >
            Review tools
          </Button>
        )}
        <Button type="button" onClick={close}>
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}
