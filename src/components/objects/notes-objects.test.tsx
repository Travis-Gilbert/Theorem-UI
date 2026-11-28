// SOURCING: bun:test mounting the Notes object views (library, inspector, class editor) in the CRM's router harness (components/crm/test-harness) with React into happy-dom. window.fetch is the in-memory register fixture (components/crm/fixture: data model, find_many with server filters and sorts, dataRecord, dataNeighborhood, declareSchema), as no Theorem is running. Synthetic records only
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import { act } from 'react'
import {
  buttonNamed,
  cleanup,
  click,
  waitFor,
} from '../../../test/blocks/render'
import {
  createFixtureServer,
  fixtureFetch,
  FIXTURE_TYPE,
} from '@/components/crm/fixture'
import { mountAt } from '@/components/crm/test-harness'
import { ClassEditor } from './class-editor'
import { ObjectInspector } from './object-inspector'
import { ObjectLibrary } from './object-library'

const page = (
  window as unknown as { happyDOM: { setURL: (url: string) => void } }
).happyDOM
// happy-dom lays nothing out, so here every box is a screen's size, as a
// browser pane would be, and keeps it (happy-dom's ResizeObserver reports
// every box as empty): the virtualized lists then have rows in view.
const SIZES = {
  clientWidth: 1024,
  clientHeight: 900,
  offsetWidth: 1024,
  offsetHeight: 900,
} as const
const realSizes = Object.keys(SIZES).map(
  (key) =>
    [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)] as const,
)
const realRect = HTMLElement.prototype.getBoundingClientRect
const realObserver = window.ResizeObserver
class StillObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeAll(() => {
  page.setURL('http://localhost:3000/')
  for (const [key, value] of Object.entries(SIZES))
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get: () => value,
    })
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1024,
      bottom: 900,
      width: 1024,
      height: 900,
    }) as DOMRect
  window.ResizeObserver = StillObserver
})
afterAll(() => {
  page.setURL('about:blank')
  for (const [key, descriptor] of realSizes)
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, key, descriptor)
    else
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key]
  HTMLElement.prototype.getBoundingClientRect = realRect
  window.ResizeObserver = realObserver
})

let server: ReturnType<typeof createFixtureServer>
const realFetch = window.fetch
beforeEach(() => {
  server = createFixtureServer()
  window.fetch = fixtureFetch(server)
})
afterEach(async () => {
  await cleanup()
  window.fetch = realFetch
})

const finds = () => server.state.verbs.filter((v) => v.verb === 'find_many')

const type = async (input: HTMLInputElement, value: string) =>
  act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

describe('a class library', () => {
  test('asks the register for one page, counted, and searches on the server', async () => {
    const view = await mountAt('/', () => (
      <ObjectLibrary scope={`class:${FIXTURE_TYPE.person}`} />
    ))
    await waitFor(() => view.container.textContent.includes('Noor'))
    const first = finds().at(-1)!
    expect(first.objectTypeId).toBe(FIXTURE_TYPE.person)
    expect(first.input.limit).toBe(60)
    expect(first.input.offset).toBe(0)
    // No other class was read to show this one.
    expect(new Set(finds().map((v) => v.objectTypeId))).toEqual(
      new Set([FIXTURE_TYPE.person]),
    )

    const search = view.container.querySelector<HTMLInputElement>(
      'input[type="search"], input[aria-label*="Search" i]',
    )!
    expect(search).toBeTruthy()
    await type(search, 'noo')
    await waitFor(() => !view.container.textContent.includes('Avery Quinn'))
    expect(finds().at(-1)!.input.filters).toEqual([
      { field_key: 'name', operator: 'icontains', value: 'noo' },
    ])
    expect(view.container.textContent).toContain('Noor')
  })
})

describe('the inspector', () => {
  test("lists a record's connections from the graph's own links", async () => {
    const view = await mountAt('/', () => (
      <ObjectInspector objectRef="record:Person/person:noor" />
    ))
    // Kiln Street Studio is linked through Noor's organization; the
    // workshop names Noor among its people, so it links in.
    const tab = await waitFor(() => buttonNamed(view.container, 'Connections'))
    await click(tab)
    await waitFor(() =>
      view.container.textContent.includes('Kiln Street Studio'),
    )
    await waitFor(() => view.container.textContent.includes('Glaze workshop'))
    // Read through the neighbourhood, not by listing every class.
    expect(finds()).toHaveLength(0)
  })
})

const dialog = () => document.querySelector('[role="dialog"]') ?? undefined
const field = (label: string) =>
  [...(dialog()?.querySelectorAll('label') ?? [])]
    .find((l) => l.textContent.trim().startsWith(label))
    ?.querySelector<HTMLInputElement>('input')
// A button's text may follow its glyph ("AaText").
const pressed = (text: string, root: ParentNode = document) =>
  [...root.querySelectorAll<HTMLElement>('button, [role^="menuitem"]')].find(
    (b) => b.textContent.trim().endsWith(text),
  )

describe('a new class', () => {
  test('is declared once, with a property and a relation to itself', async () => {
    const view = await mountAt('/', () => <ClassEditor classKey="new" />)
    await waitFor(() => view.container.textContent.includes('New object class'))
    await type(
      view.container.querySelector<HTMLInputElement>(
        'input[placeholder="Book"]',
      )!,
      'Reading note',
    )

    // A text property, written into the draft, not declared yet.
    await click(await waitFor(() => pressed('Add property')))
    await click(await waitFor(() => dialog() && pressed('Text', dialog())))
    await type((await waitFor(() => field('Name'))), 'Author')
    await click(pressed('Add field', dialog())!)
    await waitFor(() => view.container.textContent.includes('Author'))

    // A relation whose destination is the class being made.
    await click(pressed('Add property')!)
    await click(await waitFor(() => dialog() && pressed('Relation', dialog())))
    await type((await waitFor(() => field('Name'))), 'Related notes')
    await click(
      await waitFor(() => dialog() && pressed('Choose an object', dialog())),
    )
    await click(await waitFor(() => pressed('Reading notes')))
    await click(pressed('Add field', dialog())!)
    await waitFor(() => view.container.textContent.includes('Related notes'))
    expect(server.state.declares).toHaveLength(0)

    await click(pressed('Create class')!)
    await waitFor(() => server.state.declares.length === 1)
    const input = server.state.declares[0] as {
      name_singular: string
      fields: { key: string; field_type: Record<string, unknown> }[]
    }
    expect(input.name_singular).toBe('readingNote')
    const keys = input.fields.map((f) => f.key)
    expect(keys).toContain('author')
    const related = input.fields.find((f) => f.field_type.kind === 'relation')!
    expect(related.field_type.target_object_type_id).toBe(
      'schema:object-type:demo:reading_note',
    )
    expect(JSON.stringify(input)).not.toContain('theorem.notes:self')
  })
})
