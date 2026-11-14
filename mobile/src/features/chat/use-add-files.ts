// SOURCING: expo-document-picker through features/intake/acquire (the system Files picker); the project uploads route through features/intake/upload (the web client's route, with the bearer); features/intake/files for the app-owned copy
//
// Adds files to a project from its page. A file is copied into the app's storage
// first, stays there until Theorem has stored it, and its row key is its upload
// key, so Retry after a lost answer repeats the same request.
import { useCallback, useReducer, useRef, useState } from 'react'
import { fromFiles } from '@/features/intake/acquire'
import { discard } from '@/features/intake/files'
import type { FileItem } from '@/features/intake/model'
import { uploadFile } from '@/features/intake/upload'
import { describeError } from '@/lib/theorem'
import { reduceAdded, type Added } from './added-files'

export function useAddFiles(projectId: string | undefined) {
  const [added, dispatch] = useReducer(reduceAdded, [] as Added[])
  const [pickError, setPickError] = useState<string>()
  const kept = useRef(new Map<string, FileItem>())

  const send = useCallback(
    async (file: FileItem) => {
      if (!projectId) return
      dispatch({ type: 'start', id: file.id, name: file.name })
      try {
        await uploadFile(projectId, file, file.id)
        dispatch({ type: 'stored', id: file.id })
        kept.current.delete(file.id)
        discard(file.id)
      } catch (failure) {
        dispatch({ type: 'failed', id: file.id, error: describeError(failure) })
      }
    },
    [projectId],
  )

  const pick = useCallback(async () => {
    setPickError(undefined)
    try {
      const files = (await fromFiles()).filter((item): item is FileItem => item.kind === 'file')
      files.forEach((file) => kept.current.set(file.id, file))
      await Promise.all(files.map(send))
    } catch (failure) {
      setPickError(describeError(failure))
    }
  }, [send])

  const retry = useCallback(
    (id: string) => {
      const file = kept.current.get(id)
      if (file) void send(file)
    },
    [send],
  )

  return { added, pickError, pick, retry }
}
