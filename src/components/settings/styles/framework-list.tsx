// SOURCING: lib/theorem/response-styles useFrameworkMutations (a framework in use is refused a delete by the server, which names the styles), the settings frame, the confirm dialog
import { useState } from 'react'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/coss/empty'
import { SettingsSection } from '@/components/settings/settings-frame'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import { useFrameworkMutations } from '@/lib/theorem/response-styles'
import type { ResponseFramework } from '@/lib/theorem/response-styles'
import { ConfirmAction } from './confirm-action'
import { ResourceList, ResourceRow } from './resource-row'

/** Every framework, with the styles that use it. */
export function FrameworkList({
  frameworks,
  onOpen,
}: {
  frameworks: ResponseFramework[]
  onOpen: (id: string) => void
}) {
  const { create, remove, restore } = useFrameworkMutations()
  const [failure, setFailure] = useState<unknown>()
  const busy = create.isPending || remove.isPending || restore.isPending
  const attempt = { onError: setFailure }

  return (
    <SettingsSection
      title="Frameworks"
      description="Ways of thinking a style can offer the model, such as explaining before answering. A framework can serve several styles."
    >
      {failure !== undefined && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(failure)}
        </p>
      )}
      {frameworks.length === 0 ? (
        <Empty className="rounded-lg border border-separator">
          <EmptyTitle>No frameworks</EmptyTitle>
          <EmptyDescription>
            This Theorem has no frameworks to offer.
          </EmptyDescription>
        </Empty>
      ) : (
        <ResourceList label="Frameworks">
          {frameworks.map((framework) => (
            <ResourceRow
              key={framework.id}
              resource={framework}
              actions={
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    aria-label={`Edit ${framework.name}`}
                    onClick={() => onOpen(framework.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    aria-label={`Duplicate ${framework.name}`}
                    disabled={busy}
                    onClick={() => {
                      setFailure(undefined)
                      create.mutate(
                        { from: framework.id, name: `${framework.name} copy` },
                        {
                          ...attempt,
                          onSuccess: (made) => onOpen(made.framework.id),
                        },
                      )
                    }}
                  >
                    Duplicate
                  </Button>
                  {framework.origin === 'user' ? (
                    <ConfirmAction
                      label="Delete"
                      ariaLabel={`Delete ${framework.name}`}
                      title={`Delete ${framework.name}?`}
                      description={
                        framework.usedBy.length
                          ? `${framework.usedBy.map((style) => style.name).join(', ')} still list it, so Theorem will refuse until you take it off ${framework.usedBy.length === 1 ? 'that style' : 'those styles'}. Deleting cannot be undone.`
                          : 'This removes the framework and its history. It cannot be undone.'
                      }
                      confirmLabel="Delete framework"
                      destructive
                      disabled={busy}
                      onConfirm={() => {
                        setFailure(undefined)
                        remove.mutate(
                          { id: framework.id, revision: framework.revision },
                          attempt,
                        )
                      }}
                    />
                  ) : (
                    framework.revision > 0 && (
                      <ConfirmAction
                        label="Reset to shipped"
                        ariaLabel={`Reset ${framework.name} to shipped`}
                        title={`Reset ${framework.name} to the shipped version?`}
                        description={`This saves a new revision holding Theorem's shipped text, for every style that uses it. Your own revisions stay in its history.`}
                        confirmLabel="Reset to shipped"
                        disabled={busy}
                        onConfirm={() => {
                          setFailure(undefined)
                          restore.mutate(
                            {
                              id: framework.id,
                              revision: framework.revision,
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
            >
              {framework.references.length > 0 && (
                <p className="text-xs text-ink-muted">
                  References:{' '}
                  {framework.references
                    .map((reference) => reference.title || reference.path)
                    .join(', ')}
                </p>
              )}
              <p className="text-xs text-ink-muted">
                {framework.usedBy.length
                  ? `Used by: ${framework.usedBy.map((style) => style.name).join(', ')}`
                  : 'Not used by any style.'}
              </p>
            </ResourceRow>
          ))}
        </ResourceList>
      )}
    </SettingsSection>
  )
}
