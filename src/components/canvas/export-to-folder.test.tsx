// SOURCING: bun:test over the Spaces canvas's "Export to folder" control,
// rendered with React into happy-dom. The writing itself is
// space-export.test.ts's.
import { afterEach, describe, expect, mock, test } from 'bun:test'
import { act } from 'react'
import type { Theorem } from '@/lib/theorem/client'
import type { WorkspaceSummary } from '@/lib/workspace/types'
import { WORKSPACES_KEY } from '@/lib/workspace/workspaces'
import { cleanup, render, settle, waitFor } from '../../../test/workspace'

void mock.module('@/components/icons', () => ({
  Icon: new Proxy({}, { get: () => () => null }),
}))
const { ExportToFolder } = await import('./export-to-folder')

afterEach(cleanup)

const space = {
  role: 'project',
  format: 1,
  id: 'space:project:p',
  title: 'Plans',
  project: { kind: 'project', id: 'p' },
  placements: [],
  connections: [],
} as Theorem.Space

const folder = (id: string, name: string): WorkspaceSummary => ({
  id,
  name,
  path: `/tmp/${name}`,
  trusted: false,
  policy: 'LocalOnly',
})

describe('ExportToFolder', () => {
  test('is not there without an open folder', async () => {
    const { container } = await render(<ExportToFolder title="Plans" space={space} />)
    expect(container.textContent).not.toContain('Export to folder')
  })

  test('offers each open folder', async () => {
    const { container, queryClient } = await render(
      <ExportToFolder title="Plans" space={space} />,
    )
    act(() =>
      queryClient.setQueryData(WORKSPACES_KEY, [
        folder('ws_a', 'Vault'),
        folder('ws_b', 'Work'),
      ]),
    )
    const trigger = await waitFor(() =>
      [...container.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Export to folder'),
      ),
    )
    act(() => trigger.click())
    const items = await waitFor(() => {
      const found = [...document.querySelectorAll('[role="menuitem"]')]
      return found.length ? found : null
    })
    expect(items.map((i) => i.textContent)).toEqual(['Vault', 'Work'])
    // Let the popup finish placing itself inside act.
    await settle()
  })
})
