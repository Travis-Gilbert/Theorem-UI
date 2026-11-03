// Renders the page once at build time so join.theorem.rs serves complete HTML;
// the client bundle then hydrates it.
import { readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const { render } = (await import(`${root}.prerender/entry-server.js`)) as {
  render: () => string
}

const page = `${root}dist/index.html`
const template = await readFile(page, 'utf8')
if (!template.includes('<!--app-->'))
  throw new Error('dist/index.html has no <!--app--> slot')
await writeFile(page, template.replace('<!--app-->', render()))
await rm(`${root}.prerender`, { recursive: true, force: true })
console.log('prerendered dist/index.html')
