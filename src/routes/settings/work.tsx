// SOURCING: coss ui Switch, Badge, Empty and the settings frame (Twenty's settings rows); components/work/settings (the tracker's persisted switches, written with the revision they were read at so the fields another screen owns are kept) and components/work/states (the sync line)
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/coss/badge'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/coss/empty'
import { Switch } from '@/components/coss/switch'
import { Icon } from '@/components/icons'
import {
  SettingsBox,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { Skeleton } from '@/components/ui/skeleton'
import { SyncStatus } from '@/components/work/states'
import {
  settingsQuery,
  useSaveWorkSettings,
  useWorkTracker,
} from '@/components/work/settings'
import { describeError } from '@/lib/theorem/client'

export const Route = createFileRoute('/settings/work')({
  component: WorkSettingsPage,
})

function WorkSettingsPage() {
  const tracker = useWorkTracker()
  const settings = useQuery(settingsQuery)
  const save = useSaveWorkSettings()

  return (
    <SettingsPage
      title="Work tracker"
      description="Issues, pull requests and projects in the Index, with an inbox of what needs you. Turn it off and the Work screens, their modules and their templates are not offered, and nothing is asked of the tracker."
    >
      {tracker.state === 'off' && !tracker.served ? (
        <Empty className="rounded-lg border border-separator">
          <EmptyTitle>This Theorem does not serve the work tracker</EmptyTitle>
          <EmptyDescription>
            Nothing to set here until it does.
          </EmptyDescription>
        </Empty>
      ) : settings.error && !settings.data ? (
        <Empty className="rounded-lg border border-separator">
          <EmptyTitle>Theorem did not read the work settings</EmptyTitle>
          <EmptyDescription>{describeError(settings.error)}</EmptyDescription>
        </Empty>
      ) : !settings.data ? (
        <Skeleton className="h-28 w-full rounded-lg" />
      ) : (
        <>
          <SettingsSection title="Sources">
            <SettingsBox>
              <SettingsRow
                Mark={Icon.Checklist}
                title="Work tracker"
                description="Show issues, pull requests, projects and the inbox. Local items are always available while it is on."
              >
                <Switch
                  aria-label="Work tracker"
                  checked={settings.data.enabled}
                  disabled={save.isPending}
                  onCheckedChange={(enabled) => save.mutate({ enabled })}
                />
              </SettingsRow>
              <SettingsRow
                Mark={Icon.Code}
                title="GitHub issues and pull requests"
                description="Bring in the repositories you have connected. Off, only local items remain."
              >
                <Switch
                  aria-label="GitHub issues and pull requests"
                  checked={settings.data.github.enabled}
                  disabled={!settings.data.enabled || save.isPending}
                  onCheckedChange={(github) => save.mutate({ github })}
                />
              </SettingsRow>
            </SettingsBox>
            {save.error && (
              <p role="alert" className="text-sm text-error-ink">
                {describeError(save.error)}
              </p>
            )}
          </SettingsSection>
          <SettingsSection
            title="Tracked repositories"
            description="Which repositories are followed is set where GitHub is connected."
            action={
              <a
                href="/settings/connections"
                className="text-sm text-link underline-offset-2 hover:underline"
              >
                Settings, Connections
              </a>
            }
          >
            <SettingsBox>
              {settings.data.github.repos.length ? (
                <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
                  {settings.data.github.repos.map((repo) => (
                    <Badge key={repo} variant="secondary">
                      {repo}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-2.5 text-sm text-ink-muted">
                  No repositories are tracked yet.
                </p>
              )}
            </SettingsBox>
          </SettingsSection>
          {settings.data.enabled && settings.data.github.enabled && (
            <SettingsSection title="Sync">
              <SettingsBox>
                <SyncStatus className="flex items-center gap-2 px-3 py-2.5 text-sm" />
              </SettingsBox>
            </SettingsSection>
          )}
        </>
      )}
    </SettingsPage>
  )
}
