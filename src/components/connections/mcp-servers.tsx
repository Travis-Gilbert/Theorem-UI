// SOURCING: coss ui Switch, Menu, AlertDialog, Empty and Skeleton over the settings frame (a row per server, as the API keys page does per key); lib/theorem/connections' queries and mutations. These are external servers Theorem speaks MCP to on the person's behalf; nothing here sends MCP from the browser.
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/coss/alert-dialog'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/coss/empty'
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from '@/components/coss/menu'
import { Switch } from '@/components/coss/switch'
import { Icon } from '@/components/icons'
import {
  SettingsBox,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { describeError } from '@/lib/theorem/client'
import { isNotServed } from '@/lib/theorem/passthrough'
import {
  useConnections,
  useMcpMutations,
  useMcpServers,
} from '@/lib/theorem/connections'
import type { McpServer } from '@/lib/theorem/connections'
import { StatusBadge, addressOf } from './parts'
import { ServerNotice, TestOutcome } from './server-actions'
import { ServerDetail } from './server-detail'
import { ServerDialog } from './server-dialog'

export function McpServers() {
  const servers = useMcpServers()
  const connections = useConnections()
  const stdioAvailable = connections.data?.stdioAvailable ?? false
  const [adding, setAdding] = useState(false)
  const [detailId, setDetailId] = useState<string>()
  // The edited server stays named while the dialog closes, so it does not flash into the add form.
  const [edit, setEdit] = useState<{ id: string; open: boolean }>()
  const editing = servers.data?.find((server) => server.id === edit?.id)

  return (
    <SettingsSection
      title="MCP servers"
      description="External tool servers your agent can call. Theorem connects to them for you and keeps their credentials."
      action={
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Icon.Add className="size-4" />
          Add server
        </Button>
      }
    >
      {servers.error ? (
        <Empty className="rounded-lg border border-separator">
          <EmptyTitle>
            {isNotServed(servers.error)
              ? 'This Theorem does not serve connections yet'
              : 'Theorem did not list its MCP servers'}
          </EmptyTitle>
          <EmptyDescription>{describeError(servers.error)}</EmptyDescription>
          <Button variant="outline" size="sm" onClick={() => void servers.refetch()}>
            Try again
          </Button>
        </Empty>
      ) : servers.isPending ? (
        <SettingsBox>
          {[0, 1].map((row) => (
            <div key={row} className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="size-7" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </SettingsBox>
      ) : servers.data.length === 0 ? (
        <Empty className="rounded-lg border border-separator py-10 md:py-10">
          <EmptyTitle>No MCP servers yet</EmptyTitle>
          <EmptyDescription>
            Add a server and its tools join your agent in any conversation. You
            choose, per conversation, which connections are on.
          </EmptyDescription>
          <Button size="sm" onClick={() => setAdding(true)}>
            Add server
          </Button>
        </Empty>
      ) : (
        <SettingsBox>
          {servers.data.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              onOpen={() => setDetailId(server.id)}
              onEdit={() => setEdit({ id: server.id, open: true })}
            />
          ))}
        </SettingsBox>
      )}

      <ServerDialog
        open={adding}
        onOpenChange={setAdding}
        stdioAvailable={stdioAvailable}
        onReviewTools={setDetailId}
      />
      <ServerDialog
        open={Boolean(edit?.open && editing)}
        onOpenChange={(open) => edit && setEdit({ ...edit, open })}
        server={editing}
        stdioAvailable={stdioAvailable}
      />
      <ServerDetail
        id={detailId}
        onOpenChange={(open) => !open && setDetailId(undefined)}
      />
    </SettingsSection>
  )
}

function ServerRow({
  server,
  onOpen,
  onEdit,
}: {
  server: McpServer
  onOpen: () => void
  onEdit: () => void
}) {
  const { setEnabled, test, remove } = useMcpMutations()
  const [confirming, setConfirming] = useState(false)
  const tools = server.tools.length
  const struggling =
    server.status === 'connected' &&
    server.health.state !== 'ok' &&
    server.health.state !== 'unknown' &&
    server.health.detail

  return (
    <div>
      <SettingsRow
        Mark={Icon.Plugin}
        title={
          <button
            type="button"
            onClick={onOpen}
            className="max-w-full truncate rounded-sm text-start outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            {server.label}
          </button>
        }
        description={
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={server.status} health={server.health} />
            <span>
              {tools} {tools === 1 ? 'tool' : 'tools'}
            </span>
            <span className="min-w-0 truncate font-mono">{addressOf(server)}</span>
          </span>
        }
      >
        <Switch
          aria-label={`${server.label}: agent can use it`}
          checked={server.enabled}
          onCheckedChange={(enabled) =>
            setEnabled.mutate({ id: server.id, enabled })
          }
        />
        <Menu>
          <MenuTrigger
            aria-label={`${server.label} options`}
            className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Icon.More className="size-4" />
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-44">
            <MenuItem onClick={onOpen}>Tools and details</MenuItem>
            <MenuItem
              disabled={test.isPending}
              onClick={() => test.mutate(server.id)}
            >
              Test connection
            </MenuItem>
            <MenuItem onClick={onEdit}>Edit</MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={() => setConfirming(true)}>
              Remove
            </MenuItem>
          </MenuPopup>
        </Menu>
      </SettingsRow>

      {(setEnabled.error ||
        test.isPending ||
        test.data ||
        test.error ||
        struggling ||
        server.status === 'needs_auth' ||
        server.status === 'error') && (
        <div className="flex flex-col gap-2 px-3 pb-3 ps-13">
          <ServerNotice server={server} />
          {struggling && (
            <p className="text-xs text-warning-foreground">
              {server.health.detail}
            </p>
          )}
          {setEnabled.error && (
            <p role="alert" className="text-xs text-error-ink">
              {describeError(setEnabled.error)}
            </p>
          )}
          <TestOutcome
            pending={test.isPending}
            result={test.data}
            error={test.error}
          />
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {server.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Theorem forgets this server and any token saved for it. Its tools
              leave every conversation. You can add it again later.
            </AlertDialogDescription>
            {remove.error && (
              <p role="alert" className="text-sm text-error-ink">
                {describeError(remove.error)}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Keep
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(server.id, { onSuccess: () => setConfirming(false) })
              }
            >
              {remove.isPending ? 'Removing...' : 'Remove'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  )
}
