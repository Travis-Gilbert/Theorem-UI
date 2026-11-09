// SOURCING: bun:test over attachToSideTerminal and the shell's zustand state;
// no terminal is drawn.
import { afterEach, expect, test } from 'bun:test'
import type { TheoremContextReference } from '@theoremharness/sdk'
import { useShell } from '@/components/shell/shell-state'
import { attachToSideTerminal } from './side-terminal'
import { nextTurnReferences } from './terminal-screen'

const reference = {
  label: 'main.rs',
  location: { resource: { kind: 'file', path: 'src/main.rs' } },
} as unknown as TheoremContextReference

const initial = useShell.getState()
afterEach(() => useShell.setState(initial, true))

test('Add to chat opens the right-hand terminal, starting a tab when there is none', () => {
  useShell.setState({ sideDrawer: undefined, terminalTabs: {} })
  attachToSideTerminal('p1', reference)
  const state = useShell.getState()
  expect(state.sideDrawer).toBe('terminal')
  expect(state.terminalTabs.p1?.tabs).toHaveLength(1)
  const active = state.terminalTabs.p1?.active
  expect(active).toBe(state.terminalTabs.p1?.tabs[0]?.id)
  expect(nextTurnReferences(active!)).toEqual([reference])
})

test('Add to chat keeps to the active tab when the project has tabs', () => {
  useShell.setState({ sideDrawer: undefined, terminalTabs: {} })
  useShell.getState().openTerminalTab('p1')
  useShell.getState().openTerminalTab('p1')
  const before = useShell.getState().terminalTabs.p1
  attachToSideTerminal('p1', reference)
  const after = useShell.getState().terminalTabs.p1
  expect(after).toEqual(before)
  expect(useShell.getState().sideDrawer).toBe('terminal')
  expect(nextTurnReferences(after!.active)).toEqual([reference])
  const other = after!.tabs.find((tab) => tab.id !== after!.active)
  expect(nextTurnReferences(other!.id)).toEqual([])
})
