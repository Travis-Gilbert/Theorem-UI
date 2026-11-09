// SOURCING: coss ui Tabs, Input, Badge, Empty; the settings frame (Twenty's import page: pick a source, then a list of past imports with their state); lib/theorem/imports (Theorem runs RustyRed's extraction and indexes the result into the project)
import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Badge } from '@/components/coss/badge'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/coss/empty'
import { Input } from '@/components/coss/input'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/coss/tabs'
import { Icon } from '@/components/icons'
import {
  SettingsBox,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { useActiveProject } from '@/components/shell/projects'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { describeError } from '@/lib/theorem/client'
import { isRunning, useImportMutations, useImports } from '@/lib/theorem/imports'
import type { ImportRecord, ImportStatus } from '@/lib/theorem/imports'
import { isNotServed } from '@/lib/theorem/passthrough'

export const Route = createFileRoute('/settings/import')({
  component: ImportSettings,
})

/** The file types Theorem's extraction reads. */
const ACCEPT = '.pdf,.docx,.md,.markdown,.txt,.html,.htm,.csv,.json'

function ImportSettings() {
  const { project, isPending, error } = useActiveProject()
  return (
    <SettingsPage
      title="Import context"
      description={
        project
          ? `Bring pages, files, notes and chat exports into ${project.title}. Theorem extracts and indexes them as your context, your chats recall the parts that matter without you attaching anything, and your own statements in them can update your UserModel.`
          : 'Bring pages, files, notes and chat exports into a project, where your chats can recall them.'
      }
    >
      {project ? (
        <>
          <AddImport projectId={project.projectId} />
          <ImportList projectId={project.projectId} />
        </>
      ) : error ? (
        <Empty className="rounded-lg border border-separator">
          <EmptyTitle>Theorem is unreachable</EmptyTitle>
          <EmptyDescription>{describeError(error)}</EmptyDescription>
        </Empty>
      ) : (
        !isPending && (
          <Empty className="rounded-lg border border-separator">
            <EmptyTitle>No project yet</EmptyTitle>
            <EmptyDescription>Imports belong to a project. Create one from the sidebar first.</EmptyDescription>
          </Empty>
        )
      )}
    </SettingsPage>
  )
}

function AddImport({ projectId }: { projectId: string }) {
  const { start, startFile } = useImportMutations(projectId)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const pending = start.isPending || startFile.isPending
  const error = start.error ?? startFile.error

  const submit = (event: FormEvent, run: () => void) => {
    event.preventDefault()
    run()
  }

  return (
    <SettingsSection title="Add" description="A link, a file (a ChatGPT or Claude export's conversations.json works too) or pasted text.">
      <Tabs defaultValue="url" className="gap-3">
        <TabsList className="self-start">
          <TabsTab value="url" className="gap-1.5">
            <Icon.Link className="size-3.5" />
            Link
          </TabsTab>
          <TabsTab value="file" className="gap-1.5">
            <Icon.Attachment className="size-3.5" />
            File
          </TabsTab>
          <TabsTab value="text" className="gap-1.5">
            <Icon.Article className="size-3.5" />
            Text
          </TabsTab>
        </TabsList>
        <TabsPanel value="url">
          <form
            className="flex gap-2"
            onSubmit={(event) =>
              submit(event, () =>
                start.mutate({ kind: 'url', url: url.trim() }, { onSuccess: () => setUrl('') }),
              )
            }
          >
            <Input
              type="url"
              required
              placeholder="https://..."
              aria-label="Page address"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="flex-1"
            />
            <Button type="submit" className="h-9" disabled={!url.trim() || pending}>
              Import
            </Button>
          </form>
        </TabsPanel>
        <TabsPanel value="file">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
            className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-separator px-4 py-6 text-sm text-ink-muted outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
          >
            <Icon.Attachment className="size-4" />
            {startFile.isPending ? 'Uploading...' : 'Choose a file'}
            <span className="text-xs text-ink-faint">PDF, Word, Markdown, text, HTML, CSV or JSON</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) startFile.mutate(file)
            }}
          />
        </TabsPanel>
        <TabsPanel value="text">
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) =>
              submit(event, () =>
                start.mutate(
                  { kind: 'text', title: title.trim() || 'Pasted note', text },
                  {
                    onSuccess: () => {
                      setTitle('')
                      setText('')
                    },
                  },
                ),
              )
            }
          >
            <Input
              placeholder="Title"
              aria-label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Textarea
              rows={6}
              placeholder="Paste notes, a transcript, a spec..."
              aria-label="Text"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <Button type="submit" className="self-end" disabled={!text.trim() || pending}>
              Import
            </Button>
          </form>
        </TabsPanel>
      </Tabs>
      {error && <p className="text-sm text-redwood">{describeError(error)}</p>}
    </SettingsSection>
  )
}

