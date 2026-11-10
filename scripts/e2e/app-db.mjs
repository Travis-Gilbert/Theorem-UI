// An App's database, in a browser: a sandboxed App keeps graph records through
// window.theorem.db, a second view of it follows, the next revision of the
// App finds them, and so does the page after a reload.
//
//   bun run e2e:app-db            the page as the dev server serves it
//   bun run e2e:app-db --built    the page built as for production
//
// It serves scripts/e2e/app-db/ with Vite and drives it in headless Chromium.
// No Theorem server is needed: the App's document id is given, not fetched.
import { chromium } from 'playwright-core'
import { servePage } from './harness.mjs'

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

/**
 * An App written the way Theorem's builder is told to (builder_app.md in the
 * Theorem repo): render from subscribe, change one field by reading the node
 * and spreading it, link with an edge, seed only when nothing is there.
 */
const AS_BUILT = `<!doctype html>
<meta name="theorem:uses" content='db("records")'>
<ul id="rows"></ul><p id="links"></p><p id="found"></p><p id="problem"></p>
<script>
(async () => {
  await window.theorem.ready
  const db = await window.theorem.db('records')
  const showError = (error) => { document.getElementById('problem').textContent = error.code }
  db.subscribe({ method: 'queryNodes', args: { label: 'Org' } }, (orgs) => {
    document.getElementById('rows').innerHTML = orgs
      .map((org) => org.properties.name).sort()
      .map((name) => '<li>' + name + '</li>').join('')
    document.body.dataset.count = String(orgs.length)
  }, showError)
  db.subscribe({ method: 'neighbors', args: { nodeId: 'org:a', direction: 'out', edgeType: 'FUNDS' } },
    (links) => { document.getElementById('links').textContent = links.map((link) => link.nodeId).join() },
    showError)
  try {
    if ((await db.queryNodes({ label: 'Org', limit: 1 })).length === 0)
      await db.mutate({ upsertNodes: [
        { id: 'org:a', labels: ['Org'], properties: { id: 'org:a', name: 'Alder', area: 'housing' } },
        { id: 'org:b', labels: ['Org'], properties: { id: 'org:b', name: 'Birch', area: 'transit' } },
      ] })
    const org = await db.getNode('org:b')
    await db.mutate({ upsertNodes: [{ ...org, properties: { ...org.properties, name: 'Beech' } }] })
    await db.mutate({ upsertEdges: [{ id: 'funds:org:a:org:b', from: 'org:a', to: 'org:b', type: 'FUNDS', properties: {} }] })
    const result = await db.query('MATCH (o:Org) WHERE o.area = $area RETURN o.name AS name', { area: 'transit' })
    document.getElementById('found').textContent = JSON.stringify([result.columns, result.rows, (await db.getNode('org:b')).properties.area])
  } catch (error) { showError(error) }
})()
</script>`

const served = await servePage('app-db')
const { url } = served
console.log(
  served.built ? 'Serving a production build.' : 'Serving with the dev server.',
)

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
const context = await browser.newContext()
const page = await context.newPage()
page.on('pageerror', (error) => console.log(`  [page error] ${error.message}`))

// Each helper works on the first tab unless it is given another.
const load = async (tab = page) => {
  await tab.goto(url)
  await tab.waitForFunction(() => 'oracle' in window)
}
const mount = (id, html, options, tab = page) =>
  tab.evaluate(([i, h, o]) => window.oracle.mount(i, h, o), [id, html, options])
const unmount = (id) => page.evaluate((i) => window.oracle.unmount(i), id)
const frame = (id, tab = page) => tab.frame({ name: id })
const rows = async (id, count, tab = page) => {
  const app = frame(id, tab)
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

  await mount('built', AS_BUILT, { documentId: 'app-3' })
  await frame('built').waitForFunction(
    () => document.getElementById('found').textContent !== '',
  )
  const built = await rows('built', 2)
  check(
    "the calls Theorem's builder is told to use work as it is told",
    built.join() === 'Alder,Beech' &&
      (await frame('built').textContent('#links')) === 'org:b' &&
      (await frame('built').textContent('#found')) ===
        '[["name"],[["Beech"]],"transit"]' &&
      (await frame('built').textContent('#problem')) === '',
    {
      rows: built,
      links: await frame('built').textContent('#links'),
      found: await frame('built').textContent('#found'),
      problem: await frame('built').textContent('#problem'),
    },
  )
  await unmount('built')
  await mount('rebuilt', AS_BUILT, { documentId: 'app-3' })
  await frame('rebuilt').waitForFunction(
    () => document.getElementById('found').textContent !== '',
  )
  check(
    'and it does not reseed what is already there',
    (await rows('rebuilt', 2)).join() === 'Alder,Beech',
  )

  // A second tab of the same browser, showing the same App.
  const tab = await context.newPage()
  tab.on('pageerror', (error) => console.log(`  [page error] ${error.message}`))
  await load(tab)
  await mount('elsewhere', LIST, { documentId: 'app-1' }, tab)
  check(
    'a second tab showing the App reads the same records',
    (await rows('elsewhere', 2, tab)).join() === 'Alder,Birch',
  )
  await frame('elsewhere', tab).click('#add')
  check(
    'a write in one tab reaches the other',
    (await rows('elsewhere', 3, tab)).join() === 'Alder,Birch,Cedar' &&
      (await rows('reloaded', 3)).join() === 'Alder,Birch,Cedar',
  )
  // The first tab, which held the database's file, goes away.
  await page.close()
  await frame('elsewhere', tab).click('#add')
  check(
    'the App keeps working in the tab that is left',
    (await rows('elsewhere', 4, tab)).join() === 'Alder,Birch,Cedar,Dogwood',
  )
} finally {
  await browser.close()
  await served.close()
}

const passed = checks.filter(Boolean).length
console.log(`\n${passed} of ${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
