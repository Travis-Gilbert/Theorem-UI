// The page side of scripts/e2e/app-db.mjs: it mounts a hosted App the way the
// app does (the hosted document, the block sandbox, the frame connection and
// the App's databases), without a signed-in Theorem behind it.
import { documentAppDatabases } from '@/lib/blocks/app-db'
import { parseHtmlDeclarations } from '@/lib/blocks/declarations'
import { pinnedAppHost, pinnedAppState } from '@/lib/blocks/document-app'
import { BLOCK_SANDBOX, FrameConnection } from '@/lib/blocks/executor'
import { hostedAppDocument } from '@/lib/blocks/hosted-app'

const mounted = new Map<string, () => void>()

async function mount(
  id: string,
  html: string,
  options: { documentId: string; writable?: boolean },
): Promise<void> {
  const declarations = parseHtmlDeclarations(
    [
      ...new DOMParser()
        .parseFromString(html, 'text/html')
        .querySelectorAll('meta[name="theorem:uses"]'),
    ].map((meta) => meta.getAttribute('content') ?? ''),
  )
  if (declarations.errors.length)
    throw new Error(declarations.errors.join('; '))
  const state = pinnedAppState(null)
  await state.ready
  const databases = documentAppDatabases(options.documentId, {
    writable: options.writable ?? true,
  })
  const page = await hostedAppDocument(html)
  const url = URL.createObjectURL(new Blob([page], { type: 'text/html' }))
  const frame = document.createElement('iframe')
  frame.name = id
  frame.setAttribute('sandbox', BLOCK_SANDBOX)
  frame.referrerPolicy = 'no-referrer'
  const connection = new FrameConnection(
    frame,
    pinnedAppHost(
      html,
      options.documentId,
      declarations.capabilities,
      state.state,
      databases,
    ),
  )
  frame.src = url
  document.getElementById('frames')!.append(frame)
  await connection.connected
  mounted.set(id, () => {
    connection.dispose()
    databases.dispose()
    state.dispose()
    frame.remove()
    URL.revokeObjectURL(url)
  })
}

function unmount(id: string): void {
  mounted.get(id)?.()
  mounted.delete(id)
}

async function clear(): Promise<void> {
  const root = await navigator.storage.getDirectory()
  for await (const name of root.keys())
    if (String(name).startsWith('theorem-app.'))
      await root.removeEntry(name, { recursive: true })
}

Object.assign(window, { oracle: { mount, unmount, clear } })
