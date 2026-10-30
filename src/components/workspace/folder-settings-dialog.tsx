// SOURCING: ui/dialog, ui/input and ui/button laid out as sidebar.tsx's
// new-project form; Base UI RadioGroup and Radio (where attachments go, the
// four choices Obsidian offers); useFolderSettings and useSaveFolderSettings
// (react-query over the settings route); zustand (which folder's settings are
// open).
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type {
  FolderSettings,
  WorkspaceClient,
  WorkspaceId,
} from '@/lib/workspace/types'
import {
  useFolderSettings,
  useSaveFolderSettings,
  useWorkspaceClient,
} from '@/lib/workspace/workspaces'

const useFolderSettingsDialog = create<{ workspaceId: WorkspaceId | null }>()(
  () => ({ workspaceId: null }),
)

export const openFolderSettings = (workspaceId: WorkspaceId) =>
  useFolderSettingsDialog.setState({ workspaceId })

const close = () => useFolderSettingsDialog.setState({ workspaceId: null })

type Place = 'root' | 'folder' | 'beside' | 'subfolder'

const PLACES: Array<{ value: Place; label: string }> = [
  { value: 'root', label: 'The top of the folder' },
  { value: 'folder', label: 'A folder of its own' },
  { value: 'beside', label: 'Beside the note' },
  { value: 'subfolder', label: 'A folder beside the note' },
]

/** The `attachments` setting as a choice and a folder name. */
function placeOf(setting: string): { place: Place; name: string } {
  const value = setting.trim()
  if (value === '' || value === '/') return { place: 'root', name: '' }
  if (value === '.' || value === './') return { place: 'beside', name: '' }
  if (value.startsWith('./'))
    return { place: 'subfolder', name: value.slice(2) }
  return { place: 'folder', name: value }
}

function settingOf(place: Place, name: string): string {
  const folder = name.trim().replace(/^\.?\/+|\/+$/g, '')
  switch (place) {
    case 'root':
      return '/'
    case 'beside':
      return './'
    case 'subfolder':
      return `./${folder || 'attachments'}`
    case 'folder':
      return folder || '/'
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  )
}

function SettingsForm({
  client,
  settings,
}: {
  client: WorkspaceClient
  settings: FolderSettings
}) {
  const save = useSaveFolderSettings(client)
  const initial = placeOf(settings.attachments)
  const [place, setPlace] = useState(initial.place)
  const [name, setName] = useState(initial.name)
  const [dailyFolder, setDailyFolder] = useState(settings.dailyNotes.folder)
  const [template, setTemplate] = useState(settings.dailyNotes.template)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate(
      {
        attachments: settingOf(place, name),
        dailyNotes: { folder: dailyFolder.trim(), template: template.trim() },
      },
      { onSuccess: close },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle className="font-heading text-lg font-normal tracking-tight">
          {client.workspace.name} settings
        </DialogTitle>
        <DialogDescription>
          {client.theorem
            ? 'Kept in Theorem with the vault, so every device has them.'
            : 'Kept in the folder, in .theorem/settings.json, so they travel with it.'}
        </DialogDescription>
      </DialogHeader>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          New attachments go in
        </legend>
        <RadioGroup
          value={place}
          onValueChange={(value) => setPlace(value)}
          className="flex flex-col gap-1.5"
        >
          {PLACES.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <Radio.Root
                value={value}
                className="flex size-4 items-center justify-center rounded-full border border-control outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-checked:border-redwood"
              >
                <Radio.Indicator className="size-2 rounded-full bg-redwood" />
              </Radio.Root>
              {label}
            </label>
          ))}
        </RadioGroup>
        {(place === 'folder' || place === 'subfolder') && (
          <Input
            aria-label={place === 'folder' ? 'Folder' : 'Folder name'}
            placeholder={place === 'folder' ? 'Attachments' : 'attachments'}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </fieldset>

      <Field label="Daily notes folder" hint="Empty for the top of the folder.">
        <Input
          placeholder="Journal"
          value={dailyFolder}
          onChange={(event) => setDailyFolder(event.target.value)}
        />
      </Field>
      <Field
        label="Daily note template"
        hint="A note whose {{date}}, {{time}} and {{title}} are filled in."
      >
        <Input
          placeholder="Templates/Daily"
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
        />
      </Field>

      {save.error && (
        <p role="alert" className="text-sm text-error-ink">
          These settings could not be saved.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={save.isPending}
          className="bg-redwood text-on-redwood hover:bg-redwood-hover"
        >
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

function SettingsBody({ workspaceId }: { workspaceId: WorkspaceId }) {
  const client = useWorkspaceClient(workspaceId)
  if (!client)
    return <p className="text-sm text-ink-muted">This folder is not open.</p>
  return <LoadedSettings client={client} />
}

function LoadedSettings({ client }: { client: WorkspaceClient }) {
  const settings = useFolderSettings(client)
  if (settings.isError)
    return (
      <p className="text-sm text-ink-muted">
        This folder's settings could not be read.
      </p>
    )
  if (!settings.data) return <p className="text-sm text-ink-muted">Loading…</p>
  return <SettingsForm client={client} settings={settings.data} />
}

/** A folder's own settings: where attachments go, and its daily notes. */
export function FolderSettingsDialog() {
  const workspaceId = useFolderSettingsDialog((s) => s.workspaceId)
  return (
    <Dialog
      open={workspaceId !== null}
      onOpenChange={(open) => !open && close()}
    >
      <DialogContent className="sm:max-w-md">
        {workspaceId && (
          <SettingsBody key={workspaceId} workspaceId={workspaceId} />
        )}
      </DialogContent>
    </Dialog>
  )
}
