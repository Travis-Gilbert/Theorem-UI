// SOURCING: bun:test over the shell state's persistence, against happy-dom's
// localStorage.
import { expect, test } from 'bun:test'
import { useShell } from './shell-state'

test('a reload opens the panel on its own list, not the files', async () => {
  localStorage.setItem(
    'theorem-ui:shell',
    JSON.stringify({
      state: { filesShown: true, explorerOpen: false },
      version: 3,
    }),
  )
  await useShell.persist.rehydrate()
  expect(useShell.getState().filesShown).toBe(false)
  expect(useShell.getState().explorerOpen).toBe(false)

  useShell.getState().setFilesShown(true)
  const saved = JSON.parse(localStorage.getItem('theorem-ui:shell')!)
  expect(saved.state.filesShown).toBeUndefined()
  localStorage.removeItem('theorem-ui:shell')
})
