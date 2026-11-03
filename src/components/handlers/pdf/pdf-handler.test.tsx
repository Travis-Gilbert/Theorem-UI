// SOURCING: bun:test over the PDF handler's panel and card, rendered with
// React into happy-dom. pdf.js runs in this process, its worker on the main
// thread as react-pdf's worker entry sets it up, and draws on @napi-rs/canvas.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import { drawingOf, mockCanvas } from '../../../../test/canvas'
import { mockLayout } from '../../../../test/layout'
import {
  cleanup,
  fakeWorkspace,
  render,
  waitFor,
} from '../../../../test/workspace'

const PDF = await Bun.file(
  new URL(
    '../../../../test/fixtures/handlers/field-notes.pdf',
    import.meta.url,
  ),
).bytes()

const entry = (path: string): WorkspaceEntry => ({
  id: `vf_${path}`,
  path,
  kind: 'file',
  size: 1,
  mtimeMs: 1,
})

let undo: Array<() => void> = []
beforeAll(async () => {
  undo = [mockLayout(), mockCanvas()]
  // react-pdf's entry for pdf.js's worker on the main thread.
  await import('react-pdf/dist/pdf.worker.entry.js')
})
afterAll(() => {
  for (const fn of undo) fn()
  Reflect.deleteProperty(window, 'pdfjsWorker')
})
afterEach(cleanup)

const { PdfCard, PdfPanel } = await import('./pdf-handler')

/** Whether anything darker than paper was drawn on `canvas`. */
function hasInk(canvas: HTMLCanvasElement) {
  const drawing = drawingOf(canvas)
  if (!drawing) return false
  const { data } = drawing
    .getContext('2d')
    .getImageData(0, 0, drawing.width, drawing.height)
  for (let i = 0; i < data.length; i += 4) if (data[i]! < 128) return true
  return false
}

const drawn = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLCanvasElement>('canvas')].filter(
    (canvas) => canvas.style.visibility !== 'hidden',
  )

describe('PdfPanel', () => {
  test('draws each page with its text', async () => {
    const ws = fakeWorkspace({ 'notes.pdf': PDF })
    const { container } = await render(
      <PdfPanel
        client={ws.client}
        path="notes.pdf"
        entry={entry('notes.pdf')}
      />,
    )
    await waitFor(() => drawn(container).length === 2, { timeout: 5000 })
    expect(container.textContent).toContain('2 pages')
    const pages = [...container.querySelectorAll('[data-page-number]')]
    expect(pages.map((p) => p.getAttribute('data-page-number'))).toEqual([
      '1',
      '2',
    ])
    const text = await waitFor(() => {
      const layer = container.querySelector('.textLayer')?.textContent
      return layer?.includes('field') ? layer : null
    })
    expect(text.replace(/\s+/g, ' ')).toContain('Quarterly field notes')
    expect(drawn(container).every(hasInk)).toBe(true)
    // Fitted to the panel's 1600px, less its margins.
    expect(parseFloat(drawn(container)[0]!.style.width)).toBeCloseTo(1568, -1)
  })

  test('says so when the file is not a PDF', async () => {
    const ws = fakeWorkspace({ 'notes.pdf': 'not a pdf' })
    const { container } = await render(
      <PdfPanel
        client={ws.client}
        path="notes.pdf"
        entry={entry('notes.pdf')}
      />,
    )
    await waitFor(() => container.textContent.includes('not a PDF'), {
      timeout: 5000,
    })
    expect(container.querySelector('canvas')).toBeNull()
  })
})

describe('PdfCard', () => {
  test('is a picture of the first page', async () => {
    const ws = fakeWorkspace({ 'notes.pdf': PDF })
    const { container } = await render(
      <PdfCard
        client={ws.client}
        path="notes.pdf"
        entry={entry('notes.pdf')}
        zoom={0.5}
        selected={false}
      />,
    )
    const [canvas] = await waitFor(
      () => {
        const found = drawn(container)
        return found.length ? found : null
      },
      { timeout: 5000 },
    )
    expect(hasInk(canvas!)).toBe(true)
    expect(container.querySelectorAll('[data-page-number]')).toHaveLength(1)
    expect(container.querySelector('.textLayer')).toBeNull()
    expect(container.querySelector('.annotationLayer')).toBeNull()
  })
})
