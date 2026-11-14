// Organizing the sidebar by drag, as the test account, in Firefox: a thread
// dragged onto a project lands there and the page stays, a plain click still
// opens a thread, and a dragged project keeps its new place after a reload.
//
// Firefox, because the page reloaded only there: it sends the click that ends
// a drag to the dragged row's link. Start the stack first (bun run e2e:stack).
import { join } from 'node:path'
import { SHOTS, check, finish, open } from './lib.mjs'

const PROJECTS = ['Sidebar drag one', 'Sidebar drag two']
const ROW = 'a[href^="/c/"]'

const session = await open('/', { browser: 'firefox' })
const { page } = session
const shot = (name) =>
  page.screenshot({ path: join(SHOTS, `sidebar-${name}.png`) })

const list = page.getByRole('navigation', { name: 'Threads' })
const named = (title) => ({ name: title, exact: true })
// A project's row links to its home; its folder is the disclosure beside it.
const header = (title) => list.getByRole('link', named(title))
const disclosure = (title) =>
  list.getByRole('button', { name: new RegExp(`^(Show|Hide) sessions in ${title}$`) })
const place = (title) =>
  list
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', named(title)) })
const opened = async (title) => {
  if ((await disclosure(title).getAttribute('aria-expanded')) !== 'true')
    await disclosure(title).click()
}
/** The middle of something, once it has stopped moving: a project opens with a spring. */
const centre = async (locator) => {
  await locator.hover({ trial: true })
  const box = await locator.boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
/** Press at one point, move past the few pixels that start a drag, release at another. */
async function drag(from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 4, from.y + 6, { steps: 2 })
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.waitForTimeout(300)
  await page.mouse.up()
}
// A mark a page load would wipe.
const mark = () => page.evaluate(() => void (window.__stayed = true))
const stayed = () =>
  page.evaluate(() => window.__stayed === true).catch(() => false)

await list.getByText('Projects', { exact: true }).waitFor({ timeout: 120_000 })
for (const title of PROJECTS) {
  if (await header(title).count()) continue
  await list.getByRole('button', { name: 'New project' }).click()
  // Typed key by key: this Firefox does not tell React about a filled value.
  await page.getByLabel('Project name').pressSequentially(title)
  await page.keyboard.press('Enter')
  await header(title).waitFor()
}
for (const title of PROJECTS) await opened(title)

// The thread goes to whichever test project it is not in, so only the first
// run has to make one.
const [one, two] = PROJECTS
const from = (await place(two).locator(ROW).count()) ? two : one
const to = from === one ? two : one
if (!(await place(from).locator(ROW).count())) {
  await list.getByRole('button', { name: `New session in ${from}` }).click()
  const box = page.getByRole('textbox').first()
  await box.click()
  await box.pressSequentially('Reply with the single word ok.')
  await page.keyboard.press('Enter')
  await place(from).locator(ROW).first().waitFor({ timeout: 120_000 })
  // The row is renamed and re-sorted as its first run ends.
  await page.waitForTimeout(8_000)
  await opened(from)
}
const row = place(from).locator(ROW).first()
const href = await row.getAttribute('href')

await mark()
const address = page.url()
await drag(await centre(row), await centre(header(to)))
await place(to)
  .locator(`a[href="${href}"]`)
  .waitFor({ timeout: 30_000 })
  .catch(() => {})
// A reload would be under way by now.
await page.waitForTimeout(1_500)
check('a dragged thread does not reload the page', await stayed())
check('a dragged thread leaves the address alone', page.url() === address)
check(
  `the thread is under "${to}"`,
  (await place(to).locator(`a[href="${href}"]`).count()) === 1,
)
check(
  `the thread has left "${from}"`,
  (await place(from).locator(`a[href="${href}"]`).count()) === 0,
)
await shot('thread-moved')

// From the new chat page, so the click has somewhere to go. The button beside
// Search: a chat being started has a "New thread" row of its own in the tree.
await page
  .getByRole('list')
  .filter({ has: page.getByRole('button', { name: /^Search/ }) })
  .getByRole('button', named('New thread'))
  .click()
await page.waitForURL((url) => url.pathname === '/')
await place(to).locator(`a[href="${href}"]`).click()
await page.waitForURL((url) => url.pathname !== '/').catch(() => {})
check(
  'a plain click opens the thread',
  new URL(page.url()).pathname === new URL(href, page.url()).pathname,
)
check('and opens it without a page load', await stayed())

// The upper of the two projects goes below the lower.
const order = async () => {
  const tops = await Promise.all(
    PROJECTS.map(async (title) => (await header(title).boundingBox()).y),
  )
  return tops[0] < tops[1] ? PROJECTS : [...PROJECTS].reverse()
}
const [upper, lower] = await order()
const under = await place(lower).boundingBox()
const grip = await centre(header(upper))
await drag(grip, { x: grip.x, y: under.y + under.height - 4 })
await page.waitForTimeout(600)
check(
  `"${upper}" was dragged below "${lower}"`,
  (await order()).join() === [lower, upper].join(),
)
check('a dragged project does not reload the page', await stayed())
await page.reload({ waitUntil: 'domcontentloaded' })
await header(lower).waitFor({ timeout: 120_000 })
check(
  'the projects keep their order after a reload',
  (await order()).join() === [lower, upper].join(),
)
await opened(to)
check(
  'and the thread is still where it was dropped',
  (await place(to).locator(`a[href="${href}"]`).count()) === 1,
)
await shot('after-reload')

await finish(session)
