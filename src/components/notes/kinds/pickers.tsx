// SOURCING: ui/dialog and coss input for the link prompt, ItemPicker over Base UI Combobox for conversations and artifacts, NotePicker, the platform's file input, lib/theorem/uploads. What the canvas bar and a note's slash menu both ask for, in one place.
import { useRef, useState } from 'react'
import { Input } from '@/components/coss/input'
import { Icon } from '@/components/icons'
import { useActiveProject } from '@/components/shell/projects'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { describeError } from '@/lib/theorem/client'
import { embedFence } from '@/lib/theorem/embeds'
import type { EmbedRef } from '@/lib/theorem/embeds'
import {
  useOrganizedViews,
  useProjectOutputs,
} from '@/lib/theorem/organization'
import type { ProjectOutput, ThreadEntry } from '@/lib/theorem/organization'
import { MEDIA_ACCEPT, uploadBlock } from '@/lib/theorem/uploads'
import { ItemPicker, NotePicker } from '../note-picker'

/** What a person picked, ready to go in a note or become one. */
export type PickedBlock = {
  title: string
  markdown: string
  /** Which size a new canvas node for it opens at. */
  shape: 'image' | 'audio' | 'video' | 'pdf' | 'file' | 'link' | 'object'
  /** A note picked as it is, placed on a canvas rather than embedded. */
  documentId?: string
}

export type BlockRequest = 'media' | 'link' | 'thread' | 'artifact' | 'note'

/** A pasted or typed address, or nothing when it is not one. */
export function asUrl(text: string): string | undefined {
  const candidate = text.trim()
  if (!candidate || /\s/.test(candidate)) return undefined
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(candidate)
    ? candidate
    : `https://${candidate}`
  try {
    const url = new URL(withScheme)
    const web = url.protocol === 'http:' || url.protocol === 'https:'
    // A bare word parses as a host, so a host needs a dot to count as one.
    return web && (url.hostname.includes('.') || url.hostname === 'localhost')
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

export function linkBlock(url: string, title?: string): PickedBlock {
  const host = new URL(url).host
  const embed: EmbedRef = { kind: 'link', id: url, title: title || host }
  return { title: title || host, markdown: embedFence(embed), shape: 'link' }
}

function LinkPrompt({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (url: string) => void
}) {
  const [text, setText] = useState('')
  const url = asUrl(text)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-3 sm:max-w-md">
        <DialogTitle className="px-1 text-sm font-medium">Add a link</DialogTitle>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!url) return
            onPick(url)
            setText('')
            onOpenChange(false)
          }}
        >
          <Input
            autoFocus
            aria-label="Address"
            placeholder="https://"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={!url}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const outputIsOpenable = (item: ProjectOutput) =>
  (item.kind === 'app' || item.kind === 'artifact') && item.artifactId

/**
 * The pickers for what a note can hold. `request` opens one, `uploadFiles` takes
 * files from anywhere (a drop, a paste), and `element` goes in the tree.
 */
export function useBlockPickers<TAt = undefined>({
  onPicked,
  excludeNote,
}: {
  onPicked: (picked: PickedBlock, at?: TAt) => void | Promise<void>
  excludeNote?: string
}) {
  const { project } = useActiveProject()
  const projectId = project?.projectId
  const [open, setOpen] = useState<Exclude<BlockRequest, 'media'>>()
  const [uploading, setUploading] = useState<string>()
  const [error, setError] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  const views = useOrganizedViews()
  const outputs = useProjectOutputs(open === 'artifact' ? projectId : undefined)
  const threads = [...views.byId.values()]
  const artifacts = (outputs.data?.items ?? []).filter(outputIsOpenable)

  const uploadFiles = async (files: readonly File[], at?: TAt) => {
    setError(undefined)
    if (!projectId) {
      setError('Pick a project before adding files.')
      return
    }
    for (const file of files) {
      setUploading(file.name)
      try {
        await onPicked(await uploadBlock(projectId, file), at)
      } catch (cause) {
        setError(`${file.name}: ${describeError(cause)}`)
      }
    }
    setUploading(undefined)
  }

  const close = (next: boolean) => {
    if (!next) setOpen(undefined)
  }

  return {
    uploading,
    error,
    uploadFiles,
    request: (request: BlockRequest) => {
      if (request === 'media') input.current?.click()
      else setOpen(request)
    },
    element: (
      <>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          accept={MEDIA_ACCEPT}
          aria-label="Add files"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            void uploadFiles(files)
          }}
        />
        <LinkPrompt
          open={open === 'link'}
          onOpenChange={close}
          onPick={(url) => void onPicked(linkBlock(url))}
        />
        <NotePicker
          open={open === 'note'}
          onOpenChange={close}
          title="Add a note"
          exclude={excludeNote}
          onPick={(doc) =>
            void onPicked({
              title: doc.title,
              shape: 'object',
              documentId: doc.documentId,
              markdown: embedFence({
                kind: 'document',
                id: doc.documentId,
                title: doc.title,
              }),
            })
          }
        />
        <ItemPicker<ThreadEntry>
          open={open === 'thread'}
          onOpenChange={close}
          title="Add a conversation"
          placeholder="Search conversations"
          items={threads}
          itemKey={(thread) => thread.threadId}
          itemLabel={(thread) => thread.title || 'Untitled'}
          ItemIcon={Icon.Chat}
          empty="No conversations match."
          onPick={(thread) =>
            void onPicked({
              title: thread.title || 'Conversation',
              shape: 'object',
              markdown: embedFence({
                kind: 'thread',
                id: thread.threadId,
                title: thread.title,
              }),
            })
          }
        />
        <ItemPicker<ProjectOutput>
          open={open === 'artifact'}
          onOpenChange={close}
          title="Add an app or artifact"
          placeholder="Search this project's outputs"
          items={artifacts}
          itemKey={(item) => item.outputId}
          itemLabel={(item) => item.title}
          ItemIcon={Icon.Artifact}
          empty={outputs.isPending ? 'Loading…' : 'Nothing has been made here yet.'}
          onPick={(item) =>
            void onPicked({
              title: item.title,
              shape: 'object',
              markdown: embedFence({
                kind: 'artifact',
                id: item.artifactId ?? item.outputId,
                title: item.title,
                threadId: item.threadId,
              }),
            })
          }
        />
      </>
    ),
  }
}
