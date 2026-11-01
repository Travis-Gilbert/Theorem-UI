// SOURCING: OpenIDEA's Dialog, Button and Input. A browser cannot hand the frontend a path on a
// machine it does not run on, so the "Open" and "Save" dialogs of the desktop app choose inside
// the one file system the page can reach: the Theorem workspace. Listing comes from
// `fs_read_dir`, the same command the project tree uses.

import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import type { FileEntry } from '@/bindings'
import { Button, Dialog, Input } from '@/ui'
import { currentHost, type PickOptions } from '../host'
import styles from './PathPicker.module.css'

interface Request {
  kind: 'open' | 'save'
  options: PickOptions
  resolve(path: string | string[] | null): void
}

const usePicker = create<{ request: Request | undefined }>(() => ({ request: undefined }))

/** Ask the user for a workspace path; resolves `null` when the dialog is cancelled. */
export function requestPath(kind: Request['kind'], options: PickOptions): Promise<string | string[] | null> {
  return new Promise((resolve) => {
    usePicker.getState().request?.resolve(null)
    usePicker.setState({ request: { kind, options, resolve } })
  })
}

const parentOf = (path: string) => path.slice(0, Math.max(path.indexOf('/', 1), path.lastIndexOf('/')))

export function PathPicker({ root }: { root: string }) {
  const request = usePicker((s) => s.request)
  const [directory, setDirectory] = useState(root)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [error, setError] = useState<string>()
  const [name, setName] = useState('')
  const [chosen, setChosen] = useState<string[]>([])

  useEffect(() => {
    if (!request) return
    const start = request.options.defaultPath
    setDirectory(start && start.startsWith(root) ? start : root)
    setName('')
    setChosen([])
  }, [request, root])

  useEffect(() => {
    if (!request) return
    let stale = false
    setError(undefined)
    currentHost()
      .invoke('fs_read_dir', { path: directory })
      .then((list) => {
        if (!stale) setEntries((list as FileEntry[]).sort((a, b) => Number(b.kind === 'dir') - Number(a.kind === 'dir') || a.name.localeCompare(b.name)))
      })
      .catch((e: { message?: string }) => {
        if (!stale) {
          setEntries([])
          setError(e?.message ?? String(e))
        }
      })
    return () => {
      stale = true
    }
  }, [request, directory])

  const extensions = useMemo(
    () => request?.options.filters?.flatMap((f) => f.extensions.map((e) => e.toLowerCase())) ?? [],
    [request],
  )
  if (!request) return null
  const { options, kind } = request
  const directoryMode = options.directory === true
  const visible = entries.filter(
    (e) => e.kind === 'dir' || (!directoryMode && (extensions.length === 0 || extensions.includes(e.name.slice(e.name.lastIndexOf('.') + 1).toLowerCase()))),
  )

  const finish = (result: string | string[] | null) => {
    usePicker.setState({ request: undefined })
    request.resolve(result)
  }
  const chooseFile = (path: string) => {
    if (kind === 'save') return setName(path.slice(path.lastIndexOf('/') + 1))
    if (options.multiple) return setChosen((c) => (c.includes(path) ? c.filter((p) => p !== path) : [...c, path]))
    finish(path)
  }
  const target =
    kind === 'save' ? (name ? `${directory}/${name}` : null) : directoryMode ? directory : options.multiple ? (chosen.length ? chosen : null) : null

  return (
    <Dialog
      open
      onClose={() => finish(null)}
      title={options.title ?? (kind === 'save' ? 'Save As' : directoryMode ? 'Select Folder' : 'Open File')}
      width={520}
      buttons={[
        { label: 'Cancel', role: 'cancel' },
        { label: kind === 'save' ? 'Save' : 'OK', role: 'default', disabled: target === null, onClick: () => target && finish(target) },
      ]}
    >
      <div className={styles.body} data-testid="path-picker">
        <div className={styles.path}>
          <Button size="small" disabled={directory === root} onClick={() => setDirectory(parentOf(directory) || root)} title="Up">
            Up
          </Button>
          <code data-testid="path-picker-directory">{directory}</code>
        </div>
        <div className={styles.list} role="listbox" aria-label="Workspace files">
          {error ? <div className={styles.error}>{error}</div> : null}
          {visible.map((entry) => (
            <button
              key={entry.path}
              type="button"
              role="option"
              aria-selected={chosen.includes(entry.path)}
              className={styles.row}
              onClick={() => (entry.kind === 'dir' ? setDirectory(entry.path) : chooseFile(entry.path))}
            >
              <span className={styles.kind}>{entry.kind === 'dir' ? 'folder' : ''}</span>
              {entry.name}
            </button>
          ))}
          {!error && visible.length === 0 ? <div className={styles.empty}>Nothing here</div> : null}
        </div>
        {kind === 'save' ? (
          <Input aria-label="File name" placeholder="File name" value={name} onChange={(e) => setName(e.target.value)} />
        ) : null}
      </div>
    </Dialog>
  )
}
