// SOURCING: lib/theorem/response-styles useStyleMutations (a save carries the revision it was opened at as If-Match; a 412 is a conflict, never an overwrite), coss ui Checkbox, the shared editor parts, describe/preview/history panels
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Checkbox } from '@/components/coss/checkbox'
import { describeError } from '@/lib/theorem/client'
import {
  isResponseStyleConflict,
  styleQuery,
  useStyleMutations,
} from '@/lib/theorem/response-styles'
import type {
  ResponseFramework,
  ResponseStyleDetail,
  RestoreTarget,
  StyleDraft,
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
import { StyleHistory } from './history-panel'
import { PreviewPanel } from './preview-panel'
import { ResourceMarks } from './resource-marks'
import { sameStyleDraft, styleText, toStyleDraft } from './style-text'

const BLANK: StyleDraft = {
  name: '',
  description: '',
  body: '',
  frameworks: [],
}

/**
 * One style's text. `initial` is the style as it was loaded, and the revision
 * it carries is the one a save is made against; undefined is a style not yet
 * made. The editor holds its own copy from there: a background read never
 * replaces what the person is typing, and nothing is saved until they say so.
 * While a save, a restore or a reload is on its way the text is read-only: the
 * answer replaces the draft, so nothing typed meanwhile can be lost to it.
 */
export function StyleEditor({
  initial,
  frameworks,
  onBack,
  onOpen,
}: {
  initial: ResponseStyleDetail | undefined
  frameworks: ResponseFramework[]
  onBack: () => void
  /** Open another style: the one just made. */
  onOpen: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const { create, save, restore } = useStyleMutations()
  const [base, setBase] = useState(initial)
  const [draft, setDraft] = useState<StyleDraft>(
    initial ? toStyleDraft(initial) : BLANK,
  )
  const [theirs, setTheirs] = useState<string>()
  const [savedAs, setSavedAs] = useState<number>()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<unknown>()

  const frameworkName = (id: string) =>
    frameworks.find((framework) => framework.id === id)?.name ?? id
  const dirty = !sameStyleDraft(draft, base ? toStyleDraft(base) : BLANK)
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

  const edit = (patch: Partial<StyleDraft>) =>
    setDraft((current) => ({ ...current, ...patch }))
  const toggle = (id: string, on: boolean) => {
    const order = (candidate: string) => {
      const index = frameworks.findIndex(
        (framework) => framework.id === candidate,
      )
      return index < 0 ? frameworks.length : index
    }
    edit({
      frameworks: (on
        ? [...draft.frameworks, id]
        : draft.frameworks.filter((candidate) => candidate !== id)
      ).sort((a, b) => order(a) - order(b)),
    })
  }
  const clear = () => {
    create.reset()
    save.reset()
    restore.reset()
    setRefreshError(undefined)
    setTheirs(undefined)
  }
  const adopt = (detail: ResponseStyleDetail) => {
    setBase(detail)
    setDraft(toStyleDraft(detail))
  }

  const submit = () => {
    clear()
    if (!base)
      create.mutate(draft, { onSuccess: (created) => onOpen(created.id) })
    else
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
    if (!base) return
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

  /** The style as the server has it now, read past the cache. */
  const fetchFresh = async () => {
    if (!base) return undefined
    setRefreshing(true)
    setRefreshError(undefined)
    try {
      return await queryClient.fetchQuery({
        ...styleQuery(base.id),
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
  // The next save is made against the newer revision, over it, on purpose.
  const keep = async () => {
    const fresh = await fetchFresh()
    if (!fresh) return
    setBase(fresh)
    setTheirs(styleText(toStyleDraft(fresh), frameworkName))
  }

  return (
    <div className="flex flex-col gap-5">
      <LeaveGuard dirty={dirty} />
      <div>
        <BackButton label="All styles" dirty={dirty} onBack={onBack} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-medium">
          {base ? base.name : 'New style'}
        </h2>
        {base && <ResourceMarks resource={base} />}
      </div>
      <SaveBar
        dirty={dirty}
        saving={create.isPending || save.isPending}
        canSave={complete && !busy}
        problem={
          complete ? undefined : 'A style needs a name and instructions.'
        }
        savedAs={savedAs}
        saveLabel={base ? 'Save' : 'Create style'}
        onSave={submit}
        onDiscard={() => {
          clear()
          setDraft(base ? toStyleDraft(base) : BLANK)
        }}
      />
      {conflicted && (
        <ConflictNotice
          noun="style"
          busy={busy}
          theirs={theirs}
          mine={styleText(draft, frameworkName)}
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
        readOnly={busy}
        value={draft.name}
        onChange={(name) => edit({ name })}
      />
      <TextField
        label="Description"
        readOnly={busy}
        hint="One line, shown beside the name in the style menu."
        value={draft.description}
        onChange={(description) => edit({ description })}
      />
      <TextField
        label="Instructions"
        readOnly={busy}
        hint="Say in plain language how Theorem should answer: tone, length, how to open and close."
        multiline
        tall
        value={draft.body}
        onChange={(body) => edit({ body })}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Frameworks</legend>
        <p className="text-xs text-ink-muted">
          Ways of thinking the model can load when a question calls for them.
          Ticking one offers it; the model decides whether to use it.
        </p>
        {frameworks.length === 0 && (
          <p className="text-sm text-ink-muted">No frameworks are available.</p>
        )}
        {frameworks.map((framework) => (
          <label
            key={framework.id}
            className="flex items-start gap-2.5 rounded-md border border-separator px-3 py-2"
          >
            <Checkbox
              className="mt-0.5"
              aria-label={framework.name}
              checked={draft.frameworks.includes(framework.id)}
              disabled={busy}
              onCheckedChange={(checked) => toggle(framework.id, checked)}
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm">{framework.name}</span>
              {framework.description && (
                <span className="text-xs text-ink-muted">
                  {framework.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <EditorSection
        title="Describe a change"
        description="Say what you want different and a model drafts it. You read the difference first; nothing changes until you apply it, and it still needs saving."
      >
        <DescribeChange
          kind="style"
          current={draft}
          locked={busy}
          onApply={(proposal) => edit(proposal)}
        />
      </EditorSection>
      <EditorSection
        title="Preview"
        description="Try a question under this style before you save it."
      >
        <PreviewPanel saved={base} draft={draft} dirty={dirty} />
      </EditorSection>
      {base && (
        <EditorSection
          title="History"
          description="Every save is a revision. Restoring one adds a new revision; nothing is removed."
        >
          <StyleHistory
            detail={base}
            frameworkName={frameworkName}
            dirty={dirty}
            busy={busy}
            error={restoreFailure}
            onRestore={doRestore}
          />
        </EditorSection>
      )}
    </div>
  )
}
