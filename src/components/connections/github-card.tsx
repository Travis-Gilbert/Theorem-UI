// SOURCING: coss ui Switch, Badge, AlertDialog, Empty and ui/avatar over the settings frame; lib/theorem/connections' queries and mutations. Connecting follows program/life-panel's connector pattern: POST connect with returnTo, then go to authorizationUrl; the page reads the connection afresh when GitHub sends the person back.
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/coss/alert-dialog'
import { Badge } from '@/components/coss/badge'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/coss/empty'
import { Switch } from '@/components/coss/switch'
import {
  SettingsBox,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { describeError } from '@/lib/theorem/client'
import {
  useConnections,
  useGithub,
  useGithubMutations,
} from '@/lib/theorem/connections'
import type { GithubConnection } from '@/lib/theorem/connections'
import { isNotServed } from '@/lib/theorem/passthrough'
import { GithubConsequences } from './github-consequences'
import { GithubDeliveries } from './github-deliveries'
import { GithubRepositories } from './github-repositories'
import { DeliveryBadge, StatusBadge, ago } from './parts'

export function GithubSection() {
  const list = useConnections()
  const entry = list.data?.connections.find(
    (connection) => connection.id === 'github',
  )
  const linked = Boolean(entry && entry.status !== 'disconnected')

  return (
    <SettingsSection
      title="GitHub"
      description="Connect your GitHub account so Theorem follows your repositories and your agent can work with them."
    >
      {list.error ? (
        <Empty className="rounded-lg border border-separator">
          <EmptyTitle>
            {isNotServed(list.error)
              ? 'This Theorem does not serve connections yet'
              : 'Theorem did not list its connections'}
          </EmptyTitle>
          <EmptyDescription>{describeError(list.error)}</EmptyDescription>
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : list.isPending ? (
        <SettingsBox>
          <div className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-1/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </SettingsBox>
      ) : linked ? (
        <GithubConnected />
      ) : (
        <GithubConnect />
      )}
    </SettingsSection>
  )
}

/** Starts the GitHub sign-in and sends the person back to this page when it ends. */
function useConnectGithub() {
  const { connect } = useGithubMutations()
  const start = () =>
    connect.mutate(location.pathname + location.search, {
      onSuccess: ({ authorizationUrl }) => location.assign(authorizationUrl),
    })
  return { connect, start }
}

function GithubConnect() {
  const { connect, start } = useConnectGithub()
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-separator px-4 py-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Connect GitHub</h3>
        <p className="text-sm text-ink-muted">
          Theorem links to your account through its GitHub app, so you choose
          which repositories it can see.
        </p>
      </div>
      <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-ink-muted">
        <li>
          Pushes, review requests, failed workflows and comments reach Theorem
          as they happen.
        </li>
        <li>
          Your agent can search code and read issues and pull requests. Anything
          that changes GitHub asks you first.
        </li>
        <li>You can turn it off, or disconnect, at any time.</li>
      </ul>
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={connect.isPending} onClick={start}>
          {connect.isPending ? 'Opening GitHub...' : 'Connect GitHub'}
        </Button>
        {connect.error && (
          <p role="alert" className="text-sm text-error-ink">
            {describeError(connect.error)}
          </p>
        )}
      </div>
    </div>
  )
}

function GithubConnected() {
  const github = useGithub(true)
  if (github.error)
    return (
      <Empty className="rounded-lg border border-separator">
        <EmptyTitle>Theorem did not read your GitHub connection</EmptyTitle>
        <EmptyDescription>{describeError(github.error)}</EmptyDescription>
        <Button variant="outline" size="sm" onClick={() => void github.refetch()}>
          Try again
        </Button>
      </Empty>
    )
  if (github.isPending)
    return <p className="text-sm text-ink-muted">Checking...</p>
  return <GithubDetails github={github.data} />
}

function Block({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
    </div>
  )
}

const initials = (label: string) => label.slice(0, 2).toUpperCase()

function GithubDetails({ github }: { github: GithubConnection }) {
  const { setEnabled, disconnect } = useGithubMutations()
  const { connect, start } = useConnectGithub()
  const [confirming, setConfirming] = useState(false)
  const { webhook, health, lastEvent } = github
  const { counts } = webhook
  const needsSignIn = github.status === 'needs_auth' || github.status === 'error'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SettingsBox>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Avatar>
              {github.account?.avatarUrl && (
                <AvatarImage src={github.account.avatarUrl} alt="" />
              )}
              <AvatarFallback>
                {initials(github.account?.label ?? github.label)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">
                {github.account?.label ?? github.label}
              </span>
              <span className="flex items-center gap-2 text-xs text-ink-muted">
                <StatusBadge status={github.status} health={github.health} />
                {ago(health.checkedAt) && `Checked ${ago(health.checkedAt)}`}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
              Disconnect
            </Button>
          </div>
          <SettingsRow
            title="Agent can use GitHub"
            description="Off keeps GitHub connected and followed, but your agent cannot reach it."
          >
            <Switch
              aria-label="Agent can use GitHub"
              checked={github.enabled}
              onCheckedChange={(enabled) => setEnabled.mutate(enabled)}
            />
          </SettingsRow>
        </SettingsBox>
        {setEnabled.error && (
          <p role="alert" className="text-sm text-error-ink">
            {describeError(setEnabled.error)}
          </p>
        )}
        {needsSignIn && (
          <div className="flex flex-col gap-2 rounded-lg border border-separator px-3 py-3">
            <p className="text-sm text-warning-foreground">
              {github.status === 'needs_auth'
                ? 'GitHub needs you to sign in again before Theorem can use it.'
                : 'Theorem could not use GitHub.'}
              {health.detail ? ` ${health.detail}` : ''}
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" disabled={connect.isPending} onClick={start}>
                {connect.isPending ? 'Opening GitHub...' : 'Sign in again'}
              </Button>
              {connect.error && (
                <p role="alert" className="text-sm text-error-ink">
                  {describeError(connect.error)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <Block
        title="Repositories"
        description="Theorem follows the repositories you check, and only those."
      >
        <GithubRepositories github={github} />
      </Block>

      <Block
        title="What your agent can do"
        description="Reading never changes anything. Writing changes GitHub, and your agent asks you first."
      >
        {github.availableActions.length === 0 ? (
          <p className="text-sm text-ink-muted">
            GitHub has not listed any actions for this connection.
          </p>
        ) : (
          <SettingsBox>
            {github.availableActions.map((action) => (
              <div key={action.name} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{action.title}</span>
                <Badge variant={action.effect === 'write' ? 'warning' : 'secondary'}>
                  {action.effect === 'write' ? 'Write' : 'Read'}
                </Badge>
                <Badge variant={action.granted ? 'success' : 'outline'}>
                  {action.granted ? 'Granted' : 'Not granted'}
                </Badge>
              </div>
            ))}
          </SettingsBox>
        )}
      </Block>

      <Block title="Events Theorem listens for">
        {github.subscribedEvents.length === 0 ? (
          <p className="text-sm text-ink-muted">No events are subscribed.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {github.subscribedEvents.map((event) => (
              <Badge key={event} variant="outline" className="font-mono">
                {event}
              </Badge>
            ))}
          </div>
        )}
      </Block>

      <Block title="Health and webhook">
        <SettingsBox>
          <SettingsRow
            title="Connection health"
            description={
              [
                health.state === 'ok'
                  ? 'Working'
                  : health.state === 'unknown'
                    ? 'Not checked yet'
                    : health.state === 'degraded'
                      ? 'Working, with problems'
                      : 'Not working',
                ago(health.checkedAt) && `checked ${ago(health.checkedAt)}`,
                health.detail,
              ]
                .filter(Boolean)
                .join(', ')
            }
          />
          <SettingsRow
            title="Webhook"
            description={
              webhook.configured
                ? 'GitHub tells Theorem the moment something changes in the repositories you follow.'
                : 'No webhook is set up, so Theorem learns about changes only when you or your agent look at GitHub.'
            }
          >
            <Badge variant={webhook.configured ? 'success' : 'warning'}>
              {webhook.configured ? 'Configured' : 'Not configured'}
            </Badge>
          </SettingsRow>
          <SettingsRow
            title="Deliveries"
            description={`${counts.received} received, ${counts.processed} processed, ${counts.pending} pending, ${counts.failed} failed${
              webhook.lastDeliveryAt
                ? `. Last one ${ago(webhook.lastDeliveryAt)}.`
                : '.'
            }`}
          />
          <SettingsRow
            title="Last event"
            description={
              lastEvent
                ? `${lastEvent.event}${lastEvent.action ? ` ${lastEvent.action}` : ''}${
                    lastEvent.repo ? ` in ${lastEvent.repo}` : ''
                  }, ${ago(lastEvent.receivedAt)}`
                : 'Nothing has arrived yet.'
            }
          >
            {lastEvent && <DeliveryBadge state={lastEvent.state} />}
          </SettingsRow>
        </SettingsBox>
        <GithubDeliveries />
      </Block>

      <Block
        title="When GitHub events arrive"
        description="What Theorem does on its own when GitHub reports something."
      >
        <GithubConsequences />
      </Block>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect GitHub?</AlertDialogTitle>
            <AlertDialogDescription>
              Theorem stops following your repositories and your agent loses
              access to GitHub. You can connect again later.
            </AlertDialogDescription>
            {disconnect.error && (
              <p role="alert" className="text-sm text-error-ink">
                {describeError(disconnect.error)}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Stay connected
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => setConfirming(false),
                })
              }
            >
              {disconnect.isPending ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  )
}
