// SOURCING: the Index's views and the records' data model (@tanstack/react-
// query hooks in components/index/queries and components/records/queries),
// the vault's file tree (useWorkspaceTree), the shell's open conversation.
// A setting that names something in Theorem picks it from what is there.
import { useMemo } from 'react'
import { ATLAS_VIEW_ID, DATA_MODEL_VIEW_ID } from '@/components/index/programs'
import { useViews } from '@/components/index/queries'
import { activeObjectTypes, useDataModel } from '@/components/records/queries'
import { useShell } from '@/components/shell/shell-state'
import { Button } from '@/components/ui/button'
import type { ResourceKind } from '@/lib/modules/contract'
import { useVaultClient } from '@/lib/modules/store'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { useWorkspaceTree } from '@/lib/workspace/workspaces'

export const fieldControl =
  'h-7 w-full min-w-0 rounded-md border border-separator bg-artifact px-1.5 text-xs text-ink outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

interface FieldProps {
  label: string
  value: string
  onChange: (value: string) => void
}

export function ResourceField({
  kind,
  ...props
}: FieldProps & { kind: ResourceKind }) {
  switch (kind) {
    case 'index-view':
      return <IndexViewField {...props} />
    case 'object-type':
      return <ObjectTypeField {...props} />
    case 'file':
      return <FileField {...props} />
    case 'conversation':
      return <ConversationField {...props} />
    case 'app':
      return (
        <input
          aria-label={props.label}
          className={fieldControl}
          placeholder="The App's document id"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value.trim())}
        />
      )
  }
}

function IndexViewField({ label, value, onChange }: FieldProps) {
  const views = useViews({ kind: 'home' })
  const options = [
    { value: '', label: 'Home' },
    { value: ATLAS_VIEW_ID, label: 'Atlas' },
    { value: DATA_MODEL_VIEW_ID, label: 'Data model' },
    ...(views.data ?? []).map((view) => ({
      value: view.viewId,
      label: view.current.title,
    })),
  ]
  return (
    <select
      aria-label={label}
      className={fieldControl}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {value && !options.some((o) => o.value === value) && (
        <option value={value}>{value}</option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function ObjectTypeField({ label, value, onChange }: FieldProps) {
  const model = useDataModel()
  const types = activeObjectTypes(model.data)
  return (
    <select
      aria-label={label}
      className={fieldControl}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">
        {model.isPending ? 'Reading the schema…' : 'Choose an object'}
      </option>
      {value && !types.some((t) => t.name_singular === value) && (
        <option value={value}>{value}</option>
      )}
      {types.map((type) => (
        <option key={type.name_singular} value={type.name_singular}>
          {type.label_plural}
        </option>
      ))}
    </select>
  )
}

function FileField(props: FieldProps) {
  const { client } = useVaultClient()
  if (!client)
    return (
      <input
        aria-label={props.label}
        className={fieldControl}
        placeholder="A path in the vault"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    )
  return <VaultFileField client={client} {...props} />
}

function VaultFileField({
  client,
  label,
  value,
  onChange,
}: FieldProps & { client: WorkspaceClient }) {
  const tree = useWorkspaceTree(client)
  const paths = useMemo(
    () =>
      (tree.data ?? [])
        .filter((entry) => entry.kind === 'file')
        .map((entry) => entry.path)
        .sort(),
    [tree.data],
  )
  const list = `vault-files-${label.replace(/\W+/g, '-')}`
  return (
    <>
      <input
        aria-label={label}
        className={fieldControl}
        list={list}
        placeholder="A path in the vault"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={list}>
        {paths.map((path) => (
          <option key={path} value={path} />
        ))}
      </datalist>
    </>
  )
}

function ConversationField({ value, onChange }: FieldProps) {
  const open = useShell((s) => s.chatThreadId)
  return (
    <div className="flex flex-col gap-1.5 text-xs text-ink-muted">
      <p>
        {value
          ? `Always shows conversation ${value.slice(0, 12)}…`
          : 'Shows the conversation that is open.'}
      </p>
      <div className="flex gap-1">
        {open && open !== value && (
          <Button variant="outline" size="xs" onClick={() => onChange(open)}>
            Keep the open one
          </Button>
        )}
        {value && (
          <Button variant="ghost" size="xs" onClick={() => onChange('')}>
            Follow the open one
          </Button>
        )}
      </div>
    </div>
  )
}
