// SOURCING: Theorem's project uploads route (`POST /api/chat/v1/projects/:id/uploads`, raw bytes with x-file-name-b64, x-file-size and x-content-sha256; answers `{ record: { uploadId } }`), the same route and headers the web client uses in Theorem-UI src/lib/theorem/imports.ts; TheoremClient.fetch carries the bearer
import { mutate, theorem } from '@/lib/theorem'
import { read } from './files'
import type { FileItem } from './model'
import { base64Url } from './wire'

/** A failed upload that carries Theorem's status, so a refusal can be told from a lost connection. */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly body: unknown,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

/**
 * Stores one file in the project. `key` is the idempotency key: the same file
 * of the same delivery always sends the same one, so a repeat after a lost
 * answer does not store it twice.
 */
export async function uploadFile(
  projectId: string,
  file: FileItem,
  key: string,
): Promise<{ uploadId: string }> {
  const { bytes, sha256 } = await read(file)
  return mutate(key, async (headers) => {
    const response = await theorem().fetch(`/api/chat/v1/projects/${encodeURIComponent(projectId)}/uploads`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': file.mimeType,
        'x-file-name-b64': base64Url(file.name),
        'x-file-size': String(bytes.byteLength),
        'x-content-sha256': sha256,
      },
      body: bytes,
    })
    const body = (await response.json().catch(() => undefined)) as
      { record?: { uploadId?: string }; detail?: string; title?: string } | undefined
    const uploadId = body?.record?.uploadId
    if (!response.ok || !uploadId)
      throw new UploadError(
        body?.detail ?? body?.title ?? `Theorem answered ${response.status} to the upload of ${file.name}.`,
        response.status,
        body,
      )
    return { uploadId }
  })
}
