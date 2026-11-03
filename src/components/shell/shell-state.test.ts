// SOURCING: bun:test over the zustand shell store, as the shell reads it.
import { expect, test } from 'bun:test'
import { useShell } from './shell-state'

test('showing the files opens the navigator on a desktop and asks the phone drawer once', () => {
  useShell.setState({ filesShown: false, panelCollapsed: { chat: true } })
  useShell.getState().showFiles()
  const shell = useShell.getState()
  expect(shell.filesShown).toBe(true)
  expect(shell.panelCollapsed.chat).toBe(false)
  expect(shell.filesRequested).toBe(true)
  // The request is for the drawer open now, not one after a reload.
  const saved = JSON.parse(localStorage.getItem('theorem-ui:shell') ?? '{}')
  expect(saved.state).not.toHaveProperty('filesRequested')
})
