// SOURCING: @prosemirror-adapter/react's node view context (the live_block
// node, its position and setAttrs), sessions.ts (the note's shared block
// session), react-markdown with remark-gfm (a pinned output where nothing
// runs), lucide-react, and the frame, query, agent, trust and editor views
// beside this one. A `.live` fence in the Markdown editor as plan D9 shows
// it: its source, editable, and its result; an untrusted folder's block shows
// its source and the way to trust the folder.
import { useNodeViewContext } from '@prosemirror-adapter/react'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Code, Pin, PinOff, Play } from 'lucide-react'
import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import {
  fenceCode,
  fenceInfo,
  pinnedBody,
  pinnedOutput,
  withFenceCode,
  withFenceId,
} from '@/lib/blocks/format'
import type { FenceInfo, LiveBlockSource } from '@/lib/blocks/format'
import {
  LIVE_BLOCK_CONTROLS,
  LIVE_BLOCK_NODE,
  liveBlockAttrs,
} from '@/lib/blocks/milkdown'
import { withPinnedOutput, withoutPinnedOutput } from '@/lib/blocks/output'
import type { QueryResult } from '@/lib/blocks/query'
import type { CellState } from '@/lib/blocks/runtime'
import { blockKeys } from '@/lib/blocks/session'
import type { BlockSession } from '@/lib/blocks/session'
import {
  useBlockSession,
  useCellState,
  useSessionBlocks,
} from '@/lib/blocks/sessions'
import { useFolderTrust } from '@/lib/blocks/trust'
import type { FileViewProps } from '@/lib/handlers/types'
import { AgentView } from './agent-view'
import { CellFrame } from './block-frame'
import { BlockMessage, BlockStatus, runLabel } from './block-status'
import { QueryView } from './query-view'
import { SourceEditor } from './source-editor'
import { TrustGate } from './trust-gate'

const controls = { [LIVE_BLOCK_CONTROLS]: '' }

/**
 * The block's key in its session: blocks are named in document order, the
 * way the session names them from the saved file (session.ts's blockKeys).
 */
function blockKeyAt(doc: ProseNode, pos: number | undefined): string | null {
  if (pos === undefined) return null
  const infos: Array<FenceInfo | null> = []
  let index = -1
  doc.descendants((node, at) => {
    if (node.type.name !== LIVE_BLOCK_NODE) return true
    if (at === pos) index = infos.length
    infos.push(fenceInfo(liveBlockAttrs(node).fence))
    return false
  })
  return index < 0 ? null : (blockKeys(infos)[index]?.key ?? null)
}

/** A name other blocks can read as a variable. */
const NAME = /^[A-Za-z_$][\w$]*$/

function NameField({
  id,
  onName,
}: {
  id: string | null
  onName: (name: string) => void
}) {
  const [invalid, setInvalid] = useState(false)
  const commit = (input: HTMLInputElement) => {
    const name = input.value.trim()
    if (name === (id ?? '')) return setInvalid(false)
    if (!NAME.test(name)) return setInvalid(true)
    setInvalid(false)
    onName(name)
  }
  return (
    <label className="inline-flex items-center font-mono text-xs text-ink-faint">
      #
      <input
        // A rename from elsewhere (an edit on disk) resets the field.
        key={id}
        defaultValue={id ?? ''}
        placeholder="name"
        aria-label="Block name"
        aria-invalid={invalid || undefined}
        title={
          invalid
            ? 'A name is letters, digits, _ and $, and does not start with a digit'
            : 'Other blocks read this block by its name'
        }
        size={Math.max((id ?? '').length, 4)}
        className="rounded-sm bg-transparent px-0.5 text-ink outline-none placeholder:text-ink-faint focus-visible:bg-hover aria-invalid:text-error-ink"
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(event.currentTarget)
          }
          if (event.key === 'Escape') {
            event.currentTarget.value = id ?? ''
            setInvalid(false)
          }
        }}
      />
    </label>
  )
}

/** The block's result: its frame, its query views, or its agent's status. */
function BlockOutput({
  session,
  blockKey,
  kind,
  code,
  state,
}: {
  session: BlockSession
  blockKey: string
  kind: 'code' | 'query' | 'agent'
  code: string
  state: CellState | null
}) {
  const failure = state?.status === 'error' ? (state.error ?? 'Failed') : null
  if (kind === 'query') {
    if (state?.status === 'ok')
      return <QueryView result={state.value as QueryResult} />
    return failure ? <BlockMessage tone="error">{failure}</BlockMessage> : null
  }
  if (kind === 'agent')
    return (
      <>
        <AgentView source={code} state={state} />
        {failure && <BlockMessage tone="error">{failure}</BlockMessage>}
      </>
    )
  const { compiled, compileError } = session.codeState(blockKey)
  return (
    <>
      {compiled && !compiled.declarationErrors.length && (
        <CellFrame
          session={session}
          blockKey={blockKey}
          compiled={compiled}
          title={`Block ${blockKey}`}
        />
      )}
      {(compileError ?? failure) && (
        <BlockMessage tone="error">{compileError ?? failure}</BlockMessage>
      )}
      {state?.status === 'idle' && (
        <BlockMessage>
          This block writes files, reaches the network or starts agents, so it
          runs when you press Run.
        </BlockMessage>
      )}
    </>
  )
}

