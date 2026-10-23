// Gives bun test a browser DOM, which Milkdown's editor view needs.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

// Keep Bun's own Fetch API and the streams its bodies use. happy-dom's Request
// and Headers drop the headers a browser may not set (Host, Cookie, Origin,
// Set-Cookie), and the desktop server's tests send and read exactly those.
const bunFetchApi = {
  fetch,
  Request,
  Response,
  Headers,
  TransformStream,
  WritableStream,
}

GlobalRegistrator.register()
// happy-dom has no document.compatMode, and KaTeX (Crepe's math) refuses to
// render unless it reads standards mode.
Object.defineProperty(document, 'compatMode', { value: 'CSS1Compat' })

for (const [name, value] of Object.entries(bunFetchApi)) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}
