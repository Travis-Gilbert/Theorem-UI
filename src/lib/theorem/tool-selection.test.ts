// SOURCING: bun:test over the pure selection rules and the persisted per-thread store
import { beforeEach, expect, test } from 'bun:test'
import {
  changeSelection,
  connectionTurnOptions,
  connectionsOn,
  reconcile,
  toolId,
  toolSelectionTurnOptions,
  toolsOn,
  useToolSelections,
} from './tool-selection'
import type { RosterGroup } from './tool-selection'

const roster: RosterGroup[] = [
  {
    connectionId: 'github',
    enabled: true,
    tools: [{ name: 'search_issues' }, { name: 'create_issue' }],
  },
  { connectionId: 'mcp:abc', enabled: true, tools: [{ name: 'search' }] },
  { connectionId: 'mcp:off', enabled: false, tools: [{ name: 'noop' }] },
]

beforeEach(() => {
  useToolSelections.setState({ byThread: {} })
})

test('with no selection every enabled connection and all of its tools are on', () => {
  expect([...connectionsOn(roster, undefined)]).toEqual(['github', 'mcp:abc'])
  expect([...toolsOn(roster, undefined)]).toEqual([
    'github/search_issues',
    'github/create_issue',
    'mcp:abc/search',
  ])
})

test('the default sends nothing at all', () => {
  expect(toolSelectionTurnOptions(undefined)).toEqual({})
  expect(reconcile(roster, undefined)).toBeUndefined()
})

test('turning a connection off narrows the turn to the others', () => {
  const selection = changeSelection(roster, undefined, {
    connection: 'github',
    on: false,
  })
  expect(selection).toEqual({ connections: ['mcp:abc'] })
  expect(toolSelectionTurnOptions(selection)).toEqual({
    toolSelection: { connections: ['mcp:abc'] },
  })
})

test('turning one tool off keeps its connection and lists every tool that stays', () => {
  const selection = changeSelection(roster, undefined, {
    tool: toolId('github', 'create_issue'),
    on: false,
  })
  expect(selection).toEqual({
    connections: ['github', 'mcp:abc'],
    tools: ['github/search_issues', 'mcp:abc/search'],
  })
})

test('putting everything back is the default again, so nothing is sent', () => {
  const narrowed = changeSelection(roster, undefined, {
    connection: 'github',
    on: false,
  })
  expect(
    changeSelection(roster, narrowed, { connection: 'github', on: true }),
  ).toBeUndefined()

  const oneTool = changeSelection(roster, undefined, {
    tool: 'mcp:abc/search',
    on: false,
  })
  expect(
    changeSelection(roster, oneTool, { tool: 'mcp:abc/search', on: true }),
  ).toBeUndefined()
})

test('a connection switched off in Settings cannot be turned on for one conversation', () => {
  expect(
    changeSelection(roster, undefined, { connection: 'mcp:off', on: true }),
  ).toBeUndefined()
  const narrowed = changeSelection(roster, undefined, {
    connection: 'github',
    on: false,
  })
  expect(
    changeSelection(roster, narrowed, { connection: 'mcp:off', on: true }),
  ).toEqual({ connections: ['mcp:abc'] })
})

test('every connection off is a choice, not the default', () => {
  const none = changeSelection(
    roster,
    changeSelection(roster, undefined, { connection: 'github', on: false }),
    { connection: 'mcp:abc', on: false },
  )
  expect(none).toEqual({ connections: [] })
  expect(connectionsOn(roster, none).size).toBe(0)
})

test('a connection or tool that no longer exists drops out of a stored choice', () => {
  expect(
    reconcile(roster, {
      connections: ['github', 'mcp:gone'],
      tools: ['github/search_issues', 'github/removed', 'mcp:gone/search'],
    }),
  ).toEqual({ connections: ['github'], tools: ['github/search_issues'] })
  // What was stored is all that is left of the default, so it clears.
  expect(
    reconcile(roster, { connections: ['github', 'mcp:abc', 'mcp:gone'] }),
  ).toBeUndefined()
})

test('a choice is kept per conversation and cleared with the default', () => {
  const { set } = useToolSelections.getState()
  set('t1', { connections: ['github'] })
  set('t2', { connections: [] })
  expect(useToolSelections.getState().byThread).toEqual({
    t1: { connections: ['github'] },
    t2: { connections: [] },
  })
  set('t1', undefined)
  expect(useToolSelections.getState().byThread).toEqual({
    t2: { connections: [] },
  })
})

test('only the newest 200 conversations keep a choice', () => {
  const { set } = useToolSelections.getState()
  for (let index = 0; index < 205; index += 1)
    set(`t${index}`, { connections: [] })
  const kept = Object.keys(useToolSelections.getState().byThread)
  expect(kept).toHaveLength(200)
  expect(kept).not.toContain('t0')
  expect(kept).toContain('t204')
})

test("a new conversation's choice moves to its durable id and is read from there", () => {
  const { set } = useToolSelections.getState()
  set('local-1', { connections: ['github'] })
  expect(connectionTurnOptions('local-1', 'durable-1')).toEqual({
    toolSelection: { connections: ['github'] },
  })
  expect(useToolSelections.getState().byThread).toEqual({
    'durable-1': { connections: ['github'] },
  })
})

test('a durable id that already has a choice keeps it', () => {
  const { set } = useToolSelections.getState()
  set('local-1', { connections: ['github'] })
  set('durable-1', { connections: [] })
  expect(connectionTurnOptions('local-1', 'durable-1')).toEqual({
    toolSelection: { connections: [] },
  })
})

test('with no choice for the conversation a turn carries nothing', () => {
  expect(connectionTurnOptions('local-1', 'durable-1')).toEqual({})
  expect(connectionTurnOptions('local-1', undefined)).toEqual({})
})
