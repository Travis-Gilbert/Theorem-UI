// SOURCING: lib/theorem/response-styles useFrameworkMutations (create with `from` and `forStyle` makes a copy one style owns, so editing it leaves the other styles alone), the shared editor parts, describe/history panels
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/theorem/client'
import {
  frameworkQuery,
  isResponseStyleConflict,
  useFrameworkMutations,
} from '@/lib/theorem/response-styles'
import type {
  FrameworkDraft,
  ResponseFrameworkDetail,
  RestoreTarget,
} from '@/lib/theorem/response-styles'
import { ConflictNotice } from './conflict-notice'
import { DescribeChange } from './describe-change'
import {
  BackButton,
  EditorSection,
  LeaveGuard,
  SaveBar,
  TextField,
} from './editor-parts'
import { FrameworkHistory } from './history-panel'
import { ResourceMarks } from './resource-marks'
import {
  frameworkText,
  sameFrameworkDraft,
  toFrameworkDraft,
} from './style-text'

/**
 * One framework's text and its references. A framework can be listed by many
 * styles, so saving it changes all of them: the editor says which, and offers
 * a copy for one style to edit on its own.
 */
export function FrameworkEditor({
  initial,
  onBack,
  onOpen,
}: {
  initial: ResponseFrameworkDetail
  onBack: () => void
  /** Open another framework: the copy just made. */
  onOpen: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const { create, save, restore } = useFrameworkMutations()
  const [base, setBase] = useState(initial)
  const [draft, setDraft] = useState<FrameworkDraft>(toFrameworkDraft(initial))
  const [theirs, setTheirs] = useState<string>()
  const [savedAs, setSavedAs] = useState<number>()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<unknown>()

  const dirty = !sameFrameworkDraft(draft, toFrameworkDraft(base))
  const complete = Boolean(draft.name.trim() && draft.body.trim())
  const conflicted =
    isResponseStyleConflict(save.error) ||
    isResponseStyleConflict(restore.error)
  const failure = [create.error, save.error, refreshError].find(
    (error) => error && !isResponseStyleConflict(error),
  )
  const restoreFailure =
    restore.error && !isResponseStyleConflict(restore.error)
      ? restore.error
      : undefined
  const busy =
    create.isPending || save.isPending || restore.isPending || refreshing
  const shared = base.usedBy.length > 1

  const edit = (patch: Partial<FrameworkDraft>) =>
    setDraft((current) => ({ ...current, ...patch }))
  const clear = () => {
    create.reset()
    save.reset()
    restore.reset()
    setRefreshError(undefined)
    setTheirs(undefined)
  }
  const adopt = (detail: ResponseFrameworkDetail) => {
    setBase(detail)
    setDraft(toFrameworkDraft(detail))
  }

  const submit = () => {
    clear()
    save.mutate(
      { id: base.id, revision: base.revision, ...draft },
      {
        onSuccess: (saved) => {
          adopt(saved)
          setSavedAs(saved.revision)
        },
      },
    )
  }
  const doRestore = (to: RestoreTarget) => {
    clear()
    restore.mutate(
      { id: base.id, revision: base.revision, to },
      {
        onSuccess: (restored) => {
          adopt(restored)
          setSavedAs(restored.revision)
        },
      },
    )
  }
  const copyFor = (styleId: string) => {
    clear()
    create.mutate(
      { from: base.id, forStyle: styleId },
      { onSuccess: ({ framework }) => onOpen(framework.id) },
    )
  }

  const fetchFresh = async () => {
    setRefreshing(true)
    setRefreshError(undefined)
    try {
      return await queryClient.fetchQuery({
        ...frameworkQuery(base.id),
        staleTime: 0,
      })
    } catch (error) {
      setRefreshError(error)
      return undefined
    } finally {
      setRefreshing(false)
    }
  }
  const reload = async () => {
    const fresh = await fetchFresh()
    if (!fresh) return
    clear()
    adopt(fresh)
  }
  const keep = async () => {
    const fresh = await fetchFresh()
    if (!fresh) return
    setBase(fresh)
    setTheirs(frameworkText(toFrameworkDraft(fresh)))
  }

  return (
    <div className="flex flex-col gap-5">
      <LeaveGuard dirty={dirty} />
      <div>
        <BackButton label="All frameworks" dirty={dirty} onBack={onBack} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-medium">{base.name}</h2>
        <ResourceMarks resource={base} />
      </div>
      <div className="flex flex-col gap-2">
        <SaveBar
          dirty={dirty}
          saving={save.isPending}
          canSave={complete && !busy}
          problem={
            complete ? undefined : 'A framework needs a name and instructions.'
          }
          savedAs={savedAs}
          onSave={submit}
          onDiscard={() => {
            clear()
            setDraft(toFrameworkDraft(base))
          }}
        />
        {shared && (
          <p className="text-sm text-ink-muted">
            Saving changes this framework for {base.usedBy.length} styles:{' '}
            {base.usedBy.map((style) => style.name).join(', ')}.
          </p>
        )}
        {base.usedBy.length === 0 && (
          <p className="text-sm text-ink-muted">
            No style lists this framework yet.
          </p>
        )}
        {shared && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-ink-muted">
              To change it for one style only, make a copy for that style. The
              style then lists the copy, and the others keep this one.
              {dirty &&
                ' Save or discard your changes first: a copy starts from the saved text.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {base.usedBy.map((style) => (
                <Button
                  key={style.id}
                  size="xs"
                  variant="outline"
                  disabled={dirty || busy}
                  onClick={() => copyFor(style.id)}
                >
                  Duplicate for {style.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
      {conflicted && (
        <ConflictNotice
          noun="framework"
          busy={busy}
          theirs={theirs}
          mine={frameworkText(draft)}
          onReload={reload}
          onKeep={keep}
        />
      )}
      {failure !== undefined && failure !== null && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(failure)}
        </p>
      )}
      <TextField
        label="Name"
        value={draft.name}
        onChange={(name) => edit({ name })}
      />
      <TextField
        label="Description"
        hint="One line, shown beside the name wherever the framework is offered."
        value={draft.description}
        onChange={(description) => edit({ description })}
      />
      <TextField
        label="Instructions"
        hint="What the model does once it loads this framework."
        multiline
        tall
        value={draft.body}
        onChange={(body) => edit({ body })}
      />
      {draft.references.length > 0 && (
        <EditorSection
          title="References"
          description="Notes the model can read when it needs more than the instructions say."
        >
          {draft.references.map((reference, index) => (
            <TextField
              key={reference.path}
              label={`Reference: ${reference.path}`}
              multiline
              value={reference.body}
              onChange={(body) =>
                edit({
                  references: draft.references.map((item, at) =>
                    at === index ? { ...item, body } : item,
                  ),
                })
              }
            />
          ))}
        </EditorSection>
      )}
      <EditorSection
        title="Describe a change"
        description="Say what you want different and a model drafts it. You read the difference first; nothing changes until you apply it, and it still needs saving."
      >
        <DescribeChange
          kind="framework"
          current={draft}
          onApply={(proposal) => edit(proposal)}
        />
      </EditorSection>
      <EditorSection title="Preview">
        <p className="text-sm text-ink-muted">
          A framework is previewed through a style: tick it in a style, then
          preview that style.
        </p>
      </EditorSection>
      <EditorSection
        title="History"
        description="Every save is a revision. Restoring one adds a new revision; nothing is removed."
      >
        <FrameworkHistory
          detail={base}
          dirty={dirty}
          busy={busy}
          error={restoreFailure}
          onRestore={doRestore}
        />
      </EditorSection>
    </div>
  )
}
