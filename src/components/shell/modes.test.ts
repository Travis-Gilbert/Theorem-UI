// SOURCING: bun:test over the modes' own-view rules.
import { expect, test } from 'bun:test'
import { MODES, filesUnderPanel } from './modes'

test('the file tree sits under the panels of the modes with their own view', () => {
  for (const mode of ['index', 'pages', 'spaces', 'canvas'] as const)
    expect(filesUnderPanel(mode)).toBe(true)
})

test('Notes keeps its own folders, so its Trash closes the panel', () => {
  expect(filesUnderPanel('notes')).toBe(false)
})

test('beside the threads the files fold into the panel instead', () => {
  const others = MODES.map((entry) => entry.mode).filter(
    (mode) => !['index', 'pages', 'spaces', 'canvas', 'notes'].includes(mode),
  )
  for (const mode of others) expect(filesUnderPanel(mode)).toBe(false)
})
