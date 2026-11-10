// SOURCING: lib/theorem/response-styles useStyleMutations (duplicate is create with `from`; a shipped style is reset, never deleted), the settings frame, the confirm dialog
import { useState } from 'react'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/coss/empty'
import { SettingsSection } from '@/components/settings/settings-frame'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import { useStyleMutations } from '@/lib/theorem/response-styles'
import type { ResponseStyle } from '@/lib/theorem/response-styles'
import { ConfirmAction } from './confirm-action'
import { ResourceList, ResourceRow } from './resource-row'

/** Every style, with what can be done to each. Deleting asks first; so does going back to the shipped text. */
export function StyleList({
  styles,
  onOpen,
  onNew,
}: {
  styles: ResponseStyle[]
  onOpen: (id: string) => void
  onNew: () => void
}) {
  const { create, remove, restore } = useStyleMutations()
  const [failure, setFailure] = useState<unknown>()
  const busy = create.isPending || remove.isPending || restore.isPending
  const attempt = { onError: setFailure }

  return (
    <SettingsSection
      title="Styles"
      description="How Theorem writes its answers. Shipped styles come with Theorem; yours are the ones you make."
      action={
        <Button size="sm" variant="outline" onClick={onNew}>
          New style
        </Button>
      }
    >
      {failure !== undefined && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(failure)}
        </p>
      )}
      {styles.length === 0 ? (
        <Empty className="rounded-lg border border-separator">
          <EmptyTitle>No styles yet</EmptyTitle>
          <EmptyDescription>Make one with New style.</EmptyDescription>
        </Empty>
      ) : (
        <ResourceList label="Styles">
          {styles.map((style) => (
            <ResourceRow
              key={style.id}
              resource={style}
              actions={
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    aria-label={`Edit ${style.name}`}
                    onClick={() => onOpen(style.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    aria-label={`Duplicate ${style.name}`}
                    disabled={busy}
                    onClick={() => {
                      setFailure(undefined)
                      create.mutate(
                        { from: style.id, name: `${style.name} copy` },
                        {
                          ...attempt,
                          onSuccess: (copy) => onOpen(copy.id),
                        },
                      )
                    }}
                  >
                    Duplicate
                  </Button>
                  {style.origin === 'user' ? (
                    <ConfirmAction
                      label="Delete"
                      ariaLabel={`Delete ${style.name}`}
                      title={`Delete ${style.name}?`}
                      description="This removes the style and its history. A conversation or project that uses it goes back to the default. It cannot be undone."
                      confirmLabel="Delete style"
                      destructive
                      disabled={busy}
                      onConfirm={() => {
                        setFailure(undefined)
                        remove.mutate(
                          { id: style.id, revision: style.revision },
                          attempt,
                        )
                      }}
                    />
                  ) : (
                    style.revision > 0 && (
                      <ConfirmAction
                        label="Reset to shipped"
                        ariaLabel={`Reset ${style.name} to shipped`}
                        title={`Reset ${style.name} to the shipped version?`}
                        description="This saves a new revision holding Theorem's shipped text. Your own revisions stay in its history, so you can restore any of them."
                        confirmLabel="Reset to shipped"
                        disabled={busy}
                        onConfirm={() => {
                          setFailure(undefined)
                          restore.mutate(
                            {
                              id: style.id,
                              revision: style.revision,
                              to: 'shipped',
                            },
                            attempt,
                          )
                        }}
                      />
                    )
                  )}
                </>
              }
            />
          ))}
        </ResourceList>
      )}
    </SettingsSection>
  )
}
