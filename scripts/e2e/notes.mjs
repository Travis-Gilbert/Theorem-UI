// Notes mode, whole, as the test account against a real Theorem: a new note is a
// Theorem document, what is typed is saved and read back after a reload, search
// finds it, the Trash takes it and gives it back.
//
// Start the stack first (bun run e2e:stack) with a server that serves the
// Documents v2 retirements and restorations routes.
import { join } from 'node:path'
import { UI } from './config.mjs'
import { READ, SHOTS, check, finish, log, open } from './lib.mjs'

const SCHEMA = 'theorem-document/2'
const MARK = `heron-${Date.now().toString(36)}`
const TITLE = `Field notes ${MARK}`
const BODY = 'The heron came back to the pond.'

const session = await open('/notes')
const { page, context } = session
const shot = (name) =>
  page.screenshot({ path: join(SHOTS, `notes-${name}.png`) })
const notesNav = page.getByRole('navigation', { name: 'Notes' })
const trashNav = page.getByRole('navigation', { name: 'Trash' })
const editor = page.locator('.ProseMirror').first()
const documentIdOf = () =>
  decodeURIComponent(new URL(page.url()).pathname.split('/')[2] ?? '')

const readDocument = async (documentId) => {
  const response = await context.request.get(
    `${UI}/api/documents/v2/documents/${encodeURIComponent(documentId)}?schema=${SCHEMA}`,
    READ,
  )
  return {
    status: response.status(),
    body: response.ok() ? await response.json() : undefined,
  }
}

// The mode is on the rail and opens with a way to start a note.
await page
  .getByRole('heading', { name: 'Notes' })
  .or(page.getByText('Notes', { exact: true }))
  .first()
  .waitFor(READ)
check(
  'the rail offers Notes',
  (await page.getByRole('button', { name: 'Notes' }).count()) > 0,
)
const start = page.getByRole('button', { name: 'New note' }).last()
await start.waitFor(READ)
await shot('empty')

// A new note is a Theorem document, and what is typed is saved.
await start.click()
await page.waitForURL(/\/notes\/[^/]+$/, READ)
const documentId = documentIdOf()
log('created', documentId)
check('a new note opens at its own address', documentId.length > 0, documentId)
await editor.waitFor(READ)
const openMark = () =>
  notesNav
    .locator('button[aria-current="page"] [data-mark]')
    .getAttribute('data-mark', READ)
await editor.click()
await page.keyboard.type(`# ${TITLE}`)
await page.keyboard.press('Enter')
await page.keyboard.type(BODY)
// The panel says "Saved" before anything is typed too, so wait on Theorem itself.
const savedBy = Date.now() + 60_000
let saved = await readDocument(documentId)
while (
  !saved.body?.markdownProjection?.includes(BODY) &&
  Date.now() < savedBy
) {
  await page.waitForTimeout(500)
  saved = await readDocument(documentId)
}
check('Theorem holds the note', saved.status === 200, String(saved.status))
check(
  'with the text that was typed',
  Boolean(saved.body?.markdownProjection?.includes(BODY)),
)
check(
  'titled from its first line',
  saved.body?.summary?.title === TITLE,
  saved.body?.summary?.title,
)
await notesNav.getByRole('button', { name: TITLE }).waitFor(READ)
check('the list shows it by its title', true)
const panelTitle = page.locator('[data-slot="notes-panel-title"]')
check(
  "the panel's heading is the open note's name",
  (await panelTitle.textContent())?.trim() === TITLE,
  await panelTitle.textContent(),
)

// The rows sit under section headings a size up and semibold, and the person
// can rename a heading by double-clicking it.
const sections = () =>
  notesNav.locator('[data-slot="notes-section"]').allTextContents()
check(
  'the list is split under section headings',
  JSON.stringify((await sections()).slice(-2)) ===
    JSON.stringify(['Notes', 'Agents']),
  JSON.stringify(await sections()),
)
const type = await page.evaluate(() => {
  const heading = document.querySelector('[data-slot="notes-section"] button')
  const rowTitle = document.querySelector('nav li button span')
  const look = (el) => el && getComputedStyle(el)
  return {
    heading: look(heading)?.fontSize,
    weight: look(heading)?.fontWeight,
    row: look(rowTitle)?.fontSize,
  }
})
check(
  'headings are 1.5px larger than rows, and semibold',
  parseFloat(type.heading) - parseFloat(type.row) === 1.5 &&
    type.weight === '600',
  JSON.stringify(type),
)
const RENAMED = `Loose pages ${MARK}`
await notesNav
  .locator('[data-slot="notes-section"]')
  .getByRole('button', { name: 'Notes', exact: true })
  .dblclick()
