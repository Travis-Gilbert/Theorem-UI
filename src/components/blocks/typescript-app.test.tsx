// SOURCING: bun:test over the App view (document-app.tsx) for an App built
// from TypeScript source: esbuild-wasm builds it, tsrs's Node build checks it,
// and test/blocks/app-frame.ts stands in for the frame.
import { act } from 'react'
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { tsc } from '@tsrs/wasm'
import * as esbuild from 'esbuild-wasm'
import { useComposerReferences } from '@/components/chat/composer-references'
import { checkAppSources } from '@/lib/blocks/app-check'
import * as checker from '@/lib/blocks/app-checker'
import * as hosted from '@/lib/blocks/hosted-app'
import { call } from '@/lib/blocks/sandbox/protocol'
import type { PageMethods } from '@/lib/blocks/sandbox/protocol'
import { AppDocument } from '@/lib/theorem/apps'
import { appDocumentFixture } from '../../../test/blocks/app-documents'
import { connectAppFrame } from '../../../test/blocks/app-frame'
import { checkLibraryFromDisk } from '../../../test/blocks/check-library'
import {
  buttonNamed,
  cleanup,
  click,
  render,
  waitFor,
} from '../../../test/blocks/render'
import { typescriptApp } from '../../../test/blocks/typescript-app'
import { DocumentAppView } from './document-app'

const originalHosted = hosted.hostedAppDocument
const library = checkLibraryFromDisk()
let stubs: Array<{ mockRestore: () => void }> = []

beforeEach(() => {
  useComposerReferences.getState().take()
  stubs = [
    spyOn(hosted, 'hostedAppDocument').mockImplementation((html) =>
      originalHosted(html, esbuild),
    ),
    spyOn(checker, 'checkInWorker').mockImplementation((sources) =>
      checkAppSources(sources, tsc, library),
    ),
  ]
})
afterEach(async () => {
  await cleanup()
  for (const stub of stubs) stub.mockRestore()
})

const GOOD = typescriptApp({
  'main.ts': `const greeting: string = 'Hello'
document.getElementById('root')!.textContent = greeting`,
})
const WRONG_TYPE = typescriptApp({
  'main.ts': `const greeting: number = 'Hello'
document.getElementById('root')!.textContent = String(greeting)`,
})
const BROKEN = typescriptApp({
  'main.ts': `const greeting: string = 'Hello'
const = 2`,
})
const THROWS = typescriptApp({
  'main.ts': `import { load } from './load'
load()`,
  'load.ts': `export function load(): never {
  // The second line of this file is where it goes wrong.
  throw new TypeError('No records')
}`,
})

async function running(html: string) {
  const store = await appDocumentFixture()
  await store.remote(html)
  const app = new AppDocument('app-document', store.api, store.change)
  const { container } = await render(<DocumentAppView app={app} />)
  await waitFor(() => buttonNamed(container, 'Run App'))
  await click(buttonNamed(container, 'Run App')!)
  return { store, app, container }
}
const problems = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-slot="app-problems"] li')].map(
    (item) => item.textContent,
  )
const revise = async (
  { store, app }: Awaited<ReturnType<typeof running>>,
  html: string,
) => {
  await store.remote(html)
  await act(() => app.load())
}

test('an App built from TypeScript source runs, and a clean check says nothing', async () => {
  const { container } = await running(GOOD)
  await waitFor(() => container.querySelector('iframe'), 20_000)
  await waitFor(() => !container.textContent.includes('Checking types'), 20_000)
  expect(container.querySelector('[data-slot="app-problems"]')).toBeNull()
}, 60_000)

test('a type error is listed at its place while the App runs', async () => {
  const { container } = await running(WRONG_TYPE)
  await waitFor(() => problems(container).length > 0, 20_000)
  expect(container.querySelector('iframe')).not.toBeNull()
  expect(problems(container)).toHaveLength(1)
  expect(problems(container)[0]).toContain('Types')
  expect(problems(container)[0]).toContain('main.ts:1:7')
  expect(problems(container)[0]).toContain('TS2322')
}, 60_000)

