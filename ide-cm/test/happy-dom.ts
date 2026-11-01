// Gives bun test a browser DOM, which a CodeMirror EditorView needs. Bun keeps its own
// fetch API and streams, as in the repo root's preload.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

const bunFetchApi = { fetch, Request, Response, Headers, AbortController, AbortSignal, Blob, File, FormData }

GlobalRegistrator.register()

for (const [name, value] of Object.entries(bunFetchApi)) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