await page.getByLabel('Section name').fill(RENAMED)
await page.keyboard.press('Enter')
check(
  'double-clicking a heading renames it',
  (await sections()).includes(RENAMED),
  JSON.stringify(await sections()),
)
const settledBy = Date.now() + 30_000
let settled = await openMark()
while (settled !== 'written' && Date.now() < settledBy) {
  await page.waitForTimeout(250)
  settled = await openMark()
}
check('and, saved, as a written page', settled === 'written', settled)
// Written into again, its row says so until Theorem has it. A local Theorem
// saves fast, so every mark the row shows while typing is recorded.
await notesNav.evaluate((nav) => {
  const seen = new Set()
  const record = () => {
    const mark = nav
      .querySelector('button[aria-current="page"] [data-mark]')
      ?.getAttribute('data-mark')
    if (mark) seen.add(mark)
  }
  new MutationObserver(record).observe(nav, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-mark', 'aria-current'],
  })
  record()
  window.__noteMarks = seen
})
await editor.click()
await page.keyboard.press('End')
await page.keyboard.type(' It stayed.')
// The editor reports its text a moment after the keys.
await page
  .waitForFunction(() => window.__noteMarks.has('editing'), null, {
    timeout: 10_000,
  })
  .catch(() => undefined)
const marks = await page.evaluate(() => [...window.__noteMarks])
check(
  'a note being written says so in the list',
  marks.includes('editing'),
  marks.join(', '),
)
const againBy = Date.now() + 30_000
while ((await openMark()) !== 'written' && Date.now() < againBy)
  await page.waitForTimeout(250)
await shot('written')

// What agents wrote waits in its own folder after the person's notes, in the
// complement of the person's folder colour.
const agentFolder = notesNav.getByRole('button', { name: 'Agent notes' })
await agentFolder.waitFor(READ)
const after = await notesNav.evaluate((nav) => {
  const buttons = [...nav.querySelectorAll('button')]
  const folder = buttons.findIndex(
    (button) => button.textContent?.trim() === 'Agent notes',
  )
  return folder === buttons.length - 1
})
check('the Agent notes folder comes after the notes', after)
await agentFolder.click()
check('it opens', (await agentFolder.getAttribute('aria-expanded')) === 'true')
const agentRows = await context.request.get(
  `${UI}/api/documents/v2/documents?schema=${SCHEMA}&limit=5&includeAgentEncoded=true&origin=agent_encoded`,
  READ,
)
const agentPage = agentRows.ok() ? await agentRows.json() : undefined
check(
  'Theorem lists agent memory alone',
  agentRows.ok() &&
    agentPage.documents.every((row) => row.origin.kind === 'agent_encoded'),
  String(agentRows.status()),
)
if (agentPage?.documents?.length) {
  await notesNav
    .getByRole('button', {
      name: agentPage.documents[0].title || 'Untitled note',
    })
    .first()
    .waitFor(READ)
  check('the folder shows what agents wrote', true)
  const agentMark = await notesNav
    .getByRole('button', {
      name: agentPage.documents[0].title || 'Untitled note',
    })
    .first()
    .locator('[data-mark]')
    .getAttribute('data-mark')
  check(
    "an agent's note carries the agent's mark",
    agentMark === 'agent' || agentMark === 'copied',
    agentMark,
  )
}
const colours = await page.evaluate(() => {
  const fill = (selector) => {
    const mark = document.querySelector(selector)
    return mark ? getComputedStyle(mark).fill : undefined
  }
  return {
    person: fill('svg.fill-folder'),
    agent: fill('svg.fill-folder-agent'),
  }
})
check(
  "the agent folder is not the colour of the person's folders",
  Boolean(colours.agent) && colours.agent !== colours.person,
  JSON.stringify(colours),
)
await shot('agent-folder')
await agentFolder.click()

// After a reload the editor shows what Theorem kept.
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 })
await editor.getByText(BODY).waitFor(READ)
check('a reload shows the saved text', true)