test('a revision that does not build keeps the last one running and says why', async () => {
  const view = await running(GOOD)
  const { container } = view
  const frame = await waitFor(() => container.querySelector('iframe'), 20_000)
  await revise(view, BROKEN)
  await waitFor(() => problems(container).length > 0, 20_000)
  expect(container.querySelector('iframe')).toBe(frame)
  expect(frame.isConnected).toBe(true)
  expect(container.textContent).toContain(
    'Showing the last revision that built',
  )
  expect(problems(container)[0]).toContain('Build')
  expect(problems(container)[0]).toContain('main.ts:2')

  // The agent is handed the revision that failed and what failed in it.
  await click(buttonNamed(container, 'Ask to fix')!)
  const [reference] = useComposerReferences.getState().take()
  expect(reference).toMatchObject({
    label: 'Comparison: fix 1 problem',
    location: {
      revision: '3',
      resource: { objectId: 'app-document', objectType: 'theorem.app' },
    },
  })
  const { repair } = JSON.parse(reference!.excerpt!) as {
    repair: { problems: Array<{ kind: string; file: string; line: number }> }
  }
  expect(repair.problems).toEqual([
    expect.objectContaining({ kind: 'build', file: 'main.ts', line: 2 }),
  ])

  // The repaired revision replaces the frame and the problems go.
  await revise(view, GOOD.replace('Hello', 'Hello again'))
  await waitFor(() => container.querySelector('iframe') !== frame, 20_000)
  await waitFor(() => problems(container).length === 0, 20_000)
  expect(frame.isConnected).toBe(false)
}, 90_000)

test('a plain HTML revision does not keep an earlier revision on screen', async () => {
  const view = await running(GOOD)
  const { container } = view
  const frame = await waitFor(() => container.querySelector('iframe'), 20_000)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  stubs[0]!.mockRestore()
  stubs[0] = spyOn(hosted, 'hostedAppDocument').mockImplementation(
    async (html) => {
      await gate
      return originalHosted(html, esbuild)
    },
  )
  await revise(view, '<p>Plain</p>')
  expect(frame.isConnected).toBe(false)
  expect(container.querySelector('iframe')).toBeNull()
  await act(async () => release())
  await waitFor(() => container.querySelector('iframe'), 20_000)
}, 60_000)

test('what the App throws is listed at the line of the source file that threw it', async () => {
  const { container } = await running(THROWS)
  const { rpc, close } = await connectAppFrame(container)
  try {
    // Where the bundle has the throw, as the frame's document counts lines.
    const page = await originalHosted(THROWS, esbuild)
    const lines = page.split('\n')
    const line = lines.findIndex(
      (text) =>
        text.includes("TypeError('No records')") ||
        text.includes('TypeError("No records")'),
    )
    expect(line).toBeGreaterThan(0)
    const column = lines[line]!.indexOf('throw') + 1
    await act(() =>
      call<PageMethods, 'frame.error'>(rpc, 'frame.error', {
        name: 'TypeError',
        message: 'Uncaught TypeError: No records',
        line: line + 1,
        column,
      }),
    )
    await waitFor(() =>
      problems(container).some((text) => text.includes('Running')),
    )
    const thrown = problems(container).find((text) => text.includes('Running'))
    expect(thrown).toContain('load.ts:3')
    expect(thrown).toContain('TypeError: No records')
    // The same failure again is not a second problem.
    await act(() =>
      call<PageMethods, 'frame.error'>(rpc, 'frame.error', {
        name: 'TypeError',
        message: 'Uncaught TypeError: No records',
        line: line + 1,
        column,
      }),
    )
    expect(
      problems(container).filter((text) => text.includes('Running')),
    ).toHaveLength(1)
  } finally {
    close()
  }
}, 60_000)
