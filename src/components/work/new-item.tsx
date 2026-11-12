// SOURCING: the app's Dialog, Input and Textarea with coss ui Select for the single-valued fields, and ./pickers' OptionPicker (a Command list in a popover) for labels and assignees; creation goes through ./queries
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Input } from '@/components/coss/input'
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/coss/select'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { describeError } from '@/lib/theorem/client'
import { PRIORITIES, PRIORITY_LABEL } from './grouping'
import { OptionPicker } from './pickers'
import { useCreateWorkItem, useWorkFacets } from './queries'
import { useWorkTracker } from './settings'
import { useWorkSource } from './source'
import type { Option } from './edits'
import type { NewWorkItem, WorkItem, WorkItemKind, WorkPriority } from './contract'

const LOCAL = 'local'
const DEFAULT = 'default'
const NONE = 'none'

/** What the dialog starts with, when the place it opens from implies some of it. */
export type NewItemDefaults = Pick<
  NewWorkItem,
  'kind' | 'statusId' | 'priority' | 'projectId' | 'labels' | 'assignees'
>

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-muted">{label}</span>
      {children}
    </div>
  )
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
}) {
  return (
    <Row label={label}>
      <Select
        value={value}
        items={options}
        onValueChange={(next) => next && onChange(next)}
      >
        <SelectTrigger aria-label={label} size="sm" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </Row>
  )
}

function Multi({
  label,
  options,
  chosen,
  onToggle,
}: {
  label: string
  options: Option[]
  chosen: string[]
  onToggle: (value: string) => void
}) {
  const [anchor, setAnchor] = useState<Element | null>(null)
  const names = options.filter((o) => chosen.includes(o.value)).map((o) => o.label)
  return (
    <Row label={label}>
      <Button
        size="sm"
        variant="outline"
        className="w-44 justify-start"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <span className="truncate">{names.length ? names.join(', ') : 'None'}</span>
      </Button>
      <OptionPicker
        anchor={anchor}
        onClose={() => setAnchor(null)}
        options={options}
        chosen={chosen}
        multiple
        placeholder={`${label}...`}
        onChoose={(value) => value && onToggle(value)}
      />
    </Row>
  )
}

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

/** The form for a new item: local, or created in a tracked GitHub repository. */
export function NewItemDialog({
  open,
  onOpenChange,
  defaults,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaults?: NewItemDefaults
  onCreated?: (item: WorkItem) => void
}) {
  const facets = useWorkFacets().data
  const tracker = useWorkTracker()
  const create = useCreateWorkItem()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<WorkItemKind>(defaults?.kind ?? 'issue')
  const [statusId, setStatusId] = useState(defaults?.statusId ?? DEFAULT)
  const [priority, setPriority] = useState<WorkPriority>(defaults?.priority ?? 0)
  const [projectId, setProjectId] = useState(defaults?.projectId ?? NONE)
  const [labels, setLabels] = useState(defaults?.labels ?? [])
  const [assignees, setAssignees] = useState(defaults?.assignees ?? [])
  const [where, setWhere] = useState(LOCAL)

  const repos =
    tracker.state === 'on' && tracker.github ? tracker.settings.github.repos : []

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    const input: NewWorkItem = {
      title: title.trim(),
      kind,
      priority,
      ...(body.trim() && { bodyMarkdown: body }),
      ...(statusId !== DEFAULT && { statusId }),
      ...(projectId !== NONE && { projectId }),
      ...(labels.length && { labels }),
      ...(assignees.length && { assignees }),
      ...(where !== LOCAL && { target: { provider: 'github' as const, repo: where } }),
    }
    create.mutate(input, {
      onSuccess: (item) => {
        onOpenChange(false)
        onCreated?.(item)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>New item</DialogTitle>
            <DialogDescription className="sr-only">
              Create an issue or task, here or in a tracked repository.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Title"
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Textarea
            aria-label="Description"
            placeholder="Add a description (Markdown)"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-24"
          />
          <div className="flex flex-col gap-2">
            <Choice
              label="Type"
              value={kind}
              options={[
                { value: 'issue', label: 'Issue' },
                { value: 'task', label: 'Task' },
              ]}
              onChange={(next) => setKind(next as WorkItemKind)}
            />
            <Choice
              label="Status"
              value={statusId}
              options={[
                { value: DEFAULT, label: 'Default' },
                ...(facets?.statuses ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                })),
              ]}
              onChange={setStatusId}
            />
            <Choice
              label="Priority"
              value={String(priority)}
              options={PRIORITIES.map((p) => ({
                value: String(p),
                label: PRIORITY_LABEL[p],
              }))}
              onChange={(next) => setPriority(Number(next) as WorkPriority)}
            />
            <Choice
              label="Project"
              value={projectId}
              options={[
                { value: NONE, label: 'No project' },
                ...(facets?.projects ?? []).map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              ]}
              onChange={setProjectId}
            />
            <Multi
              label="Labels"
              options={(facets?.labels ?? []).map((l) => ({
                value: l.id,
                label: l.name,
              }))}
              chosen={labels}
              onToggle={(value) => setLabels((held) => toggle(held, value))}
            />
            <Multi
              label="Assignees"
              options={(facets?.assignees ?? []).map((a) => ({
                value: a.id,
                label: a.name ?? a.login ?? a.id,
              }))}
              chosen={assignees}
              onToggle={(value) => setAssignees((held) => toggle(held, value))}
            />
            {repos.length > 0 && (
              <Choice
                label="Where"
                value={where}
                options={[
                  { value: LOCAL, label: 'Local only' },
                  ...repos.map((repo) => ({ value: repo, label: repo })),
                ]}
                onChange={setWhere}
              />
            )}
          </div>
          {create.isError && (
            <p role="alert" className="text-sm text-error-ink">
              {describeError(create.error)}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              Create item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A new-item dialog and the way to open it, for whoever owns a button or a
 * shortcut. `available` is false when the source cannot create, so the
 * control is not offered at all.
 */
export function useNewItem(
  defaults?: NewItemDefaults,
  onCreated?: (item: WorkItem) => void,
) {
  const [open, setOpen] = useState(false)
  const source = useWorkSource()
  const available = !!source.createItem
  return {
    available,
    show: () => setOpen(true),
    dialog: available ? (
      <NewItemDialog
        // Remounted per opening, so a defaulted field starts from this place.
        key={String(open)}
        open={open}
        onOpenChange={setOpen}
        defaults={defaults}
        onCreated={onCreated}
      />
    ) : null,
  }
}

/** A button that opens the dialog, for toolbars. */
export function NewItemButton({
  defaults,
  onCreated,
  children = 'New',
}: {
  defaults?: NewItemDefaults
  onCreated?: (item: WorkItem) => void
  children?: ReactNode
}) {
  const { available, show, dialog } = useNewItem(defaults, onCreated)
  if (!available) return null
  return (
    <>
      <Button size="sm" onClick={show}>
        <Icon.Add />
        {children}
      </Button>
      {dialog}
    </>
  )
}
