// SOURCING: bun:test over the module store's hooks, rendered with React into
// happy-dom (test/workspace's render, which supplies a QueryClient) against
// test/workspace's fake vault, which answers the SDK Files contract and
// sends its events.
import { afterEach, expect, test } from 'bun:test'
import {
  cleanup,
  fakeWorkspace,
  render,
  waitFor,
} from '../../../test/workspace'
import type { WorkspaceClient } from '@/lib/workspace/types'
import { useModuleCatalog } from './registry'
import { newModuleFiles, useInstalledModules } from './store'

afterEach(cleanup)

// The browser check found an open page swapped for its loading state, and
// what was being arranged lost, when a module was saved from it: the
// catalog went back to pending while the new manifest was read.
test('a module arriving later does not make the catalog pending again', async () => {
  const fake = fakeWorkspace({
    'Modules/first/module.json': newModuleFiles('vault.first', 'First')
      .manifest,
  })
  const seen: boolean[] = []
  function Probe({ client }: { client: WorkspaceClient }) {
    seen.push(useInstalledModules(client).isPending)
    return null
  }
  await render(<Probe client={fake.client} />)
  await waitFor(() => seen.at(-1) === false)
  const ready = seen.length

  await fake.external(
    'Modules/second/module.json',
    newModuleFiles('vault.second', 'Second').manifest,
  )
  await waitFor(() =>
    useModuleCatalog.getState().installed.some((m) => m.id === 'vault.second'),
  )
  expect(seen.slice(ready - 1)).not.toContain(true)
})
