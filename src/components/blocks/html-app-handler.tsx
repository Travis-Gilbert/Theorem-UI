// SOURCING: @tanstack/react-query (the app's entry page and its short-lived
// link from the local server), the browser's DOMParser (the entry's
// `theorem:uses` declarations, the same ones the block listener reads with
// HTMLRewriter), lodash-es's debounce (a burst of saves reloads the app
// once), and the frame, trust and editor components beside this one. An
// `.html` file or a folder with `index.html`, as plan D13 shows it: a
// sandboxed frame (D9) in its panel and up close on a canvas, its snapshot
// far out.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { debounce } from 'lodash-es'
import { RotateCw, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { parseHtmlDeclarations } from '@/lib/blocks/declarations'
import type { Declarations } from '@/lib/blocks/declarations'
import { appUrl } from '@/lib/blocks/frames'
import { useBlocksQueryClient } from '@/lib/blocks/query-client'
import { requestAgentRun } from '@/lib/blocks/runs'
import { snapshotKey, useSnapshot } from '@/lib/blocks/snapshots'
import { workspaceState } from '@/lib/blocks/state'
import { useFolderTrust } from '@/lib/blocks/trust'
import type { FileCardProps, FileViewProps } from '@/lib/handlers/types'
import type { WorkspaceClient, WorkspaceEvent } from '@/lib/workspace/types'
import { BlockFrame, SnapshotFrame } from './block-frame'
import { BlockMessage } from './block-status'
import { SourceEditor } from './source-editor'
import { LIVE_ZOOM } from './tool-handler'
import { TrustGate } from './trust-gate'

/**
 * How often the app's link is renewed: well inside the block listener's
 * APP_TOKEN_LIFETIME_MS (12 hours), so a page open all day never reloads
 * into an expired link.
 */
const APP_LINK_REFRESH_MS = 6 * 60 * 60 * 1000
/** A burst of saves (an editor writing several files) reloads the app once. */
const RELOAD_DEBOUNCE_MS = 150

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** The folder an app's pages load from, and its entry page. */
export function appLayout(file: Pick<FileViewProps, 'path' | 'entry'>): {
  root: string
  entry: string
} {
  if (file.entry.kind === 'directory')
    return { root: file.path, entry: `${file.path}/index.html` }
  // The file's folder; '' is the workspace's top level.
  const slash = file.path.lastIndexOf('/')
  return { root: slash < 0 ? '' : file.path.slice(0, slash), entry: file.path }
}

const within = (path: string, root: string) =>
  root === '' || path === root || path.startsWith(`${root}/`)

function touches(event: WorkspaceEvent, root: string): boolean {
  switch (event.type) {
    case 'created':
    case 'changed':
      return within(event.entry.path, root)
    case 'deleted':
      return within(event.path, root)
    case 'renamed':
      return within(event.from, root) || within(event.to, root)
    case 'resync':
      return true
    case 'indexed':
      return false
  }
}

/** Counts changes to the app's files, so its page reloads with them. */
function useAppGeneration(client: WorkspaceClient, root: string) {
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    const bump = debounce(
      () => setGeneration((value) => value + 1),
      RELOAD_DEBOUNCE_MS,
    )
    const stop = client.subscribe((event) => {
      if (touches(event, root)) bump()
    })
    return () => {
      stop()
      bump.cancel()
    }
  }, [client, root])
  return [generation, () => setGeneration((value) => value + 1)] as const
}

/** The `theorem:uses` declarations of an app's entry page. */
export function appDeclarations(html: string): Declarations {
  const page = new DOMParser().parseFromString(html, 'text/html')
  return parseHtmlDeclarations(
    [...page.querySelectorAll('meta[name="theorem:uses"]')].map(
      (meta) => meta.getAttribute('content') ?? '',
    ),
  )
}

