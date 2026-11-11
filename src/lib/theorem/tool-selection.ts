// SOURCING: zustand and its persist middleware (the per-thread choice kept across visits, as lib/life/store keeps its controls); the selection rules themselves are pure logic over the roster GET /api/connections/v1/tools answers, so no upstream component applies
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Which connections' tools one conversation may use, as the contract's
 * `toolSelection` turn field carries it. No selection at all is the default:
 * every enabled connection, with nothing sent. `tools`, when present, names
 * `connectionId/toolName` ids and narrows the selected connections to those.
 */
export type ToolSelection = { connections: string[]; tools?: string[] }

/** The part of a tool group the rules need. */
export type RosterGroup = {
  connectionId: string
  /** Switched on in Settings; a group that is not cannot be turned on here. */
  enabled: boolean
  tools: readonly { name: string }[]
}

export const toolId = (connectionId: string, name: string) =>
  `${connectionId}/${name}`

export type SelectionChange =
  | { connection: string; on: boolean }
  | { tool: string; on: boolean }

/** The connections a selection turns on; with none, every enabled one. */
export function connectionsOn(
  roster: readonly RosterGroup[],
  selection: ToolSelection | undefined,
): Set<string> {
  const chosen = selection && new Set(selection.connections)
  return new Set(
    roster
      .filter((group) => group.enabled && (!chosen || chosen.has(group.connectionId)))
      .map((group) => group.connectionId),
  )
}

/** The tools a selection leaves available, as `connectionId/toolName` ids. */
export function toolsOn(
  roster: readonly RosterGroup[],
  selection: ToolSelection | undefined,
): Set<string> {
  const on = connectionsOn(roster, selection)
  const named = selection?.tools && new Set(selection.tools)
  const ids = new Set<string>()
  for (const group of roster) {
    if (!on.has(group.connectionId)) continue
    for (const tool of group.tools) {
      const id = toolId(group.connectionId, tool.name)
      if (!named || named.has(id)) ids.add(id)
    }
  }
  return ids
}

/**
 * Builds the selection that leaves exactly these connections and tools on, or
 * undefined when that is the default, so a person who changes their mind back
 * sends nothing again.
 */
function build(
  roster: readonly RosterGroup[],
  connections: ReadonlySet<string>,
  tools: ReadonlySet<string>,
): ToolSelection | undefined {
  const listed = roster.filter((group) => connections.has(group.connectionId))
  const everyTool = listed.every((group) =>
    group.tools.every((tool) => tools.has(toolId(group.connectionId, tool.name))),
  )
  const isDefault =
    everyTool &&
    listed.length === connections.size &&
    listed.length === roster.filter((group) => group.enabled).length
  if (isDefault) return undefined
  return {
    connections: listed.map((group) => group.connectionId),
    ...(everyTool
      ? {}
      : {
          tools: listed.flatMap((group) =>
            group.tools
              .map((tool) => toolId(group.connectionId, tool.name))
              .filter((id) => tools.has(id)),
          ),
        }),
  }
}

/** The selection after the person turns a connection or one of its tools on or off. */
export function changeSelection(
  roster: readonly RosterGroup[],
  selection: ToolSelection | undefined,
  change: SelectionChange,
): ToolSelection | undefined {
  const connections = connectionsOn(roster, selection)
  const tools = toolsOn(roster, selection)
  if ('connection' in change) {
    const group = roster.find((entry) => entry.connectionId === change.connection)
    if (!group || (change.on && !group.enabled)) return build(roster, connections, tools)
    for (const tool of group.tools) {
      const id = toolId(group.connectionId, tool.name)
      if (change.on) tools.add(id)
      else tools.delete(id)
    }
    if (change.on) connections.add(group.connectionId)
    else connections.delete(group.connectionId)
  } else if (change.on) tools.add(change.tool)
  else tools.delete(change.tool)
  return build(roster, connections, tools)
}

/** A stored selection rewritten against the roster as it is now: ids that are gone drop out. */
export const reconcile = (
  roster: readonly RosterGroup[],
  selection: ToolSelection | undefined,
) =>
  build(roster, connectionsOn(roster, selection), toolsOn(roster, selection))

/** The turn field for a selection: nothing at all for the default. */
export const toolSelectionTurnOptions = (
  selection: ToolSelection | undefined,
): { toolSelection?: ToolSelection } =>
  selection ? { toolSelection: selection } : {}

/** Threads whose choice is kept; the oldest go first. */
const KEPT = 200

type SelectionStore = {
  byThread: Record<string, ToolSelection>
  set: (threadId: string, selection: ToolSelection | undefined) => void
  /** A new conversation's choice moves to its durable id once it has one. */
  adopt: (from: string, to: string) => void
}

export const useToolSelections = create<SelectionStore>()(
  persist(
    (set) => ({
      byThread: {},
      set: (threadId, selection) =>
        set(({ byThread }) => {
          const { [threadId]: _dropped, ...rest } = byThread
          if (!selection) return { byThread: rest }
          const kept = Object.entries({ ...rest, [threadId]: selection }).slice(-KEPT)
          return { byThread: Object.fromEntries(kept) }
        }),
      adopt: (from, to) =>
        set(({ byThread }) => {
          const { [from]: moved, ...rest } = byThread
          return moved && !rest[to] ? { byThread: { ...rest, [to]: moved } } : {}
        }),
    }),
    { name: 'theorem-ui:tool-selection', version: 1 },
  ),
)

/**
 * The turn field for the open conversation, read at each send, edit and retry.
 * A conversation that was new when the choice was made has its durable id by
 * the time it sends, so the choice moves there first.
 */
export function connectionTurnOptions(
  localId: string,
  remoteId: string | undefined,
): { toolSelection?: ToolSelection } {
  const { adopt } = useToolSelections.getState()
  if (remoteId && remoteId !== localId) adopt(localId, remoteId)
  return toolSelectionTurnOptions(
    useToolSelections.getState().byThread[remoteId ?? localId],
  )
}
