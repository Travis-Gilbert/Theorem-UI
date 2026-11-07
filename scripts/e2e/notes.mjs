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
const shot = (name) => page.screenshot({ path: join(SHOTS, `notes-${name}.png`) })
const notesNav = page.getByRole('navigation', { name: 'Notes' })
const trashNav = page.getByRole('navigation', { name: 'Trash' })
const editor = page.locator('.ProseMirror').first()
const documentIdOf = () => decodeURIComponent(new URL(page.url()).pathname.split('/')[2] ?? '')

const readDocument = async (documentId) => {
  const response = await context.request.get(
    `${UI}/api/documents/v2/documents/${encodeURIComponent(documentId)}?schema=${SCHEMA}`,
    READ,
  )
  return { status: response.status(), body: response.ok() ? await response.json() : undefined }
}

// The mode is on the rail and opens with a way to start a note.
await page.getByRole('heading', { name: 'Notes' }).or(page.getByText('Notes', { exact: true })).first().waitFor(READ)
check('the rail offers Notes', (await page.getByRole('button', { name: 'Notes' }).count()) > 0)
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
await editor.click()
await page.keyboard.type(`# ${TITLE}`)
await page.keyboard.press('Enter')
await page.keyboard.type(BODY)
// The panel says "Saved" before anything is typed too, so wait on Theorem itself.
const savedBy = Date.now() + 60_000
let saved = await readDocument(documentId)
while (!saved.body?.markdownProjection?.includes(BODY) && Date.now() < savedBy) {
  await page.waitForTimeout(500)
  saved = await readDocument(documentId)
}
check('Theorem holds the note', saved.status === 200, String(saved.status))
check('with the text that was typed', Boolean(saved.body?.markdownProjection?.includes(BODY)))
check('titled from its first line', saved.body?.summary?.title === TITLE, saved.body?.summary?.title)
await notesNav.getByRole('button', { name: TITLE }).waitFor(READ)
check('the list shows it by its title', true)
await shot('written')

// After a reload the editor shows what Theorem kept.
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 })
await editor.getByText(BODY).waitFor(READ)
check('a reload shows the saved text', true)

// Search finds it by what it says.
await page.getByLabel('Search notes').fill(MARK)
await notesNav.getByRole('button', { name: TITLE }).waitFor(READ)
check('search finds the note', (await notesNav.getByRole('button').count()) >= 1)
await page.getByLabel('Search notes').fill('')

// The Trash takes it and gives it back.
await page.getByRole('button', { name: 'Move to Trash' }).click()
await page.waitForURL((url) => url.pathname === '/notes', READ)
await notesNav.getByRole('button', { name: TITLE }).waitFor({ state: 'detached', ...READ })
check('a trashed note leaves the list', true)
const retired = await readDocument(documentId)
check('Theorem reports it retired', retired.body?.summary?.retired === true, JSON.stringify(retired.body?.summary?.retired))
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
