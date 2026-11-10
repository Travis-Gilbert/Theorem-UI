// An App's database, in a browser: a sandboxed App keeps graph records through
// window.theorem.db, a second view of it follows, the next revision of the
// App finds them, and so does the page after a reload.
//
//   bun run e2e:app-db
//
// It serves scripts/e2e/app-db/ with Vite and drives it in headless Chromium.
// No Theorem server is needed: the App's document id is given, not fetched.
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const root = resolve(import.meta.dirname, '../..')

/** Revision 1: a list, and a button that adds an organization. */
const LIST = `<!doctype html>
<meta name="theorem:uses" content='db("records")'>
<ul id="rows"></ul><button id="add">Add</button><p id="problem"></p>
<script>
  const names = ['Alder', 'Birch', 'Cedar', 'Dogwood']
  theorem.db('records').then((db) => {
    db.subscribe({ method: 'queryNodes', args: { label: 'Org' } }, (orgs) => {
      document.getElementById('rows').innerHTML = orgs
        .map((org) => org.properties.name).sort()
        .map((name) => '<li>' + name + '</li>').join('')
      document.body.dataset.count = String(orgs.length)
    })
    document.getElementById('add').onclick = async () => {
      const count = Number(document.body.dataset.count)
      try {
        await db.mutate({ upsertNodes: [
          { id: 'org:' + count, labels: ['Org'], properties: { name: names[count] } },
        ] })
      } catch (error) {
        document.getElementById('problem').textContent = error.code
      }
    }
  })
</script>`

/** Revision 2: the same records as a table, read with Cypher. */
const TABLE = `<!doctype html>
<meta name="theorem:uses" content='db("records")'>
<table><tbody id="rows"></tbody></table>
<script>
  theorem.db('records').then((db) => {
    db.subscribe(
      { method: 'query', args: { cypher: 'MATCH (o:Org) RETURN o.name AS name ORDER BY name' } },
      (result) => {
        document.getElementById('rows').innerHTML = result.rows
          .map(([name]) => '<tr><td>' + name + '</td></tr>').join('')
        document.body.dataset.count = String(result.rows.length)
      },
    )
  })
</script>`

/** An App that reaches for a database it did not declare. */
const UNDECLARED = `<!doctype html>
<meta name="theorem:uses" content='db("records")'>
<p id="problem"></p>
<script>
  theorem.db('other').then((db) => db.inspect()).catch((error) => {
    document.getElementById('problem').textContent = error.message
    document.body.dataset.count = 'refused'
  })
</script>`

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'warn',
  resolve: { tsconfigPaths: true },
  server: { host: '127.0.0.1', port: 0 },
})
await server.listen()
const { port } = server.httpServer.address()
const url = `http://127.0.0.1:${port}/scripts/e2e/app-db/index.html`

const checks = []
const check = (name, pass, detail) => {
  checks.push(pass)
  console.log(
    `${pass ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`,
  )
}

// E2E_CHROMIUM names a Chromium to run when the one playwright-core expects
// is not installed.
const browser = await chromium.launch({
  executablePath: process.env.E2E_CHROMIUM || undefined,
})
const page = await browser.newPage()
page.on('pageerror', (error) => console.log(`  [page error] ${error.message}`))

const load = async () => {
  await page.goto(url)
  await page.waitForFunction(() => 'oracle' in window)
}
const mount = (id, html, options) =>
  page.evaluate(
    ([i, h, o]) => window.oracle.mount(i, h, o),
    [id, html, options],
  )
const unmount = (id) => page.evaluate((i) => window.oracle.unmount(i), id)
const frame = (id) => page.frame({ name: id })
const rows = async (id, count) => {
  const app = frame(id)
  await app.waitForFunction(
    (wanted) => document.body.dataset.count === String(wanted),
    count,
    { timeout: 15_000 },
  )
  return app.$$eval('#rows li, #rows td', (cells) =>
    cells.map((cell) => cell.textContent),
  )
}

try {
  await load()
  await page.evaluate(() => window.oracle.clear())

  const started = Date.now()
  await mount('first', LIST, { documentId: 'app-1' })
  check(
    'an App with a declared database starts empty',
    (await rows('first', 0)).length === 0,
    {
      ms: Date.now() - started,
    },
  )
  check(
    'its frame is sandboxed without an origin of its own',
    (await page.$eval('iframe[name=first]', (el) =>
      el.getAttribute('sandbox'),
    )) === 'allow-scripts',
  )

  await mount('second', LIST, { documentId: 'app-1' })
  await frame('first').click('#add')
  await rows('first', 1)
  await frame('first').click('#add')
  check(
    'the App writes records',
    (await rows('first', 2)).join() === 'Alder,Birch',
  )
  check(
    'a second view of the App follows without a rebuild',
    (await rows('second', 2)).join() === 'Alder,Birch',
  )

  await unmount('first')
  await unmount('second')
  await mount('revised', TABLE, { documentId: 'app-1' })
  check(
    'the next revision of the App finds its records',
    (await rows('revised', 2)).join() === 'Alder,Birch',
  )

  await load()
  await mount('reloaded', TABLE, { documentId: 'app-1' })
  check(
    'they are there after the page is loaded again',
    (await rows('reloaded', 2)).join() === 'Alder,Birch',
  )

  await mount('saved', LIST, { documentId: 'app-1', writable: false })
  await rows('saved', 2)
  await frame('saved').click('#add')
  await frame('saved').waitForFunction(
    () => document.getElementById('problem').textContent !== '',
  )
  check(
    'a saved revision reads them and may not change them',
    (await frame('saved').textContent('#problem')) === 'read_only' &&
      (await rows('reloaded', 2)).length === 2,
  )

  await mount('other', LIST, { documentId: 'app-2' })
  check('another App has its own', (await rows('other', 0)).length === 0)

  await mount('undeclared', UNDECLARED, { documentId: 'app-1' })
  await rows('undeclared', 'refused')
  check(
    'a database that was not declared is refused',
    (await frame('undeclared').textContent('#problem')).includes(
      'db("other") was not declared',
    ),
  )

  await page.evaluate(async () => {
    for (const id of ['reloaded', 'saved', 'other', 'undeclared'])
      window.oracle.unmount(id)
  })
} finally {
  await browser.close()
  await server.close()
}

const passed = checks.filter(Boolean).length
console.log(`\n${passed} of ${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
