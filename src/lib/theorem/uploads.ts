// SOURCING: Theorem's upload routes (docs/plans/thread-organization-and-review.md, Media) through lib/theorem/client and imports' uploadFile, @tanstack/react-query for an image's bytes. Bytes go through fetch because the client carries Theorem's session; a blob: URL is what the platform's elements then read, as useShotUrl does for review shots.
import { useQuery } from '@tanstack/react-query'
import { useFileSrc } from '@/hooks/use-attachment-src'
import { mutate, theorem } from './client'
import type { EmbedRef } from './embeds'
import { uploadFile } from './imports'
import { theoremJson } from './passthrough'
import { fileBlock, fileShape, imageBlock } from './note-kinds'

const BASE = '/api/chat/v1/uploads'

export const uploadContentPath = (uploadId: string) =>
  `${BASE}/${encodeURIComponent(uploadId)}/content`

/** A note's image written as a Theorem upload, rather than a URL anywhere else. */
export const isUploadPath = (url: string) =>
  url.startsWith(`${BASE}/`) && url.endsWith('/content')

/** What file notes may hold. Theorem checks each by its magic bytes as well. */
export const MEDIA_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,application/pdf,audio/*,video/mp4,video/webm,video/quicktime'

export async function readUpload(path: string): Promise<Blob> {
  const response = await theorem().fetch(path)
  if (!response.ok) throw new Error(`The file answered ${response.status}`)
  return response.blob()
}

/** Uploads expire after a day unless something keeps them, and a note does. */
export function retainUpload(uploadId: string) {
  return mutate((headers) =>
    theoremJson<unknown>(`${BASE}/${encodeURIComponent(uploadId)}/retain`, {
      method: 'POST',
      headers,
    }),
  )
}

export type UploadedBlock = {
  title: string
  /** The Markdown block that shows the file. */
  markdown: string
  /** Which viewer the block opens in. */
  shape: ReturnType<typeof fileShape>
}

/** A file put in Theorem for good, and the block a note shows it with. */
export async function uploadBlock(
  projectId: string,
  file: File,
): Promise<UploadedBlock> {
  const { uploadId, sha256 } = await uploadFile(projectId, file)
  await retainUpload(uploadId)
  const shape = fileShape(file.type)
  const embed: EmbedRef = {
    kind: 'file',
    id: uploadId,
    title: file.name,
    mime: file.type,
    size: file.size,
    sha256,
  }
  return {
    title: file.name,
    shape,
    markdown:
      shape === 'image'
        ? imageBlock(uploadContentPath(uploadId), file.name)
        : fileBlock(embed),
  }
}

/** An image's address the platform can read: uploads as a blob:, the rest as written. */
export function useImageUrl(src: string | undefined) {
  const upload = src !== undefined && isUploadPath(src)
  const { data: blob, error } = useQuery({
    queryKey: ['theorem', 'upload', src],
    enabled: upload,
    // An upload's bytes never change.
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => readUpload(src!),
  })
  const url = useFileSrc(blob)
  return { url: upload ? url : src, error }
}