const STATUS: Record<ImportStatus, { label: string; variant: 'secondary' | 'info' | 'success' | 'error' }> = {
  queued: { label: 'Queued', variant: 'secondary' },
  extracting: { label: 'Extracting', variant: 'info' },
  indexing: { label: 'Indexing', variant: 'info' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
}

const KIND_MARK = { url: Icon.Link, upload: Icon.Attachment, text: Icon.Article } as const

function describeUserModel(record: ImportRecord) {
  const model = record.userModel
  if (!model) return undefined
  if (model.state === 'pending') return 'Reading for your UserModel...'
  if (model.state === 'failed') return 'Your UserModel was not updated'
  if (model.state !== 'applied') return undefined
  if (!model.applied && !model.held) return 'Nothing about you to note'
  return [
    model.applied && `${model.applied} added to your UserModel`,
    model.held && `${model.held} kept as evidence`,
  ]
    .filter(Boolean)
    .join(', ')
}

function describe(record: ImportRecord) {
  if (record.status === 'failed') return record.error?.detail ?? record.error?.code
  const parts = [record.origin]
  if (record.status === 'ready' && record.chunks) parts.push(`${record.chunks} passages`)
  parts.push(describeUserModel(record))
  return parts.filter(Boolean).join(' · ')
}

function ImportList({ projectId }: { projectId: string }) {
  const { data: imports, error, isPending } = useImports(projectId)
  const { remove } = useImportMutations(projectId)

  return (
    <SettingsSection title="Imported" description="What your chats can draw on.">
      {error ? (
        <Empty className="rounded-lg border border-separator">
          <EmptyTitle>
            {isNotServed(error) ? 'This Theorem does not import yet' : 'Theorem did not list the imports'}
          </EmptyTitle>
          <EmptyDescription>
            {isNotServed(error)
              ? 'Until it does, attach a file to a message to put it in that turn.'
              : describeError(error)}
          </EmptyDescription>
        </Empty>
      ) : isPending ? (
        <p className="px-1 text-sm text-ink-muted">Loading...</p>
      ) : !imports.length ? (
        <p className="px-1 text-sm text-ink-muted">Nothing imported into this project yet.</p>
      ) : (
        <SettingsBox>
          {imports.map((record) => (
            <SettingsRow
              key={record.importId}
              Mark={KIND_MARK[record.kind]}
              title={
                <span className="flex items-center gap-2">
                  <span className="truncate">{record.title}</span>
                  <Badge variant={STATUS[record.status].variant} size="sm">
                    {STATUS[record.status].label}
                  </Badge>
                </span>
              }
              description={describe(record)}
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${record.title}`}
                disabled={isRunning(record) || remove.isPending}
                onClick={() => remove.mutate(record.importId)}
              >
                <Icon.Delete className="size-3.5" />
              </Button>
            </SettingsRow>
          ))}
        </SettingsBox>
      )}
    </SettingsSection>
  )
}
