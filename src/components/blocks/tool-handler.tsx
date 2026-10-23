// SOURCING: sessions.ts (the tool file's shared block session: the same graph
// in every view of it), the frame, status and editor components beside this
// one, @tanstack/react-query's useMutation (exporting) and lucide-react. A
// `.tsx` tool as plan D13 shows it: a live sandboxed frame in its panel and
// on a canvas up close, its snapshot far out, and a Run control in the code
// editor with last-run values in the margin.
import { useMutation } from '@tanstack/react-query'
import { Download, Play, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CODE_LANGUAGES } from '@/lib/blocks/format'
import { useBlocksQueryClient } from '@/lib/blocks/query-client'
import type { BlockSession } from '@/lib/blocks/session'
import {
  useBlockSession,
  useCellState,
  useSessionBlocks,
} from '@/lib/blocks/sessions'
import { snapshotKey, useSnapshot } from '@/lib/blocks/snapshots'
import { workspaceState } from '@/lib/blocks/state'
import { useFolderTrust } from '@/lib/blocks/trust'
import type { FileCardProps, FileViewProps } from '@/lib/handlers/types'
import { CellFrame, SnapshotFrame } from './block-frame'
import { BlockMessage, BlockStatus, runLabel } from './block-status'
import { SourceEditor } from './source-editor'
import { TrustGate } from './trust-gate'

/** A tool file's one block, in its session. */
const KEY = 'tool'

/**
 * Below this zoom a canvas card shows the tool's snapshot instead of running
 * it. Phase 3 renders embeds at 0.5, so an embedded tool always runs.
 */
export const LIVE_ZOOM = 0.4

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const extensionOf = (path: string) => {
  const name = fileName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** Whether the code handler's Run runs this file: TypeScript or JavaScript. */
export const runsAsTool = (path: string) => CODE_LANGUAGES.has(extensionOf(path))

function useTool({ client, path }: FileViewProps) {
  const session = useBlockSession(client, path, 'tool')
  useSessionBlocks(session)
  const state = useCellState(session, KEY)
  return {
    session,
    state,
    block: session.block(KEY),
    ...session.codeState(KEY),
  }
}

function RunButton({
  session,
  label,
}: {
  session: BlockSession
  label: string
}) {
  return (
    <Button variant="ghost" size="xs" onClick={() => session.cell(KEY)?.run()}>
      <Play />
      {label}
    </Button>
  )
}

/** The tool running, or why it is not. */
function ToolBody({
  file,
  tool,
  compact = false,
}: {
  file: FileViewProps
  tool: ReturnType<typeof useTool>
  compact?: boolean
}) {
  const { session, state, block, compiled, compileError } = tool
  const title = fileName(file.path)
  if (!session.trusted)
    return (
      <TrustGate client={file.client}>
        {block && (
          <SourceEditor value={block.source} lang="tsx" readOnly label={title} />
        )}
      </TrustGate>
    )
  const failure =
    compileError ??
    (compiled?.declarationErrors.length
      ? compiled.declarationErrors.join('\n')
      : null) ??
    (state?.status === 'error' ? (state.error ?? 'The tool failed') : null)
  return (
    <>
      {compiled && !compiled.declarationErrors.length && (
        <CellFrame
          session={session}
          blockKey={KEY}
          compiled={compiled}
          title={title}
          snapshotKey={snapshotKey(file.client.workspace.id, file.path)}
        />
      )}
      {failure && <BlockMessage tone="error">{failure}</BlockMessage>}
      {!compact && state?.status === 'idle' && (
        <BlockMessage>
          This tool writes files, reaches the network or starts agents, so it
          runs when you press Run.
        </BlockMessage>
      )}
    </>
  )
}

/** A tool file's panel: the tool running, with Run and Export. */
export function ToolPanel(file: FileViewProps) {
  const tool = useTool(file)
  const { session, state } = tool
  const queryClient = useBlocksQueryClient()
  const exporting = useMutation(
    {
      mutationFn: async () => {
        const { exportTool } = await import('@/lib/blocks/export')
        return exportTool(file.client, file.path, {
          state: workspaceState(file.client.workspace.id),
        })
      },
    },
    queryClient,
  )
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-separator px-2">
        <span className="me-auto truncate ps-1 text-xs text-ink-faint">
          {fileName(file.path)}
        </span>
        <BlockStatus state={state} />
        {session.trusted && (
          <>
            <RunButton session={session} label={runLabel(state)} />
            <Button
              variant="ghost"
              size="xs"
              disabled={exporting.isPending}
              onClick={() => exporting.mutate()}
            >
              <Download />
              {exporting.isPending ? 'Exporting…' : 'Export'}
            </Button>
          </>
        )}
      </div>
      {exporting.data && (
        <BlockMessage>
          Exported to {exporting.data.path}: one page that runs anywhere, with
          the files and state the tool declared.
        </BlockMessage>
      )}
      {exporting.error && (
        <BlockMessage tone="error">{exporting.error.message}</BlockMessage>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <ToolBody file={file} tool={tool} />
      </div>
    </div>
  )
}

function ToolSummary({ file, tool }: { file: FileViewProps; tool: ReturnType<typeof useTool> }) {
  return (
    <div className="flex h-full flex-col justify-end gap-1 p-3">
      <span className="truncate text-sm font-medium text-ink">
        {fileName(file.path)}
      </span>
      {tool.session.trusted ? (
        <BlockStatus state={tool.state} />
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
          <ShieldAlert className="size-3" aria-hidden />
          Not trusted
        </span>
      )}
    </div>
  )
}

/** A tool on a canvas or embedded in a note: live up close, its snapshot far out. */
export function ToolCard({ zoom, selected, ...file }: FileCardProps) {
  const tool = useTool(file)
  const snapshot = useSnapshot(snapshotKey(file.client.workspace.id, file.path))
  const live = zoom >= LIVE_ZOOM
  return (
    <div
      data-slot="tool-card"
      data-selected={selected || undefined}
      className="h-full overflow-hidden"
    >
      {live ? (
        <ToolBody file={file} tool={tool} compact />
      ) : snapshot && tool.session.trusted ? (
        <SnapshotFrame html={snapshot} title={fileName(file.path)} />
      ) : (
        <ToolSummary file={file} tool={tool} />
      )}
    </div>
  )
}

/** Runs a code file once Run is pressed, and keeps it running as it changes. */
function ArmedRun({ file }: { file: FileViewProps }) {
  const tool = useTool(file)
  const { session, state, compiled } = tool
  return (
    <>
      <BlockStatus state={state} />
      <RunButton session={session} label="Run again" />
      {compiled && !compiled.declarationErrors.length && (
        <CellFrame
          session={session}
          blockKey={KEY}
          compiled={compiled}
          title={fileName(file.path)}
          hidden
        />
      )}
    </>
  )
}

/**
 * The code editor's Run control. A file runs only once Run is pressed; then,
 * as a tool, it reruns when it or what it reads changes, and its values show
 * in the editor's margin.
 */
export function RunToolbar(file: FileViewProps) {
  const [armed, setArmed] = useState(false)
  const { trusted, trust, pending } = useFolderTrust(file.client)
  if (!runsAsTool(file.path)) return null
  if (!trusted)
    return (
      <Button
        variant="ghost"
        size="xs"
        disabled={pending}
        onClick={() => void trust()}
      >
        <ShieldAlert />
        Trust this folder to run
      </Button>
    )
  if (armed) return <ArmedRun file={file} />
  return (
    <Button variant="ghost" size="xs" onClick={() => setArmed(true)}>
      <Play />
      Run
    </Button>
  )
}
