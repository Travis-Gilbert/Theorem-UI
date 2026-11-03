// SOURCING: bun:test over the HTML app views, rendered with React into
// happy-dom (test/blocks/render.tsx) against a stand-in for the local
// server's block routes (test/blocks/local-server.ts).
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test'
import { BLOCK_SANDBOX } from '@/lib/blocks/executor'
import type { FileViewProps } from '@/lib/handlers/types'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import {
  BLOCK_ORIGIN,
  stubLocalServer,
} from '../../../test/blocks/local-server'
import type { LocalServer } from '../../../test/blocks/local-server'
import { memoryWorkspace } from '../../../test/blocks/memory-workspace'
import type { MemoryWorkspace } from '../../../test/blocks/memory-workspace'
import {
  buttonNamed,
  cleanup,
  click,
  render,
  waitFor,
} from '../../../test/blocks/render'
import {
  HtmlAppCard,
  HtmlAppPanel,
  appDeclarations,
  appLayout,
} from './html-app-handler'

let server: LocalServer
beforeAll(() => {
  server = stubLocalServer()
})
afterAll(() => server.restore())
afterEach(cleanup)

const CLOCK = `<!doctype html>
<html>
  <head>
    <meta name="theorem:uses" content='files.read("Data/*.csv"), state("clock")'>
    <title>Clock</title>
  </head>
  <body><script src="clock.js"></script></body>
</html>
`

const entry = (path: string, kind: WorkspaceEntry['kind']): WorkspaceEntry => ({
  id: `vf_${path}`,
  path,
  kind,
  size: 0,
  mtimeMs: 0,
})

/** A folder of its own for each test: app links are kept by folder and path. */
function app(
  folder: string,
  { trusted = true }: { trusted?: boolean } = {},
): MemoryWorkspace {
  return memoryWorkspace(
    {
      [`${folder}/index.html`]: CLOCK,
      [`${folder}/clock.js`]: 'document.body.append("tick")',
      'Elsewhere.md': '# Elsewhere\n',
    },
    { trusted },
  )
}

const frameIn = (root: ParentNode) =>
  root.querySelector<HTMLIFrameElement>('[data-slot="block-frame"] iframe')

test("an app's declarations come from its entry page's theorem:uses", () => {
  const { capabilities, errors } = appDeclarations(CLOCK)
  expect(errors).toEqual([])
  expect(capabilities.read).toEqual(['Data/*.csv'])
  expect(capabilities.state).toEqual(['clock'])
  expect(capabilities.net).toEqual([])
})

test('an app loads from its own folder', () => {
  expect(
    appLayout({ path: 'Apps/Clock', entry: entry('Apps/Clock', 'directory') }),
  ).toEqual({
    root: 'Apps/Clock',
    entry: 'Apps/Clock/index.html',
  })
  expect(
    appLayout({
      path: 'Apps/clock.html',
      entry: entry('Apps/clock.html', 'file'),
    }),
  ).toEqual({
    root: 'Apps',
    entry: 'Apps/clock.html',
  })
  expect(
    appLayout({ path: 'clock.html', entry: entry('clock.html', 'file') }),
  ).toEqual({
    root: '',
    entry: 'clock.html',
  })
})

test('a folder app runs in a sandboxed frame, and reloads when its files change', async () => {
  const client = app('Panel/Clock')
  const file: FileViewProps = {
    client,
    path: 'Panel/Clock',
    entry: entry('Panel/Clock', 'directory'),
  }
  const { container } = await render(<HtmlAppPanel {...file} />)

  const frame = await waitFor(() => frameIn(container))
  expect(frame.getAttribute('sandbox')).toBe(BLOCK_SANDBOX)
  expect(frame.src).toBe(
    `${BLOCK_ORIGIN}/app/token/${encodeURIComponent('Panel/Clock')}`,
  )
  expect(server.requests).toContain('POST /desktop/blocks/app-token')

  // A file elsewhere in the folder leaves the app alone.
  client.edit('Elsewhere.md', '# Still elsewhere\n')
  await new Promise((resolve) => setTimeout(resolve, 300))
  expect(frameIn(container)).toBe(frame)

  client.edit('Panel/Clock/clock.js', 'document.body.append("tock")')
  const reloaded = await waitFor(() => {
    const next = frameIn(container)
    return next !== frame && next
  })
  expect(reloaded.src).toBe(frame.src)

  await click(buttonNamed(container, 'Reload')!)
  await waitFor(() => frameIn(container) !== reloaded)
})

test('an untrusted app shows its page source and the way to trust it', async () => {
  const client = app('Locked/Clock', { trusted: false })
  const before = server.requests.length
  const { container } = await render(
    <HtmlAppPanel
      client={client}
      path="Locked/Clock/index.html"
      entry={entry('Locked/Clock/index.html', 'file')}
    />,
  )
  await waitFor(() =>
    container
      .querySelector('.cm-content')
      ?.textContent.includes('theorem:uses'),
  )
  expect(container.textContent).toContain('Test is not trusted')
  expect(frameIn(container)).toBeNull()
  expect(server.requests.slice(before)).not.toContain(
    'POST /desktop/blocks/app-token',
  )

  await click(buttonNamed(container, 'Trust this folder')!)
  await waitFor(() => frameIn(container))
})

test('a folder without index.html says it is not an app, until it has one', async () => {
  const client = memoryWorkspace({ 'Notes/Today.md': '# Today\n' })
  const { container } = await render(
    <HtmlAppPanel
      client={client}
      path="Notes"
      entry={entry('Notes', 'directory')}
    />,
  )
  await waitFor(() => container.textContent.includes('has no index.html'))
  expect(frameIn(container)).toBeNull()

  client.edit('Notes/index.html', CLOCK)
  await waitFor(() => frameIn(container))
  expect(container.textContent).not.toContain('has no index.html')
})

test('a card shows the app up close and its name far out', async () => {
  const client = app('Canvas/Clock')
  const file: FileViewProps = {
    client,
    path: 'Canvas/Clock',
    entry: entry('Canvas/Clock', 'directory'),
  }
  const { container, rerender } = await render(
    <HtmlAppCard {...file} zoom={0.2} selected={false} />,
  )
  expect(container.textContent).toContain('Clock')
  expect(container.querySelector('iframe')).toBeNull()

  await rerender(<HtmlAppCard {...file} zoom={0.5} selected={false} />)
  await waitFor(() => frameIn(container))
})
