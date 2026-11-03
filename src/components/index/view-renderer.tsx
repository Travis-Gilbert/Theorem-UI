// SOURCING: @openuidev/react-lang Renderer (Root, Content, QueryError, Retry slots) running a stored view program with no model in the loop; its function-map toolProvider over the view's bindings (./bindings); useTriggerAction with `run` steps (OpenUI's @Run) to read queries again after filing changes
import { Renderer, useTriggerAction } from '@openuidev/react-lang'
import type { ActionEvent, OpenUIError } from '@openuidev/react-lang'
import { useEffect, useMemo, useRef, useState } from 'react'
import { runBinding } from './api'
import { bindingTools } from './bindings'
import type { Operation, PreferenceStatement, ViewCandidate } from './contract'
import { IndexHostContext, PREVIEW_HOST, indexLibrary } from './library'
import type { IndexHost } from './library'
import { useCollections, useMaterialChanged } from './queries'

/** What a view's controls may do, each gated by an operation the view names. */
export type ViewActions = {
  ask: (prompt: string, documentIds: string[]) => void
  pin: () => void
  prefer: (
    statement: PreferenceStatement,
    documentIds: string[],
    value?: string,
  ) => void
}

const ACTION_OPERATION: Record<string, Operation> = {
  OpenItem: 'open_item',
  AskTheorem: 'ask_theorem',
  continue_conversation: 'ask_theorem',
  PinView: 'pin_view',
  SetPreference: 'set_preference',
}

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []

/**
 * Renders one view definition: its program, against its bindings, with its
 * operations. Every binding call goes to Theorem; nothing here asks a model.
 */
export function ViewRenderer({
  definition,
  host: given,
  actions,
  onErrors,
}: {
  definition: Pick<ViewCandidate, 'program' | 'bindings' | 'operations'>
  host?: IndexHost
  actions?: ViewActions
  onErrors?: (errors: OpenUIError[]) => void
}) {
  const { program, bindings, operations } = definition
  // A preview opens and records nothing, but still names collections.
  const collections = useCollections()
  const host = given ?? {
    ...PREVIEW_HOST,
    collectionName: (id: string) =>
      collections.data?.find((c) => c.collectionId === id)?.name,
  }
  const tools = useMemo(() => bindingTools(bindings, runBinding), [bindings])
  const [queries, setQueries] = useState<string[]>([])

  const onAction = (event: ActionEvent) => {
    const operation = ACTION_OPERATION[event.type]
    if (event.type === 'open_url') {
      const target = String(event.params.url ?? '')
      if (/^https?:\/\//.test(target))
        window.open(target, '_blank', 'noopener,noreferrer')
      return
    }
    if (!operation || !operations.includes(operation) || !actions) return
    const params = event.params
    switch (event.type) {
      case 'OpenItem':
        return host.openItem(String(params.documentId))
      case 'AskTheorem':
        return actions.ask(String(params.prompt), strings(params.documentIds))
      case 'continue_conversation':
        return actions.ask(event.humanFriendlyMessage, [])
      case 'PinView':
        return actions.pin()
      case 'SetPreference':
        return actions.prefer(
          params.statement as PreferenceStatement,
          strings(params.documentIds),
          typeof params.value === 'string' ? params.value : undefined,
        )
    }
  }

  return (
    <IndexHostContext.Provider value={host}>
      <Renderer.Root
        // A changed program is a different view; its $variables start over.
        key={program}
        response={program}
        library={indexLibrary}
        toolProvider={tools}
        onAction={onAction}
        onError={onErrors}
        onParseResult={(parsed) => {
          const ids = parsed?.queryStatements.map((q) => q.statementId) ?? []
          setQueries((held) => (held.join() === ids.join() ? held : ids))
        }}
        publishObservability={false}
      >
        <RereadAfterFiling queries={queries} />
        <Renderer.QueryError>
          <QueryFailure />
        </Renderer.QueryError>
        <Renderer.Content />
      </Renderer.Root>
    </IndexHostContext.Provider>
  )
}

/** Runs every Query again when a filing, move or undo succeeds anywhere. */
function RereadAfterFiling({ queries }: { queries: string[] }) {
  const trigger = useTriggerAction()
  const changed = useMaterialChanged()
  const seen = useRef(changed)
  useEffect(() => {
    if (changed === seen.current) return
    seen.current = changed
    void trigger('', undefined, {
      steps: queries.map((statementId) => ({
        type: 'run',
        statementId,
        refType: 'query',
      })),
    })
  }, [changed, queries, trigger])
  return null
}

function QueryFailure() {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-ochre/40 bg-ochre/8 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">
        Part of this view could not be read from Theorem.
      </span>
      <Renderer.Retry className="text-sm font-medium underline-offset-2 hover:underline disabled:opacity-50">
        Try again
      </Renderer.Retry>
    </div>
  )
}

/** OpenUI errors as plain sentences, for the editor and the review dialog. */
export const describeRenderErrors = (errors: OpenUIError[]) =>
  errors
    .filter((error) => error.severity !== 'warning')
    .map((error) =>
      error.statementId
        ? `${error.statementId}: ${error.message}`
        : error.message,
    )
