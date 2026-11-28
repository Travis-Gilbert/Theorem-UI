// SOURCING: after Craft web's collection field editor (Mobbin ebf78810-7a01-4f15-a3af-3051010ed5cd: Add Field with a name and type, Hide and Order Fields, Edit Field) and Capacities' object type settings (icon, colour, properties); FieldDialog (records/field-form, the register's own field form) for adding and editing a property; field-form Segmented for the advanced choices; schema-edit newObjectType and toInput, and evolution.ts for what a change would do to existing objects; useAskTheorem (index/navigation) for describing a class in words, which reaches the same declareSchema through the agent
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '@/components/icons'
import { useAskTheorem } from '@/components/index/navigation'
import { SchemaConflictError } from '@/components/records/api'
import type {
  FieldSpec,
  ObjectType,
  ObjectTypeInput,
} from '@/components/records/contract'
import { FieldDialog, Segmented } from '@/components/records/field-form'
import { FieldTypeIcon, KIND } from '@/components/records/fields'
import { useDeclareObjectType } from '@/components/records/queries'
import { displayHint, withDisplayHint } from '@/components/records/model'
import type { DisplayHint } from '@/components/records/model'
import { newObjectType, toInput } from '@/components/records/schema-edit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { describeError } from '@/lib/theorem/client'
import {
  CLASS_TONES,
  notesExtension,
  objectClass,
  withNotesExtension,
} from '@/lib/objects/classes'
import type { ClassTone, NotesExtension } from '@/lib/objects/classes'
import { incompatibilities, refuses } from '@/lib/objects/evolution'
import { useClassRegistry } from '@/lib/objects/register'
import { cn } from '@/lib/utils'
import { CLASS_ICONS, ClassGlyph, ClassIcon, TONE_TILE } from './class-icon'
import { openPane } from './object-actions'

type Draft = {
  singular: string
  plural: string
  description: string
  icon: string
  tone: ClassTone
  layout: NonNullable<NotesExtension['layout']>
  enforcement: ObjectType['enforcement']
  /** Every property, in order; one left out is removed. */
  fields: FieldSpec[]
  /** How each property displays, by key. */
  hints: Record<string, DisplayHint | undefined>
  /** The property records are named by. */
  identifier: string
  cardFields: string[] | undefined
}

const NEW_FIELDS = newObjectType({
  labelSingular: 'Object',
  labelPlural: 'Objects',
}).fields

const draftOf = (type: ObjectType | undefined): Draft => {
  const ext = type ? notesExtension(type) : {}
  const cls = type ? objectClass(type) : undefined
  const fields = type?.fields ?? NEW_FIELDS
  return {
    singular: type?.label_singular ?? '',
    plural: type?.label_plural ?? '',
    description: type?.description ?? '',
    icon: cls?.icon ?? 'box',
    tone: cls?.tone ?? 'teal',
    layout: ext.layout ?? 'prose',
    enforcement: type?.enforcement ?? 'warn',
    fields,
    hints: Object.fromEntries(
      fields.map((f) => [f.key, type ? displayHint(type, f.key) : undefined]),
    ),
    identifier: type?.label_identifier_field ?? 'name',
    cardFields: ext.cardFields,
  }
}

/** The one declaration the draft makes: of `base`, or of a new class. */
function inputOf(base: ObjectType | undefined, draft: Draft): ObjectTypeInput {
  const singular = draft.singular.trim()
  const start = base
    ? toInput(base)
    : newObjectType({
        labelSingular: singular || 'Object',
        labelPlural: draft.plural.trim() || `${singular || 'Object'}s`,
        description: draft.description,
      })
  let extensions: Record<string, unknown> = { ...start.extensions }
  const keys = new Set([
    ...(base?.fields ?? []).map((f) => f.key),
    ...draft.fields.map((f) => f.key),
  ])
  for (const key of keys)
    extensions = withDisplayHint(
      { extensions },
      key,
      draft.fields.some((f) => f.key === key) ? draft.hints[key] : undefined,
    )
  return {
    ...start,
    label_singular: singular || start.label_singular,
    label_plural: draft.plural.trim() || start.label_plural,
    description: draft.description.trim() || undefined,
    enforcement: draft.enforcement,
    label_identifier_field: draft.identifier,
    fields: draft.fields,
    extensions: withNotesExtension(
      { extensions },
      {
        icon: draft.icon,
        tone: draft.tone,
        layout: draft.layout,
        cardFields: draft.cardFields,
      },
    ),
  }
}