function PinnedOutput({ output }: { output: string }) {
  return (
    <div className="border-t border-separator px-3 py-2 text-sm text-ink [&_table]:w-full [&_td]:border-t [&_td]:border-separator [&_td]:px-1 [&_th]:px-1 [&_th]:text-start">
      <p className="mb-1 text-xs text-ink-faint">Pinned output</p>
      <Markdown remarkPlugins={[remarkGfm]}>{pinnedBody(output)}</Markdown>
    </div>
  )
}

/** A live block in a note: header, source and result. */
export function LiveBlockView({ file }: { file: FileViewProps }) {
  const { node, view, getPos, setAttrs, selected } = useNodeViewContext()
  const attrs = liveBlockAttrs(node)
  const info = fenceInfo(attrs.fence)
  const code = fenceCode(attrs.fence)
  const lang = info?.lang ?? ''
  const kind = info?.kind ?? null
  const session = useBlockSession(file.client, file.path, 'document')
  useSessionBlocks(session)
  const key = blockKeyAt(view.state.doc, getPos())
  const state = useCellState(session, key ?? '')
  const { trusted } = useFolderTrust(file.client)
  const [codeShown, setCodeShown] = useState(true)
  const edit = (next: Partial<LiveBlockSource>) => setAttrs(next)
  const runs = trusted && kind !== null && key !== null
  const id = info?.id ?? null

  return (
    <div
      data-slot="live-block"
      data-selected={selected || undefined}
      className="my-3 overflow-hidden rounded-md border border-separator data-selected:border-accent"
    >
      <div
        {...controls}
        className="flex h-8 items-center gap-1.5 border-b border-separator bg-raised px-2"
      >
        <span className="font-mono text-xs text-ink-muted">{lang}</span>
        <NameField
          id={id}
          onName={(name) =>
            edit({
              fence: withFenceId(attrs.fence, name),
              ...(attrs.output !== null && {
                output: pinnedOutput(name, pinnedBody(attrs.output)),
              }),
            })
          }
        />
        <span className="me-auto" />
        {runs && <BlockStatus state={state} />}
        {runs && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => session.cell(key)?.run()}
          >
            <Play />
            {runLabel(state)}
          </Button>
        )}
        {runs && state?.status === 'ok' && (
          <Button
            variant="ghost"
            size="xs"
            disabled={id === null}
            title={
              id === null
                ? 'Name the block to pin its output'
                : 'Keep this result in the note, for readers without Theorem'
            }
            onClick={() => {
              if (id !== null) edit(withPinnedOutput(attrs, id, state.value))
            }}
          >
            <Pin />
            {attrs.output === null ? 'Pin output' : 'Update pin'}
          </Button>
        )}
        {attrs.output !== null && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => edit(withoutPinnedOutput(attrs))}
          >
            <PinOff />
            Unpin
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          aria-pressed={codeShown}
          onClick={() => setCodeShown((shown) => !shown)}
        >
          <Code />
          {codeShown ? 'Hide code' : 'Show code'}
        </Button>
      </div>
      <div {...controls}>
        {codeShown && (
          <SourceEditor
            value={code}
            onChange={(next) =>
              edit({ fence: withFenceCode(attrs.fence, next) })
            }
            lang={lang}
            workspaceId={
              runs && kind === 'code' ? file.client.workspace.id : undefined
            }
            label={`${lang} block source`}
          />
        )}
        {kind === null ? (
          <BlockMessage>
            Nothing runs {lang || 'this language'}, so this block stays as
            written.
          </BlockMessage>
        ) : !trusted ? (
          <TrustGate client={file.client} />
        ) : (
          key !== null && (
            <BlockOutput
              session={session}
              blockKey={key}
              kind={kind}
              code={code}
              state={state}
            />
          )
        )}
        {attrs.output !== null && (!runs || state?.status === 'idle') && (
          <PinnedOutput output={attrs.output} />
        )}
      </div>
    </div>
  )
}
