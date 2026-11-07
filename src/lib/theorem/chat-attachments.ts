// SOURCING: @assistant-ui/react AttachmentAdapter (the composer's upload contract, including its submission, cancel and return-to-draft states), over Theorem's project uploads route in lib/theorem/imports.
import type { AttachmentAdapter } from '@assistant-ui/react'
import { describeError } from './client'
import type { Theorem } from './client'
import { uploadFile } from './imports'
import { MEDIA_ACCEPT } from './uploads'

/** What Theorem's chat intake takes. It checks each by its magic bytes as well. */
const ACCEPT = `${MEDIA_ACCEPT},text/plain,text/markdown,text/html,text/csv,application/json,.md,.csv,.txt`

/** Files go up when the message is sent, into the project of the thread they join. */
export function chatAttachments(
  projectOfThread: () => Promise<string>,
): AttachmentAdapter {
  return {
    accept: ACCEPT,
    add: ({ file }) =>
      Promise.resolve({
        id: crypto.randomUUID(),
        type: file.type.startsWith('image/') ? 'image' : 'document',
        name: file.name,
        contentType: file.type,
        file,
        status: { type: 'requires-action', reason: 'composer-send' },
      }),
    remove: () => Promise.resolve(),
    send: async (attachment) => {
      const { uploadId } = await uploadFile(
        await projectOfThread(),
        attachment.file,
      ).catch((error: unknown) => {
        // The composer shows this message on the file it could not send.
        throw new Error(describeError(error), { cause: error })
      })
      return {
        ...attachment,
        id: uploadId,
        status: { type: 'complete' },
        content: [],
      }
    },
  }
}

const storedText = (message: Theorem.Message) =>
  message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part.payload as { text?: string }).text)
    .join('\n')

const storedUploads = (message: Theorem.Message) =>
  message.parts.flatMap((part) => {
    const { uploadId } = part.payload as { uploadId?: string }
    return part.type === 'attachment' && uploadId ? [uploadId] : []
  })

/**
 * The upload ids a turn sends. A new message carries what the composer holds.
 * Unchanged text is a retry, which reuses its stored message and takes none. An
 * edit replaces the stored message, so it restates what that message held.
 */
export function turnUploads(
  text: string,
  attached: readonly string[],
  stored: Theorem.Message | undefined,
): string[] {
  if (!stored) return [...attached]
  if (storedText(stored) === text) return []
  return [...new Set([...storedUploads(stored), ...attached])]
}
