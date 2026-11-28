// SOURCING: Twenty's record page for the anatomy (a 300 px property column beside tabbed content); coss ui Tabs; the pieces shared with the preview (./record-fields); the change log Theorem keeps for every record (recordChanges) for the Timeline; the relation fields of the schema register for Related. Two tabs only: Theorem has no tasks, notes or files on a record to fill others with
import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/coss/tabs'
import type { ObjectType } from '@/components/records/contract'
import { Button } from '@/components/ui/button'
import { RecordAccessError, RecordMissingError } from './api'
import type { CrmRecord, RecordChange } from './api'
import { RecordChip } from './cells'
import { useCrmScope } from './context'
import {
  accessFor,
  actorName,
  changeLines,
  relatedGroups,
  revisionStep,
} from './model'
import { DocumentsAbout } from './documents-about'
import { OftenOpenedWith } from './often-opened-with'
import { originText } from './proposal'
import { useCrmNavigate } from './navigation'
import { useCrmRecord, useCrmWrites, useRecordChanges } from './queries'
import {
  AskTheoremButton,
  DeleteControl,
  PrivateToggle,
  PropertyList,
  ReadOnlyNote,
  RecordHeading,
  RevisionLine,
  SelfControl,
  UnsavedEdits,
  crmErrorText,
} from './record-fields'
import { TypeIcon } from './type-icons'

/** Spec width of the record page's property column. */
export const PROPERTY_COLUMN = 300

const WHEN = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** One record in full: its properties, what changed, and what it is tied to. */
export function RecordPage({
  type,
  recordId,
}: {
  type: ObjectType
  recordId: string
}) {
  const { life } = useCrmScope()
  const access = accessFor(life, type)
  const { openType } = useCrmNavigate()
  const query = useCrmRecord(access.read ? type : undefined, recordId)
  const back = (
    <Button size="xs" variant="ghost" onClick={() => void openType(type)}>
      <ChevronLeft aria-hidden />
      {type.label_plural}
    </Button>
  )

  const state = (title: string, detail: string, retry = false) => (
    <section className="flex h-full min-w-0 flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center border-b border-separator px-2">
        {back}
      </header>
      <div
        role={retry ? 'alert' : 'status'}
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
      >
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="max-w-sm text-xs leading-5 text-ink-muted">{detail}</p>
        {retry && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        )}
      </div>
    </section>
  )

  if (!access.read || query.error instanceof RecordAccessError)
    return state(
      `${type.label_plural} are not available to this sign-in.`,
      'This record may exist; this sign-in is not allowed to read it.',
    )
  if (query.data)
    return (
      <LoadedRecord
        key={query.data.id}
        type={type}
        record={query.data}
        writable={access.write}
      />
    )
  if (query.error instanceof RecordMissingError)
    return state(
      `This ${type.label_singular.toLowerCase()} is not here.`,
      'It may have been deleted, or the link may be to a record in another workspace.',
    )
  if (query.isError)
    return state(
      `This ${type.label_singular.toLowerCase()} could not be loaded.`,
      crmErrorText(query.error, type),
      true,
    )
  return state(`Loading ${type.label_singular.toLowerCase()}`, '')
}

function LoadedRecord({
  type,
  record,
  writable,
}: {
  type: ObjectType
  record: CrmRecord
  writable: boolean
}) {
  const { openType, openRecord } = useCrmNavigate()
  const writes = useCrmWrites(type)
  const [tab, setTab] = useState('timeline')
  return (
    <section
      aria-label={type.label_singular}
      className="flex h-full min-w-0 flex-col bg-background"
    >
      <header
        data-crm-region="page-header"
        className="flex h-11 shrink-0 items-center gap-2 border-b border-separator ps-2 pe-3"
      >
        <Button size="xs" variant="ghost" onClick={() => void openType(type)}>
          <ChevronLeft aria-hidden />
          <TypeIcon type={type} className="text-ink-muted" />
          {type.label_plural}
        </Button>
        <span className="flex-1" />
        <AskTheoremButton type={type} record={record} />
        <DeleteControl
          type={type}
          record={record}
          writes={writes}
          writable={writable}
          onDeleted={() => void openType(type, { replace: true })}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Properties: 300 px */}
        <div
          data-crm-region="property-column"
          className="flex shrink-0 flex-col overflow-y-auto border-e border-separator"
          style={{ width: PROPERTY_COLUMN }}
        >
          <div className="flex flex-col gap-1 px-4 pt-4 pb-3">
            <RecordHeading
              type={type}
              record={record}
              writes={writes}
              writable={writable}
              size="page"
            />
            <RevisionLine record={record} />
            {!writable && <ReadOnlyNote type={type} />}
          </div>
          <UnsavedEdits
            type={type}
            recordId={record.id}
            recordOf={(id) => (id === record.id ? record : undefined)}
            writes={writes}
          />
          <div className="px-2 pb-2">
            <PropertyList
              type={type}
              record={record}
              writes={writes}
              writable={writable}
              whole
              onOpenRelated={(target, id) => void openRecord(target, id)}
            />
          </div>
          <DocumentsAbout type={type} recordId={record.id} />
          <OftenOpenedWith type={type} recordId={record.id} />
          <div className="flex flex-col gap-4 border-t border-separator px-4 py-4">
            <PrivateToggle
              type={type}
              record={record}
              writes={writes}
              writable={writable}
            />
            <SelfControl type={type} record={record} />
          </div>
        </div>

        {/* Timeline and Related */}
        <Tabs
          value={tab}
          onValueChange={(next) => setTab(String(next))}
          className="min-w-0 flex-1 gap-0"
        >
          <div
            data-crm-region="view-bar"
            className="flex h-10 shrink-0 items-center border-b border-separator px-3"
          >
            <TabsList variant="underline">
              <TabsTab value="timeline">Timeline</TabsTab>
              <TabsTab value="related">Related</TabsTab>
            </TabsList>
          </div>
          <TabsPanel value="timeline" className="min-h-0 overflow-y-auto">
            <Timeline type={type} record={record} />
          </TabsPanel>
          <TabsPanel value="related" className="min-h-0 overflow-y-auto">
            <Related type={type} record={record} />
          </TabsPanel>
        </Tabs>
      </div>
    </section>
  )
}