// The tools sit in one row under the heading: New note, New folder, Sort,
// and Search last, resting as its icon until it is used.
const tools = page.getByRole('toolbar', { name: 'Notes tools' })
const toolOrder = await tools.evaluate((bar) =>
  [...bar.querySelectorAll('button, input')].map(
    (el) =>
      el.getAttribute('aria-label') ||
      el.querySelector('[data-slot]')?.textContent ||
      el.textContent?.trim() ||
      el.tagName,
  ),
)
check(
  'the toolbar runs New note, New folder, Sort, Search',
  JSON.stringify(toolOrder) ===
    JSON.stringify(['New note', 'New folder', 'Sort', 'Search notes']),
  JSON.stringify(toolOrder),
)
const searchBox = page.locator('[data-slot="aui_thread-list-search"]')
const restWidth = (await searchBox.boundingBox())?.width ?? 0
await page.getByLabel('Search notes').focus()
await page.waitForTimeout(500)
const openWidth = (await searchBox.boundingBox())?.width ?? 0
check(
  'search rests as its icon and springs open when used',
  restWidth < 40 && openWidth > restWidth * 3,
  `${restWidth} -> ${openWidth}`,
)

// Search finds it by what it says.
await page.getByLabel('Search notes').fill(MARK)
await notesNav.getByRole('button', { name: TITLE }).waitFor(READ)
check(
  'search finds the note',
  (await notesNav.getByRole('button').count()) >= 1,
)
await page.getByLabel('Search notes').fill('')
await page.getByLabel('Search notes').blur()

// Sort lists the notes by last edit, creation or title, and keeps the choice.
const looseTitles = () =>
  notesNav.evaluate((nav) =>
    [
      ...nav.querySelectorAll(
        'section[data-section-id="notes"] > div > ul > li button',
      ),
    ].map((b) =>
      b.textContent.replace(/\s*\((saving|not saved)\)$/, '').trim(),
    ),
  )
const sortBy = async (label) => {
  await page.getByRole('button', { name: 'Sort', exact: true }).click()
  await page.getByRole('menuitemradio', { name: label }).click()
  await page.waitForTimeout(800)
}
await sortBy('A to Z')
const byTitle = await looseTitles()
const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
})
check(
  'A to Z lists the notes by title',
  byTitle.length > 1 &&
    byTitle.every(
      (t, i) => i === 0 || collator.compare(byTitle[i - 1], t) <= 0,
    ),
  byTitle.slice(0, 5).join(' | '),
)
await shot('sorted')
await sortBy('Date created')
check(
  'date created puts the newest note first',
  (await looseTitles())[0] === TITLE,
  (await looseTitles())[0],
)
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 })
await notesNav.getByRole('button', { name: TITLE }).waitFor(READ)
await page.getByRole('button', { name: 'Sort', exact: true }).click()
check(
  'the order chosen is kept after a reload',
  (await page
    .getByRole('menuitemradio', { name: 'Date created' })
    .getAttribute('aria-checked')) === 'true',
)
await page.getByRole('menuitemradio', { name: 'Recently edited' }).click()
check(
  'and so is the name given to a heading',
  (await sections()).includes(RENAMED),
)
const sectionHeading = (name) =>
  notesNav
    .locator('[data-slot="notes-section"]')
    .getByRole('button', { name, exact: true })
const menuOn = async (name, item) => {
  await sectionHeading(name).click({ button: 'right' })
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}
await menuOn(RENAMED, 'Rename section')
await page.getByLabel('Section name').fill('')
await page.keyboard.press('Enter')
check(
  'an emptied name keeps the one the section had',
  (await sections()).includes(RENAMED),
  JSON.stringify(await sections()),
)
await menuOn(RENAMED, 'Rename section')
await page.getByLabel('Section name').fill('Notes')
await page.keyboard.press('Enter')
check(
  'Rename section in the right-click menu renames it',
  (await sections()).includes('Notes'),
  JSON.stringify(await sections()),
)