/** A class's editor, or a new class's (`classKey` "new"). */
export function ClassEditor({
  classKey,
  onCreated,
}: {
  classKey: string
  onCreated?: (id: string) => void
}) {
  const { registry, model } = useClassRegistry()
  const type =
    classKey === 'new' ? undefined : registry.byId.get(classKey)?.type
  // The declaration the draft was started from; a save names its anchor.
  const [base, setBase] = useState(type)
  const [draft, setDraft] = useState(() => draftOf(type))
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(base))
  if (type && !base) {
    setBase(type)
    setDraft(draftOf(type))
  } else if (
    type &&
    base &&
    type.content_anchor !== base.content_anchor &&
    !dirty
  ) {
    // Declared elsewhere while nothing here was changed: follow it.
    setBase(type)
    setDraft(draftOf(type))
  }
  const stale =
    !!type && !!base && type.content_anchor !== base.content_anchor && dirty
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const declare = useDeclareObjectType()
  const ask = useAskTheorem()
  const [field, setField] = useState<FieldSpec | 'new' | null>(null)
  const [confirmRemoval, setConfirmRemoval] = useState(false)

  const built = useMemo(() => {
    try {
      return { input: inputOf(base, draft) }
    } catch (problem) {
      return { problem }
    }
  }, [base, draft])
  const input = built.input
  const found = useMemo(
    () => (base && input ? incompatibilities(base, input) : []),
    [base, input],
  )
  const refused = refuses(found)
  const removing = found.some((f) => f.reason === 'removed')

  if (classKey !== 'new' && !type)
    return (
      <p role="status" className="p-8 text-sm text-ink-muted">
        {model.isPending ? 'Loading…' : 'This class is not in the register.'}
      </p>
    )

  const native = base ? objectClass(base).native : undefined
  // The register's own classes are read here, never re-declared.
  const locked = !!base?.system
  const settle = (declared: ObjectType) => {
    setBase(declared)
    setDraft(draftOf(declared))
    setConfirmRemoval(false)
  }
  const save = () => {
    if (!input || locked) return
    if (!base) {
      declare.mutate(
        { input },
        {
          onSuccess: (result) => {
            settle(result.object_type)
            onCreated?.(result.object_type.object_type_id)
          },
        },
      )
      return
    }
    if (refused || (removing && !confirmRemoval)) return
    declare.mutate(
      { input, anchor: base.content_anchor },
      { onSuccess: (result) => settle(result.object_type) },
    )
  }
  const error = built.problem ?? declare.error
  const preview = { icon: draft.icon, tone: draft.tone }
  const fields = draft.fields
  // The draft as a type, for the property form to edit against.
  const working: ObjectType | undefined = input && {
    object_type_id: base?.object_type_id ?? 'new',
    tenant_id: base?.tenant_id ?? '',
    content_anchor: base?.content_anchor ?? '',
    record_count: base?.record_count ?? 0,
    ...input,
  }
  const editField = (
    spec: FieldSpec,
    hint: DisplayHint | undefined,
    previous?: string,
  ) =>
    setDraft((d) => ({
      ...d,
      fields: previous
        ? d.fields.map((f) => (f.key === previous ? spec : f))
        : [...d.fields, spec],
      hints: { ...d.hints, [spec.key]: hint },
      identifier:
        previous && d.identifier === previous ? spec.key : d.identifier,
      cardFields:
        previous && previous !== spec.key
          ? d.cardFields?.map((k) => (k === previous ? spec.key : k))
          : d.cardFields,
    }))
  const removeField = (key: string) =>
    setDraft((d) => ({
      ...d,
      fields: d.fields.filter((f) => f.key !== key),
      cardFields: d.cardFields?.filter((k) => k !== key),
    }))
  const setRequired = (key: string, required: boolean) =>
    set({
      fields: draft.fields.map((f) => (f.key === key ? { ...f, required } : f)),
    })

  return (
    <div className="@container flex h-full min-h-0 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 pt-14 pb-24 @2xl:px-10 @3xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <header className="flex items-center gap-3">
            <ClassIcon cls={preview} size="lg" />
            <h1 className="min-w-0 flex-1 truncate font-heading text-3xl font-semibold tracking-tight">
              {draft.singular ||
                (base ? base.label_singular : 'New object class')}
            </h1>
            {base && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  openPane({
                    kind: 'library',
                    key: `class:${base.object_type_id}`,
                  })
                }
              >
                {base.record_count ?? 0} {draft.plural || base.label_plural}
              </Button>
            )}
          </header>

          {stale && (
            <div
              role="status"
              className="flex items-center gap-3 text-sm text-ink-muted"
            >
              <span className="flex-1">
                {base.label_singular} was changed elsewhere.
              </span>
              <Button size="xs" variant="ghost" onClick={() => settle(type)}>
                Load the latest
              </Button>
            </div>
          )}

          <fieldset disabled={locked} className="contents">
            <Group title="Name">
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="Singular">
                  <Input
                    autoFocus={!base}
                    value={draft.singular}
                    placeholder="Book"
                    onChange={(event) => set({ singular: event.target.value })}
                  />
                </Labeled>
                <Labeled label="Plural">
                  <Input
                    value={draft.plural}
                    placeholder={
                      draft.singular ? `${draft.singular}s` : 'Books'
                    }
                    onChange={(event) => set({ plural: event.target.value })}
                  />
                </Labeled>
              </div>
              <Labeled label="Description">
                <Textarea
                  rows={2}
                  value={draft.description}
                  onChange={(event) => set({ description: event.target.value })}
                />
              </Labeled>
            </Group>

            <Group title="Icon and colour">
              <div
                role="radiogroup"
                aria-label="Icon"
                className="grid grid-cols-[repeat(auto-fill,2rem)] gap-1"
              >
                {Object.keys(CLASS_ICONS).map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={draft.icon === name}
                    aria-label={name}
                    onClick={() => set({ icon: name })}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md text-ink-muted outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus',
                      draft.icon === name && 'bg-pill text-ink shadow-pill',
                    )}
                  >
                    <ClassGlyph icon={name} className="size-4" />
                  </button>
                ))}
              </div>
              <div
                role="radiogroup"
                aria-label="Colour"
                className="flex gap-1.5"
              >
                {CLASS_TONES.map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    role="radio"
                    aria-checked={draft.tone === tone}
                    aria-label={tone}
                    onClick={() => set({ tone })}
                    className={cn(
                      'size-7 rounded-full outline-none ring-offset-2 ring-offset-(--notes-pane) focus-visible:outline-2 focus-visible:outline-focus',
                      TONE_TILE[tone],
                      draft.tone === tone && 'ring-2 ring-ink',
                    )}
                  />
                ))}
              </div>
            </Group>

            {working && (
              <Group
                title="Properties"
                action={
                  !native &&
                  !locked && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setField('new')}
                    >
                      <Icon.Add aria-hidden className="size-3.5" />
                      Add property
                    </Button>
                  )
                }
              >
                <ol className="flex flex-col">
                  {fields.map((f, index) => {
                    const identifier = f.key === draft.identifier
                    return (
                      <li
                        key={f.key}
                        className="group flex h-9 items-center gap-2 rounded-md px-2 hover:bg-hover"
                      >
                        <FieldTypeIcon kind={f.field_type.kind} />
                        <button
                          type="button"
                          disabled={!!native || locked}
                          onClick={() => setField(f)}
                          className="min-w-0 flex-1 truncate text-start text-sm outline-none focus-visible:underline"
                        >
                          {f.label}
                          <span className="ms-2 text-xs text-ink-faint">
                            {KIND[f.field_type.kind].label}
                          </span>
                        </button>
                        {!identifier && !native && (
                          <>
                            <label className="flex items-center gap-1 text-xs text-ink-muted">
                              <input
                                type="checkbox"
                                checked={f.required}
                                onChange={(event) =>
                                  setRequired(f.key, event.target.checked)
                                }
                              />
                              Required
                            </label>
                            <label className="flex items-center gap-1 text-xs text-ink-muted">
                              <input
                                type="checkbox"
                                checked={(draft.cardFields ?? []).includes(
                                  f.key,
                                )}
                                onChange={(event) => {
                                  const current = draft.cardFields ?? []
                                  set({
                                    cardFields: event.target.checked
                                      ? [...current, f.key]
                                      : current.filter((k) => k !== f.key),
                                  })
                                }}
                              />
                              On cards
                            </label>
                            <IconButton
                              label={`Move ${f.label} up`}
                              disabled={index === 0}
                              onClick={() =>
                                set({ fields: move(draft.fields, f.key, -1) })
                              }
                            >
                              <Icon.ArrowUp className="size-3.5" />
                            </IconButton>
                            <IconButton
                              label={`Move ${f.label} down`}
                              disabled={index === fields.length - 1}
                              onClick={() =>
                                set({ fields: move(draft.fields, f.key, 1) })
                              }
                            >
                              <Icon.ArrowDown className="size-3.5" />
                            </IconButton>
                            <IconButton
                              label={`Remove ${f.label}`}
                              onClick={() => removeField(f.key)}
                            >
                              <Icon.Close className="size-3.5" />
                            </IconButton>
                          </>
                        )}
                      </li>
                    )
                  })}
                </ol>
                {base?.fields.some(
                  (f) => !draft.fields.some((d) => d.key === f.key),
                ) && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="self-start"
                    onClick={() =>
                      set({
                        fields: [
                          ...draft.fields,
                          ...base.fields.filter(
                            (f) => !draft.fields.some((d) => d.key === f.key),
                          ),
                        ],
                      })
                    }
                  >
                    Keep removed properties
                  </Button>
                )}
              </Group>
            )}

            <Group title="Advanced">
              <Labeled label="When an object does not match">
                <Segmented
                  label="Enforcement"
                  value={draft.enforcement}
                  onChange={(enforcement) => set({ enforcement })}
                  options={[
                    { value: 'observe', label: 'Record it' },
                    { value: 'warn', label: 'Flag it' },
                    { value: 'reject', label: 'Refuse it' },
                  ]}
                />
              </Labeled>
              <Labeled label="Page layout">
                <Segmented
                  label="Page layout"
                  value={draft.layout}
                  onChange={(layout) => set({ layout })}
                  options={[
                    { value: 'prose', label: 'Reading column' },
                    { value: 'wide', label: 'Full width' },
                  ]}
                />
              </Labeled>
              {input && (
                <details className="text-sm">
                  <summary className="cursor-default text-ink-muted">
                    Declaration
                  </summary>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-frame p-3 text-xs">
                    {JSON.stringify(input, null, 2)}
                  </pre>
                </details>
              )}
            </Group>

            {found.length > 0 && (
              <div
                role={refused ? 'alert' : 'status'}
                className="flex flex-col gap-1.5 rounded-lg border border-separator p-3 text-sm"
              >
                {found.map((f) => (
                  <p
                    key={`${f.field}:${f.reason}`}
                    className={
                      f.reason === 'removed'
                        ? 'text-ink-muted'
                        : 'text-error-ink'
                    }
                  >
                    {f.message}
                  </p>
                ))}
                {removing && !refused && (
                  <label className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      checked={confirmRemoval}
                      onChange={(event) =>
                        setConfirmRemoval(event.target.checked)
                      }
                    />
                    Remove them
                  </label>
                )}
              </div>
            )}
            {error != null && (
              <p role="alert" className="text-sm wrap-anywhere text-error-ink">
                {error instanceof SchemaConflictError || error instanceof Error
                  ? error.message
                  : describeError(error)}
              </p>
            )}
          </fieldset>

          {!locked && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={save}
                disabled={
                  declare.isPending ||
                  !input ||
                  (!base && !draft.singular.trim()) ||
                  (!!base &&
                    (!dirty || refused || (removing && !confirmRemoval)))
                }
              >
                {declare.isPending
                  ? 'Saving…'
                  : base
                    ? 'Save class'
                    : 'Create class'}
              </Button>
              {base && dirty && (
                <Button variant="ghost" onClick={() => setDraft(draftOf(base))}>
                  Discard changes
                </Button>
              )}
              {!base && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    ask(
                      `Declare a new object class in my schema register${
                        draft.singular.trim()
                          ? ` called ${draft.singular.trim()}`
                          : ''
                      }${draft.description.trim() ? `: ${draft.description.trim()}` : ''}. Propose its properties, then declare it.`,
                      [],
                    )
                  }
                >
                  <Icon.Sparkle aria-hidden className="size-4" />
                  Describe it to Theorem
                </Button>
              )}
            </div>
          )}
        </div>

        <aside aria-label="Preview" className="flex flex-col gap-3">
          <h2 className="text-xs font-medium text-ink-faint">Preview</h2>
          <div className="flex flex-col gap-2">
            <div className="flex aspect-[4/3] flex-col gap-2 rounded-lg border border-separator bg-(--notes-pane) p-3.5 shadow-sm">
              <ClassIcon cls={preview} size="md" />
              {fields
                .filter(
                  (f) =>
                    f.key !== draft.identifier &&
                    (draft.cardFields ?? []).includes(f.key),
                )
                .slice(0, 3)
                .map((f) => (
                  <div key={f.key} className="flex flex-col text-xs">
                    <span className="text-ink-faint">{f.label}</span>
                    <span className="h-2 w-2/3 rounded-full bg-pill" />
                  </div>
                ))}
            </div>
            <p className="truncate px-0.5 text-sm font-medium">
              {draft.singular.trim()
                ? `A ${draft.singular.trim().toLowerCase()}`
                : 'An object'}
            </p>
            <p className="flex items-center gap-1.5 px-0.5 text-xs text-ink-faint">
              <ClassIcon cls={preview} className="size-3.5 [&_svg]:size-2.5" />
              {draft.singular || 'Class'}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
            <ClassIcon cls={preview} />
            {draft.plural ||
              (draft.singular ? `${draft.singular}s` : 'Objects')}
          </div>
        </aside>
      </div>
      {working && model.data && field && (
        <FieldDialog
          open
          onOpenChange={(open) => !open && setField(null)}
          objectType={working}
          model={model.data}
          field={field === 'new' ? undefined : field}
          initial={
            field === 'new' && (base?.record_count ?? 0) > 0 ? {} : undefined
          }
          draft={{ save: editField, remove: removeField }}
        />
      )}
    </div>
  )
}

const move = (order: FieldSpec[], key: string, by: -1 | 1) => {
  const next = [...order]
  const at = next.findIndex((f) => f.key === key)
  const to = at + by
  if (at < 0 || to < 0 || to >= next.length) return order
  ;[next[at], next[to]] = [next[to]!, next[at]!]
  return next
}

const Group = ({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-center">
      <h2 className="flex-1 text-sm font-medium">{title}</h2>
      {action}
    </div>
    {children}
  </section>
)

const Labeled = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-ink-muted">{label}</span>
    {children}
  </label>
)

const IconButton = ({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className="flex size-6 items-center justify-center rounded text-ink-faint opacity-0 outline-none group-hover:opacity-100 hover:bg-hover hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-30"
  >
    {children}
  </button>
)
