// SOURCING: the block frame (../blocks/block-frame: a sandboxed iframe with
// `allow-scripts` only, and its bridge over one MessagePort), the hosted App
// document (src/lib/blocks/hosted-app.ts: the same restrictive policy a
// conversation App gets, from a blob URL, so no local listener is needed),
// and the grants store, which keeps what the person allowed in this browser.
// A module runs only with a grant for its exact files.
import { Play, ShieldAlert, Square, Undo2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BlockFrame } from '@/components/blocks/block-frame'
import { BlockMessage } from '@/components/blocks/block-status'
import { Button } from '@/components/ui/button'
import type { BridgeHost, StateCollections } from '@/lib/blocks/bridge'
import { hostedAppDocument } from '@/lib/blocks/hosted-app'
import type { Rpc } from '@/lib/blocks/sandbox/protocol'
import { workspaceState } from '@/lib/blocks/state'
import type { RequestedCapabilities } from '@/lib/modules/contract'
import {
  grantFor,
  grantKey,
  granted,
  useModuleGrants,
} from '@/lib/modules/grants'
import type { ModuleDefinition, ModuleViewProps } from '@/lib/modules/registry'
import {
  allowedFrom,
  bridgeCapabilities,
  describeRequest,
  requestsOf,
  sendAction,
  sendValues,
  serveModule,
} from '@/lib/modules/sandbox'
import type { Request } from '@/lib/modules/sandbox'
import { useModuleFiles, useVaultClient } from '@/lib/modules/store'
import { useModuleActions, usePageRuntime } from './page-runtime'
import type { ModuleFiles } from '@/lib/modules/store'
import type { WorkspaceClient, WorkspaceId } from '@/lib/workspace/types'

/** State collections that reach the workspace only once a module uses one. */
function lazyState(id: WorkspaceId): StateCollections {
  const replica = () => workspaceState(id)
  return {
    snapshot: (name) => replica().snapshot(name),
    set: (name, key, value) => replica().set(name, key, value),
    delete: (name, key) => replica().delete(name, key),
    subscribe: (name, listener) => replica().subscribe(name, listener),
  }
}

export function SandboxedModule({
  definition,
  view,
}: {
  definition: ModuleDefinition
  view: ModuleViewProps
}) {
  const { client, isPending, missing } = useVaultClient()
  if (definition.implementation.kind !== 'sandboxed-html') return null
  // Nothing runs while the page is arranged: a frame would take the
  // pointer from the editor, and its code has no business running then.
  if (view.arranging) return <ArrangingSummary definition={definition} />
  if (!client)
    return (
      <BlockMessage>
        {isPending
          ? 'Opening the vault…'
          : `This module lives in the Theorem vault. ${missing}`}
      </BlockMessage>
    )
  const { folder, entry } = definition.implementation
  return (
    <VaultModule
      client={client}
      definition={definition}
      folder={folder}
      entry={entry}
      view={view}
    />
  )
}

function ArrangingSummary({ definition }: { definition: ModuleDefinition }) {
  const ports = (label: string, list: ModuleDefinition['inputs']) =>
    list.length ? `${label}: ${list.map((p) => p.label).join(', ')}` : undefined
  return (
    <div className="flex flex-col gap-1 p-3 text-xs text-ink-muted">
      <p className="text-sm text-ink">
        {definition.label} runs when you use the page.
      </p>
      {[
        ports('Takes', definition.inputs),
        ports('Gives', definition.outputs),
        ports('Sends', definition.events),
      ]
        .filter(Boolean)
        .map((line) => (
          <p key={line}>{line}</p>
        ))}
    </div>
  )
}

function VaultModule({
  client,
  definition,
  folder,
  entry,
  view,
}: {
  client: WorkspaceClient
  definition: ModuleDefinition
  folder: string
  entry: string
  view: ModuleViewProps
}) {
  const files = useModuleFiles(client, folder, entry)
  const key = grantKey(client.workspace.id, definition.id)
  const digest = files.data?.digest
  const grant = useModuleGrants((s) => grantFor(s.grants, key, digest))
  const hadGrant = useModuleGrants((s) => key in s.grants)
  const [stopped, setStopped] = useState(false)

  if (files.error)
    return <BlockMessage tone="error">{files.error.message}</BlockMessage>
  if (!files.data) return <BlockMessage>Reading the module…</BlockMessage>
  if (!grant)
    return (
      <GrantGate
        files={files.data}
        grantKeyValue={key}
        changed={hadGrant}
        folder={folder}
      />
    )
  const allowed = granted(files.data.manifest.capabilities, grant.capabilities)
  const revoke = () => useModuleGrants.getState().revoke(key)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1 border-b border-separator px-2 text-xs text-ink-faint">
        <span className="me-auto truncate">
          {stopped ? 'Stopped' : 'Running in a sandbox'}
        </span>
        {stopped ? (
          <Button variant="ghost" size="xs" onClick={() => setStopped(false)}>
            <Play />
            Run
          </Button>
        ) : (
          <Button variant="ghost" size="xs" onClick={() => setStopped(true)}>
            <Square />
            Stop
          </Button>
        )}
        <Button variant="ghost" size="xs" onClick={revoke}>
          <Undo2 />
          Revoke
        </Button>
      </div>
      {!stopped && (
        <ModuleFrameBody
          client={client}
          definition={definition}
          folder={folder}
          source={files.data.source}
          allowed={allowed}
          view={view}
        />
      )}
    </div>
  )
}