function useApp(file: FileViewProps) {
  const { client, path } = file
  const { root, entry } = appLayout(file)
  const { trusted } = useFolderTrust(client)
  const [generation, reload] = useAppGeneration(client, root)
  const queryClient = useBlocksQueryClient()
  const id = client.workspace.id
  const page = useQuery(
    {
      queryKey: ['blocks', 'app-entry', id, entry, generation],
      queryFn: async () => {
        const { text } = await client.readText(entry)
        return { text, declarations: appDeclarations(text), generation }
      },
      // The running app stays up while a change is read.
      placeholderData: keepPreviousData,
      // A local read that failed (no index.html) fails again; the next
      // change to the folder reads it anew.
      retry: false,
    },
    queryClient,
  )
  const link = useQuery(
    {
      queryKey: ['blocks', 'app-link', id, path],
      queryFn: () => appUrl(id, path),
      enabled: trusted,
      staleTime: APP_LINK_REFRESH_MS,
      refetchInterval: APP_LINK_REFRESH_MS,
    },
    queryClient,
  )
  const capabilities = page.data?.declarations.capabilities
  const host = useMemo(
    () =>
      capabilities && {
        client,
        capabilities,
        state: workspaceState(id),
        run: (target: string) =>
          requestAgentRun({
            target,
            documentPath: path,
            requestedBy: path,
            requestedAt: new Date().toISOString(),
          }),
      },
    [client, id, path, capabilities],
  )
  return { trusted, page, link, host, reload, entry }
}

type App = ReturnType<typeof useApp>

/** The app running, or why it is not. */
function AppBody({ file, app }: { file: FileViewProps; app: App }) {
  const { trusted, page, link, host, entry } = app
  const title = nameOf(file.path)
  if (page.error)
    return (
      <BlockMessage tone={file.entry.kind === 'directory' ? 'quiet' : 'error'}>
        {file.entry.kind === 'directory'
          ? `${title} has no index.html, so it does not open as an app.`
          : page.error.message}
      </BlockMessage>
    )
  if (!page.data) return null
  if (!trusted)
    return (
      <TrustGate client={file.client}>
        <SourceEditor
          value={page.data.text}
          lang="html"
          readOnly
          label={nameOf(entry)}
        />
      </TrustGate>
    )
  const { errors } = page.data.declarations
  return (
    <>
      {errors.length > 0 && (
        <BlockMessage tone="error">{errors.join('\n')}</BlockMessage>
      )}
      {link.error && (
        <BlockMessage tone="error">{link.error.message}</BlockMessage>
      )}
      {link.data && host && (
        <BlockFrame
          // A new frame for each read of the app's files: the page reloads
          // once its new declarations are in.
          key={page.data.generation}
          src={link.data}
          host={host}
          title={title}
          snapshotKey={snapshotKey(file.client.workspace.id, file.path)}
          className="h-full [&>iframe]:min-h-full"
        />
      )}
    </>
  )
}

/** An HTML app's panel: the app, with a reload. */
export function HtmlAppPanel(file: FileViewProps) {
  const app = useApp(file)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-separator px-2">
        <span className="me-auto truncate ps-1 text-xs text-ink-faint">
          {nameOf(file.path)}
        </span>
        {app.trusted && (
          <Button variant="ghost" size="xs" onClick={app.reload}>
            <RotateCw />
            Reload
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <AppBody file={file} app={app} />
      </div>
    </div>
  )
}

/** An HTML app on a canvas or embedded in a note: live up close, its snapshot far out. */
export function HtmlAppCard({ zoom, selected, ...file }: FileCardProps) {
  const live = zoom >= LIVE_ZOOM
  const { trusted } = useFolderTrust(file.client)
  const snapshot = useSnapshot(snapshotKey(file.client.workspace.id, file.path))
  return (
    <div
      data-slot="html-app-card"
      data-selected={selected || undefined}
      className="h-full overflow-hidden"
    >
      {live ? (
        <LiveCard file={file} />
      ) : snapshot && trusted ? (
        <SnapshotFrame html={snapshot} title={nameOf(file.path)} />
      ) : (
        <div className="flex h-full flex-col justify-end gap-1 p-3">
          <span className="truncate text-sm font-medium text-ink">
            {nameOf(file.path)}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
            {trusted ? (
              'HTML app'
            ) : (
              <>
                <ShieldAlert className="size-3" aria-hidden />
                Not trusted
              </>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

function LiveCard({ file }: { file: FileViewProps }) {
  return <AppBody file={file} app={useApp(file)} />
}
