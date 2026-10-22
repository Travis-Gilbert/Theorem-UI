// Gives bun test a browser DOM, which Milkdown's editor view needs.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()
// happy-dom has no document.compatMode, and KaTeX (Crepe's math) refuses to
// render unless it reads standards mode.
Object.defineProperty(document, 'compatMode', { value: 'CSS1Compat' })