/** What the module asks for, for the person to allow all or part of. */
function GrantGate({
  files,
  grantKeyValue,
  changed,
  folder,
}: {
  files: ModuleFiles
  grantKeyValue: string
  changed: boolean
  folder: string
}) {
  const requests = useMemo(
    () => requestsOf(files.manifest.capabilities),
    [files.manifest.capabilities],
  )
  const id = (request: Request) => `${request.kind}:${request.value}`
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(requests.map(id)),
  )
  const allow = () =>
    useModuleGrants.getState().grant(grantKeyValue, {
      digest: files.digest,
      capabilities: allowedFrom(requests.filter((r) => ticked.has(id(r)))),
      grantedAt: Date.now(),
    })
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-start gap-2">
        <ShieldAlert
          className="mt-0.5 size-4 shrink-0 text-ink-muted"
          aria-hidden
        />
        <p className="text-ink-muted">
          <span className="font-medium text-ink">
            {changed
              ? `${files.manifest.label} changed since you allowed it, so it asks again.`
              : `${files.manifest.label} is code from ${folder}.`}
          </span>{' '}
          It runs in a sandbox and reaches only what you allow here. What it
          asks for is not allowed until you say so.
        </p>
      </div>
      {requests.length ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs text-ink-muted">It asks to</legend>
          {requests.map((request) => (
            <label
              key={id(request)}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={ticked.has(id(request))}
                onChange={(event) => {
                  const next = new Set(ticked)
                  if (event.target.checked) next.add(id(request))
                  else next.delete(id(request))
                  setTicked(next)
                }}
              />
              <span className="font-mono text-xs">
                {describeRequest(request)}
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-xs text-ink-muted">
          It asks for nothing beyond reading its own folder.
        </p>
      )}
      <div>
        <Button variant="outline" size="xs" onClick={allow}>
          <Play />
          {requests.length && ticked.size < requests.length
            ? 'Run with what is ticked'
            : 'Run it'}
        </Button>
      </div>
    </div>
  )
}

/** The running frame: its document, its bridge, and its values handed in. */
function ModuleFrameBody({
  client,
  definition,
  folder,
  source,
  allowed,
  view,
}: {
  client: WorkspaceClient
  definition: ModuleDefinition
  folder: string
  source: string
  allowed: RequestedCapabilities
  view: ModuleViewProps
}) {
  const runtime = usePageRuntime()
  const allowedKey = JSON.stringify(allowed)
  const netKey = JSON.stringify(allowed.net)
  const [frameDocument, setFrameDocument] = useState<{
    src?: string
    error?: string
  }>({})
  useEffect(() => {
    let active = true
    let url: string | undefined
    void hostedAppDocument(source, undefined, {
      net: JSON.parse(netKey) as string[],
    })
      .then((page) => {
        if (!active) return
        url = URL.createObjectURL(new Blob([page], { type: 'text/html' }))
        setFrameDocument({ src: url })
      })
      .catch((error: unknown) => {
        if (active)
          setFrameDocument({
            error: error instanceof Error ? error.message : String(error),
          })
      })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [source, netKey])

  const host = useMemo<BridgeHost>(
    () => ({
      client,
      capabilities: bridgeCapabilities(
        JSON.parse(allowedKey) as RequestedCapabilities,
        folder,
      ),
      state: lazyState(client.workspace.id),
      run: () => {
        throw new Error('A module does not start agents.')
      },
    }),
    [client, allowedKey, folder],
  )

  // The frame's connection outlives renders; it reads the latest view.
  const latest = useRef(view)
  useLayoutEffect(() => {
    latest.current = view
  })
  const rpc = useRef<Rpc | null>(null)
  const valuesKey = JSON.stringify({
    settings: view.settings,
    inputs: view.inputs,
  })
  useEffect(() => {
    const { settings, inputs } = latest.current
    if (rpc.current)
      void sendValues(rpc.current, { settings, inputs }).catch(() => {})
  }, [valuesKey])

  // A route's action goes to the frame; one that comes while the frame
  // starts waits for it.
  const waiting = useRef<Array<[string, unknown]>>([])
  const actionNames = useMemo(
    () => definition.actions.map((a) => a.name),
    [definition.actions],
  )
  useModuleActions(actionNames, (name, payload) => {
    if (rpc.current) void sendAction(rpc.current, name, payload).catch(() => {})
    else waiting.current.push([name, payload])
  })

  if (frameDocument.error)
    return <BlockMessage tone="error">{frameDocument.error}</BlockMessage>
  if (!frameDocument.src)
    return <BlockMessage>Starting the module…</BlockMessage>
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <BlockFrame
        src={frameDocument.src}
        host={host}
        title={definition.label}
        className="h-full [&>iframe]:min-h-full"
        onConnection={(connection) => {
          let active = true
          void connection.connected.then(
            (connected) => {
              if (!active) return
              serveModule(connected, {
                outputs: definition.outputs,
                events: definition.events,
                output: (name, value) => latest.current.output(name, value),
                emit: (name, payload) => latest.current.emit(name, payload),
                used: () => runtime.used(latest.current.path),
              })
              rpc.current = connected
              const { settings, inputs } = latest.current
              void sendValues(connected, { settings, inputs }).catch(() => {})
              for (const [name, payload] of waiting.current.splice(0))
                void sendAction(connected, name, payload).catch(() => {})
            },
            () => {},
          )
          return () => {
            active = false
            rpc.current = null
          }
        }}
      />
    </div>
  )
}