// Timeline

const VERB: Record<RecordChange['kind'], string> = {
  created: 'added this',
  updated: 'changed this',
  deleted: 'deleted this',
}

function Timeline({ type, record }: { type: ObjectType; record: CrmRecord }) {
  const { titleOf, life } = useCrmScope()
  const changes = useRecordChanges(record.id)
  if (changes.isPending)
    return (
      <p role="status" className="px-4 py-4 text-[13px] text-ink-muted">
        Loading changes
      </p>
    )
  if (changes.isError)
    return (
      <div
        role="alert"
        className="flex items-center gap-2 px-4 py-4 text-[13px] text-ink"
      >
        <span>
          The changes could not be loaded. {crmErrorText(changes.error, type)}
        </span>
        <Button
          size="xs"
          variant="outline"
          onClick={() => void changes.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  const list = changes.data
  if (!list.length)
    return (
      <p className="px-4 py-4 text-[13px] text-ink-muted">
        No changes are recorded for this {type.label_singular.toLowerCase()}.
      </p>
    )
  return (
    <ol aria-label="Changes, newest first" className="flex flex-col px-4 py-3">
      {list.map((change) => {
        const lines =
          change.kind === 'updated'
            ? changeLines(change, type, titleOf, life?.actor)
            : []
        const step = revisionStep(change)
        return (
          <li
            key={change.id}
            className="relative flex gap-3 pb-4 ps-4 before:absolute before:top-1.5 before:left-0 before:size-1.5 before:rounded-full before:bg-ink-faint after:absolute after:top-4 after:bottom-0 after:left-[2.5px] after:w-px after:bg-separator last:after:hidden"
          >
            <div className="min-w-0 flex-1">
              {lines.length ? (
                lines.map((line) => (
                  <p
                    key={line.fieldKey}
                    className="text-[13px] leading-5 text-ink"
                  >
                    {line.text}
                  </p>
                ))
              ) : (
                <p className="text-[13px] leading-5 text-ink">
                  {actorName(change.actor, life?.actor)} {VERB[change.kind]}
                </p>
              )}
              {change.origin && (
                <p className="text-xs leading-5 text-ink-muted">
                  {originText(change.origin)}{' '}
                  <Link
                    to="/c/$threadId"
                    params={{ threadId: change.origin.threadId }}
                    className="rounded-sm font-medium text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    See the conversation
                  </Link>
                </p>
              )}
              <p className="text-xs leading-5 text-ink-muted tabular-nums">
                <time dateTime={new Date(change.atMs).toISOString()}>
                  {WHEN.format(change.atMs)}
                </time>
                {step && ` · ${step}`}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// Related

function Related({ type, record }: { type: ObjectType; record: CrmRecord }) {
  const { model, recordsOf, statusOf, types } = useCrmScope()
  const { openRecord } = useCrmNavigate()
  const groups = relatedGroups(model, type, record, recordsOf)
  // A type that cannot be read may hold records pointing here; say so.
  const unread = types.filter(
    (other) =>
      statusOf(other) !== 'ready' &&
      other.fields.some(
        (field) =>
          field.field_type.kind === 'relation' &&
          [type.object_type_id, type.node_label, type.name_singular].includes(
            field.field_type.target_object_type_id,
          ),
      ),
  )
  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      {groups.length === 0 && unread.length === 0 && (
        <p className="text-[13px] text-ink-muted">
          Nothing is tied to this {type.label_singular.toLowerCase()} yet.
        </p>
      )}
      {groups.map((group) => (
        <section
          key={`${group.direction}:${group.type.object_type_id}:${group.field.key}`}
          aria-label={`${group.type.label_plural}, ${group.field.label}`}
        >
          <h3 className="flex items-center gap-1.5 pb-1.5 text-xs text-ink-muted">
            <TypeIcon type={group.type} className="size-3.5" />
            <span className="font-medium text-ink">
              {group.type.label_plural}
            </span>
            <span>
              {group.direction === 'from'
                ? `· ${group.field.label}`
                : `· as ${group.field.label.toLowerCase()}`}
            </span>
            <span className="tabular-nums">· {group.entries.length}</span>
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                {entry.record ? (
                  <RecordChip
                    type={group.type}
                    record={entry.record}
                    variant="soft"
                    onOpen={() => void openRecord(group.type, entry.id)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => void openRecord(group.type, entry.id)}
                    className="rounded-sm px-1 text-xs text-ink-muted underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    {statusOf(group.type) === 'denied'
                      ? `A ${group.type.label_singular.toLowerCase()} this sign-in cannot read`
                      : entry.id}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {unread.map((other) => (
        <p
          key={other.object_type_id}
          className="text-xs leading-5 text-ink-muted"
        >
          {statusOf(other) === 'denied'
            ? `${other.label_plural} tied to this record are not shown: this sign-in cannot read them.`
            : statusOf(other) === 'failed'
              ? `${other.label_plural} could not be loaded, so any tied to this record are not shown.`
              : `Loading ${other.label_plural.toLowerCase()}`}
        </p>
      ))}
    </div>
  )
}
