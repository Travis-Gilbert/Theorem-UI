// SOURCING: coss ui Switch over the settings frame and lib/theorem/work-consequences (GET and PUT /api/work/v1/settings, whole document back with If-Match); the tracker's own on-off switch belongs to the work tracker, not here
import { Empty, EmptyDescription, EmptyTitle } from '@/components/coss/empty'
import { Switch } from '@/components/coss/switch'
import { SettingsBox, SettingsRow } from '@/components/settings/settings-frame'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import { isNotServed } from '@/lib/theorem/passthrough'
import {
  CONSEQUENCES,
  useConsequenceMutation,
  useWorkSettings,
} from '@/lib/theorem/work-consequences'

/** What Theorem does when GitHub reports something, one switch per consequence. */
export function GithubConsequences() {
  const settings = useWorkSettings()
  const set = useConsequenceMutation()

  if (settings.isPending)
    return <p className="text-sm text-ink-muted">Checking...</p>
  if (settings.error)
    return (
      <Empty className="rounded-lg border border-separator py-8 md:py-8">
        <EmptyTitle>
          {isNotServed(settings.error)
            ? 'This Theorem does not act on GitHub events yet'
            : 'Theorem did not read these settings'}
        </EmptyTitle>
        <EmptyDescription>{describeError(settings.error)}</EmptyDescription>
        {!isNotServed(settings.error) && (
          <Button variant="outline" size="sm" onClick={() => void settings.refetch()}>
            Try again
          </Button>
        )}
      </Empty>
    )

  return (
    <div className="flex flex-col gap-2">
      <SettingsBox>
        {CONSEQUENCES.map(({ id, title, description }) => (
          <SettingsRow key={id} title={title} description={description}>
            <Switch
              aria-label={title}
              checked={
                settings.data.consequences.find((entry) => entry.id === id)
                  ?.enabled ?? false
              }
              onCheckedChange={(enabled) => set.mutate({ id, enabled })}
            />
          </SettingsRow>
        ))}
      </SettingsBox>
      {set.error && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(set.error)}
        </p>
      )}
    </div>
  )
}