// Sections are the person's own: made from the right-click menu, filled by
// dragging, folded away, moved, and deleted without losing a note. Earlier
// runs leave many folders and notes behind, so Folders is folded first and
// the new section made under it, where both stay in view.
const until = async (test) => {
  const by = Date.now() + 30_000
  while (!(await test()) && Date.now() < by) await page.waitForTimeout(500)
  return test()
}
const dragOnto = async (what, where) => {
  const from = await what.boundingBox()
  const to = await where.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    from.x + from.width / 2,
    from.y + from.height / 2 + 12,
    {
      steps: 4,
    },
  )
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  })
  await page.mouse.up()
}
const READING = `Reading ${MARK}`
await sectionHeading('Folders').click()
await menuOn('Folders', 'New section')
await page.getByLabel('Section name').fill(READING)
await page.keyboard.press('Enter')
const order0 = await sections()
check(
  'New section makes a section after the one right-clicked',
  order0.indexOf(READING) === order0.indexOf('Folders') + 1,
  JSON.stringify(order0),
)
// A locator inside has: is read from the section, so it names the heading alone.
const reading = notesNav.locator('section', {
  has: page.getByRole('button', { name: READING, exact: true }),
})
await dragOnto(
  notesNav.getByRole('button', { name: TITLE }),
  sectionHeading(READING),
)
check(
  'a note dragged onto a section sits in it',
  await until(
    async () =>
      (await reading.getByRole('button', { name: TITLE }).count()) === 1,
  ),
)
await sectionHeading(READING).click()
check(
  'clicking a heading folds its rows away',
  await until(
    async () =>
      (await reading.getByRole('button', { name: TITLE }).count()) === 0 &&
      (await sectionHeading(READING).getAttribute('aria-expanded')) === 'false',
  ),
)
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 })
await sectionHeading(READING).waitFor(READ)
check(
  'the section, its note and its folding are kept after a reload',
  (await sectionHeading(READING).getAttribute('aria-expanded')) === 'false',
)
// The arrangement is kept in Theorem, not in this browser: it is there with
// the page's own storage cleared, and in another browser signed in to the
// account.
const layout = await context.request.get(
  `${UI}/api/documents/v2/layouts/notes?schema=${SCHEMA}`,
  READ,
)
check(
  'Theorem holds the section in the account layout',
  layout.ok() &&
    (await layout.json()).layout?.sections.some((s) => s.name === READING),
  String(layout.status()),
)
await page.evaluate(() => window.localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 })
await sectionHeading(READING).waitFor(READ)
check(
  'with this browser storage cleared the section is still there, folded',
  (await sectionHeading(READING).getAttribute('aria-expanded')) === 'false',
)
const { cookies } = await context.storageState()
const elsewhere = await session.browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
  storageState: { cookies, origins: [] },
})
const there = await elsewhere.newPage()
await there.goto(`${UI}/notes`, {
  waitUntil: 'domcontentloaded',
  timeout: 120_000,
})
const thereHeading = there
  .getByRole('navigation', { name: 'Notes' })
  .locator('[data-slot="notes-section"]')
  .getByRole('button', { name: READING, exact: true })
await thereHeading.waitFor(READ)
check(
  'another browser signed in to the account shows the same section, folded',
  (await thereHeading.getAttribute('aria-expanded')) === 'false',
)
await elsewhere.close()
await sectionHeading(READING).click()
await reading.getByRole('button', { name: TITLE }).waitFor(READ)
check('clicking it again opens it on the note', true)
await dragOnto(sectionHeading(READING), sectionHeading('Folders'))
check(
  'a section dragged by its heading moves to that place',
  await until(async () => (await sections())[0] === READING),
  JSON.stringify(await sections()),
)
await shot('sections')
await menuOn(READING, 'Delete section')
check(
  'deleting a section puts its note back under Notes',
  await until(
    async () =>
      !(await sections()).includes(READING) &&
      (await notesNav
        .locator('section[data-section-id="notes"]')
        .getByRole('button', { name: TITLE })
        .count()) === 1,
  ),
  JSON.stringify(await sections()),
)
await sectionHeading('Folders').click()
check(
  'Folders opens again',
  await until(
    async () =>
      (await sectionHeading('Folders').getAttribute('aria-expanded')) ===
      'true',
  ),
)

// A folder is a Theorem collection: the plus folder button makes one, a note
// dragged onto it moves in, and Move to takes it back out.
const collections = async () => {
  const response = await context.request.get(
    `${UI}/api/documents/v2/collections?schema=${SCHEMA}`,
    READ,
  )
  return response.ok() ? (await response.json()).collections : []
}
const holding = async (name) =>
  (await collections()).find((collection) => collection.name === name)
    ?.documentIds ?? []
const FOLDER = `Field trips ${MARK}`
await page.getByRole('button', { name: 'New folder' }).click()
await page.getByLabel('Folder name').fill(FOLDER)
await page.keyboard.press('Enter')
const folderRow = notesNav.getByRole('button', { name: FOLDER })
await folderRow.waitFor(READ)
check(
  'the plus folder button makes a folder in Theorem',
  Boolean(
    await until(async () =>
      (await collections()).some((c) => c.name === FOLDER),
    ),
  ),
)
const noteRow = notesNav.getByRole('button', { name: TITLE })
await dragOnto(noteRow, folderRow)
check(
  'a note dragged onto the folder moves into it',
  await until(async () => (await holding(FOLDER)).includes(documentId)),
)
await noteRow.waitFor({ state: 'detached', ...READ })
check('a closed folder hides its notes', true)
await folderRow.click()
await noteRow.waitFor(READ)
check('the folder opens on the note', true)
await page.waitForTimeout(600)
await shot('folder')
await page.getByRole('button', { name: 'Move to', exact: true }).click()
await page.getByRole('menuitemradio', { name: 'No folder' }).click()
check(
  'Move to takes it back to the top level',
  await until(async () => !(await holding(FOLDER)).includes(documentId)),
)
await folderRow.click()
await noteRow.waitFor(READ)
check('and the list shows it loose again', true)

