// The page side of scripts/e2e/app-ts.mjs: the real App view over an App
// document held in memory (test/blocks/app-documents.ts), so the build, the
// checker worker, the frame and the bridge are the app's own and no Theorem
// server is needed.
import { createRoot } from 'react-dom/client'
import { DocumentAppView } from '@/components/blocks/document-app'
import { useComposerReferences } from '@/components/chat/composer-references'
import { checkInWorker } from '@/lib/blocks/app-checker'
import { appSourcesOf } from '@/lib/blocks/app-source'
import { AppDocument } from '@/lib/theorem/apps'
import { appDocumentFixture } from '../../../test/blocks/app-documents'

const store = await appDocumentFixture()
const app = new AppDocument('app-document', store.api, store.change)

async function revise(html: string): Promise<void> {
  await store.remote(html)
  await app.load()
}

async function clear(): Promise<void> {
  const root = await navigator.storage.getDirectory()
  for await (const name of root.keys())
    if (name.startsWith('theorem-app.'))
      await root.removeEntry(name, { recursive: true })
}

/** One check in the checker worker, with what it cost. */
async function check(html: string) {
  const result = await checkInWorker(appSourcesOf(html)!)
  return {
    problems: result.problems.length,
    ms: result.durationMs,
    memoryBytes: result.memoryBytes,
  }
}

const references = () => useComposerReferences.getState().take()

function show(): void {
  createRoot(document.getElementById('view')!).render(
    <DocumentAppView app={app} initiallyRunning />,
  )
}

Object.assign(window, { oracle: { revise, clear, references, show, check } })