// Folders nest. New folder inside makes one under the folder right-clicked, a
// folder dragged onto a section comes out to the top and dragged onto another
// folder goes in, Rename folder renames it, and deleting a folder moves what
// it held up into the folder around it.
const folderNamed = async (name) =>
  (await collections()).find((collection) => collection.name === name)
const INNER = `Herons ${MARK}`
const outerId = (await folderNamed(FOLDER))?.collectionId
await folderRow.click({ button: 'right' })
await page
  .getByRole('menuitem', { name: 'New folder inside', exact: true })
  .click()
await page.getByLabel('Folder name').fill(INNER)
await page.keyboard.press('Enter')
const innerRow = notesNav.getByRole('button', { name: INNER })
await innerRow.waitFor(READ)
check(
  'New folder inside makes a folder in Theorem inside the one right-clicked',
  await until(async () => (await folderNamed(INNER))?.parentId === outerId),
  JSON.stringify(await folderNamed(INNER)),
)
await dragOnto(innerRow, sectionHeading('Folders'))
check(
  'a folder dragged onto a section comes out to the top level',
  await until(async () => (await folderNamed(INNER))?.parentId === null),
)
await dragOnto(innerRow, folderRow)
check(
  'a folder dragged onto another folder goes inside it',
  await until(async () => (await folderNamed(INNER))?.parentId === outerId),
)
const RENAMED_FOLDER = `Egrets ${MARK}`
await innerRow.click({ button: 'right' })
await page.getByRole('menuitem', { name: 'Rename folder', exact: true }).click()
await page.getByLabel('Folder name').fill(RENAMED_FOLDER)
await page.keyboard.press('Enter')
const renamedRow = notesNav.getByRole('button', { name: RENAMED_FOLDER })
await renamedRow.waitFor(READ)
check(
  'Rename folder renames the collection in Theorem',
  await until(async () => Boolean(await folderNamed(RENAMED_FOLDER))),
)
await dragOnto(notesNav.getByRole('button', { name: TITLE }), renamedRow)
check(
  'a note dragged onto the inner folder moves into it',
  await until(async () =>
    ((await folderNamed(RENAMED_FOLDER))?.documentIds ?? []).includes(
      documentId,
    ),
  ),
)
await shot('nested-folders')
await renamedRow.click({ button: 'right' })
await page.getByRole('menuitem', { name: 'Delete folder', exact: true }).click()
check(
  'deleting the inner folder moves its note up into the folder around it',
  await until(
    async () =>
      !(await folderNamed(RENAMED_FOLDER)) &&
      (await holding(FOLDER)).includes(documentId),
  ),
)
await renamedRow.waitFor({ state: 'detached', ...READ })
check('and its row leaves the list', true)
await page.getByRole('button', { name: 'Move to', exact: true }).click()
await page.getByRole('menuitemradio', { name: 'No folder' }).click()
check(
  'Move to takes the note back to the top level',
  await until(async () => !(await holding(FOLDER)).includes(documentId)),
)

// The Trash takes it and gives it back.
await page.getByRole('button', { name: 'Move to Trash' }).click()
await page.waitForURL((url) => url.pathname === '/notes', READ)
await notesNav
  .getByRole('button', { name: TITLE })
  .waitFor({ state: 'detached', ...READ })
check('a trashed note leaves the list', true)
const retired = await readDocument(documentId)
check(
  'Theorem reports it retired',
  retired.body?.summary?.retired === true,
  JSON.stringify(retired.body?.summary?.retired),
)
await page.getByRole('button', { name: 'Trash', exact: true }).click()
await trashNav.getByRole('button', { name: TITLE }).click(READ)
await page.getByText('In the Trash. Restore it to edit it.').waitFor(READ)
check('a trashed note opens read only', true)
await shot('trashed')
await page.getByRole('button', { name: 'Restore' }).click()
await page.getByRole('button', { name: 'Move to Trash' }).waitFor(READ)
const restored = await readDocument(documentId)
check('Theorem reports it restored', restored.body?.summary?.retired === false)
await page.getByRole('button', { name: 'Back to notes' }).click()
await notesNav.getByRole('button', { name: TITLE }).waitFor(READ)
check('a restored note is back in the list', true)
await shot('restored')

await finish(session)
