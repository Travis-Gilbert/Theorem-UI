import { afterEach, describe, expect, test } from 'bun:test'
import { createParser } from '@openuidev/lang-core'
import { QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, render, settle, waitFor } from '../../../../test/workspace'
import { useComposerReferences } from '@/components/chat/composer-references'
import { readArtifact } from '../artifact-model'
import type { TheoremArtifact } from '../artifact-model'
import { representationOf } from '../artifact-registry'
import { ArtifactView } from '../artifact-renderers'
import { EXAMPLES, GPU_WORKLOAD } from './examples'
import {
  LIBRARY_ID,
  LIBRARY_VERSION,
  RANGE_LIMIT,
  artifactLibrary,
  libraryRecord,
} from './library'
import { selectionReference } from './selection'

afterEach(() => {
  cleanup()
  useComposerReferences.setState({ references: [] })
})

const parser = createParser(artifactLibrary().toJSONSchema(), 'Stack')

function artifact(
  program: string,
  library: { id: string; version: string } = {
    id: LIBRARY_ID,
    version: LIBRARY_VERSION,
  },
  position = 1,
  documentId: string | null = 'doc_gpu',
): TheoremArtifact {
  const read = readArtifact({
    artifactId: 'art_gpu',
    artifactRevision: `rev_${position}`,
    artifactKind: 'openui',
    rendererId: 'theorem-openui',
    contractVersion: 'theorem-artifact-v1',
    fallbackText: 'CPU or GPU',
    payload: {
      documentId,
      revision: { position },
      form: 'openui',
      formVersion: 1,
      title: 'CPU or GPU',
      library,
      program,
    },
  })
  if (!read) throw new Error('the fixture part did not read')
  return read
}

async function show(program: string, library?: { id: string; version: string }) {
  const { container } = await render(
    <ArtifactView artifact={artifact(program, library)} distance="preview" latest />,
  )
  return container
}

/** Where a reference to the fixture's first revision points: its document, not the chat artifact id. */
const DOCUMENT_REVISION_1 = {
  resource: { kind: 'graph-object', objectId: 'doc_gpu', objectType: 'theorem.app' },
  revision: '1',
} as const

const button = (root: ParentNode, name: string | RegExp) =>
  [...root.querySelectorAll('button')].find((b) =>
    typeof name === 'string'
      ? (b.getAttribute('aria-label') ?? b.textContent) === name
      : name.test(b.getAttribute('aria-label') ?? b.textContent),
  )

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('theorem-artifacts library', () => {
  test('names itself and carries a version', () => {
    expect(artifactLibrary().id).toBe('theorem-artifacts')
    expect(LIBRARY_VERSION).toMatch(/^\d+$/)
    expect(artifactLibrary().root).toBe('Stack')
  })

  test('has an example program for every component it offers at the top level', () => {
    const offered = Object.keys(artifactLibrary().components).filter(
      (name) => !SUB_COMPONENTS.has(name),
    )
    expect(Object.keys(EXAMPLES).sort()).toEqual(offered.sort())
  })

  for (const [name, program] of Object.entries(EXAMPLES)) {
    test(`${name} parses from OpenUI Lang without errors and renders`, async () => {
      const parsed = parser.parse(program)
      expect(parsed.meta.errors).toEqual([])
      expect(parsed.meta.unresolved).toEqual([])
      expect(parsed.root).not.toBeNull()
      const container = await show(program)
      const shown = container.querySelector(`[data-component="${name}"]`)
      expect(shown).not.toBeNull()
      expect(container.querySelector('[data-slot="openui-problem"]')).toBeNull()
    })
  }

  test('the GPU workload composite parses and renders every part', async () => {
    const parsed = parser.parse(GPU_WORKLOAD)
    expect(parsed.meta.errors).toEqual([])
    expect(parsed.meta.unresolved).toEqual([])
    const container = await show(GPU_WORKLOAD)
    for (const part of ['Experiment', 'Slider', 'Toggle', 'Stat', 'Timeline', 'Plot', 'Callout'])
      expect(container.querySelector(`[data-component="${part}"]`)).not.toBeNull()
    expect(container.textContent).toContain('Illustrative')
    expect(container.textContent).toContain('Assumptions')
    expect(container.textContent).toContain('16 GB/s each way')
  })
})

const SUB_COMPONENTS = new Set([
  'Measure',
  'Lane',
  'Stage',
  'Axis',
  'Series',
  'Mark',
  'Column',
  'Step',
])

const STYLING = /^(color|colour|colors|palette|fill|stroke|background|bg|size|width|height|font|fontSize|fontWeight|weight|spacing|gap|padding|margin|className|class|style|variant|tone|theme|radius|border)$/i

describe('styling stays with the implementation', () => {
  test('no component or function takes a styling prop', () => {
    const schema = artifactLibrary().toJSONSchema()
    const names = [
      ...Object.values(schema.$defs ?? {}).flatMap((def) =>
        Object.keys((def as { properties?: object }).properties ?? {}),
      ),
      ...Object.values(schema.functions ?? {}).flatMap((fn) =>
        Object.keys((fn.params as { properties?: object }).properties ?? {}),
      ),
    ]
    expect(names.length).toBeGreaterThan(30)
    expect(names.filter((name) => STYLING.test(name))).toEqual([])
  })

  test('a styling argument is refused and reported against its statement', async () => {
    const program = `root = Stack([gpu])
gpu = Stat("GPU finishes", 1.4, "ms", "GPU", "note", "#ff0000")`
    const parsed = parser.parse(program)
    expect(parsed.meta.errors).toContainEqual(
      expect.objectContaining({ code: 'excess-args', statementId: 'gpu' }),
    )
    const container = await show(program)
    const problem = await waitFor(() =>
      container.querySelector('[data-slot="openui-problems"]'),
    )
    expect(problem.textContent).toContain('gpu')
    expect(container.querySelector('[style*="ff0000"]')).toBeNull()
  })
})

describe('problems come back as repair hints', () => {
  test('a parse error says what failed and offers the hint to the next turn', async () => {
    const container = await show('root = Stack([a\na = Stat("Speed", ')
    const problem = await waitFor(() =>
      container.querySelector('[data-slot="openui-problem"]'),
    )
    expect(problem.textContent).toContain("couldn't be read")
    const hint = JSON.parse(problem.getAttribute('data-repair-hint') ?? '{}')
    expect(hint.library).toEqual({ id: LIBRARY_ID, version: LIBRARY_VERSION })
    expect(hint.problems.length).toBeGreaterThan(0)
    await click(button(problem, 'Ask to fix')!)
    const [reference] = useComposerReferences.getState().references
    expect(reference?.location).toEqual(DOCUMENT_REVISION_1)
    expect(JSON.parse(reference?.excerpt ?? '{}').repair.problems).toEqual(
      hint.problems,
    )
  })

  test('a part with no document to point at shows its problem without an ask', async () => {
    const { container } = await render(
      <ArtifactView
        artifact={artifact('root = Stack([a\na = Stat("Speed", ', undefined, 1, null)}
        distance="preview"
        latest
      />,
    )
    const problem = await waitFor(() =>
      container.querySelector('[data-slot="openui-problem"]'),
    )
    expect(problem.textContent).toContain("couldn't be read")
    expect(button(problem, 'Ask to fix')).toBeUndefined()
  })

  test('a library version this build does not render is named, with a hint', async () => {
    const container = await show(EXAMPLES.Stat, {
      id: LIBRARY_ID,
      version: '99',
    })
    const problem = container.querySelector('[data-slot="openui-problem"]')
    expect(problem?.textContent).toContain('theorem-artifacts 99')
    expect(problem?.textContent).toContain(`version ${LIBRARY_VERSION}`)
    const hint = JSON.parse(problem?.getAttribute('data-repair-hint') ?? '{}')
    expect(hint.problems[0].code).toBe('library-version')
    expect(container.querySelector('[data-component="Stat"]')).toBeNull()
  })
})

describe('local interaction', () => {
  test('a control recomputes the declared model with no activation step', async () => {
    const container = await show(EXAMPLES.Toggle)
    const transfer = () =>
      container.querySelector('[data-component="Stat"] [data-slot="value"]')
        ?.textContent
    expect(transfer()).toBe('1 ms')
    await click(container.querySelector('[role="switch"]')!)
    await waitFor(() => transfer() === '0 ms')
  })

  test('a slider moves its $variable and every expression over it', async () => {
    const container = await show(EXAMPLES.Experiment)
    const copy = () =>
      container.querySelector('[data-component="Stat"] [data-slot="value"]')
        ?.textContent
    expect(copy()).toBe('500 µs')
    const thumb = container.querySelector<HTMLInputElement>(
      '[data-component="Slider"] input[type="range"]',
    )!
    await act(async () => {
      thumb.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
      )
    })
    await waitFor(() => copy() === '50 ms')
  })

  test('a log slider stays inside its range after rounding to three digits', async () => {
    const container = await show(`root = Stack([n, scaled])
$n = 100
n = Slider("Count", $n, 1.234, 9999, "items", "log")
scaled = Stat("Count in thousandths", $n * 1000)`)
    const thumb = container.querySelector<HTMLInputElement>(
      '[data-component="Slider"] input[type="range"]',
    )!
    const press = (key: string) =>
      act(async () => {
        thumb.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      })
    const shown = () =>
      container.querySelector('[data-component="Slider"] output')?.textContent
    const scaled = () =>
      container.querySelector('[data-component="Stat"] [data-slot="value"]')
        ?.textContent
    // 9999 rounds to 10000 at three digits; the bound value stops at the top.
    await press('End')
    await waitFor(() => shown() === '9999 items')
    // 1.234 rounds to 1.23 at three digits; the bound value stops at the bottom.
    await press('Home')
    await waitFor(() => scaled() === '1234')
  })

  test('a declared region marks the table rows inside it', async () => {
    const container = await show(EXAMPLES.LinkedTable)
    const inside = [
      ...container.querySelectorAll('[data-component="LinkedTable"] tr[data-in-region]'),
    ].map((row) => row.getAttribute('data-row-id'))
    expect(inside).toEqual(['1', '2', '3'])
  })

  test('a plot that starts with nothing to draw can be brushed once values arrive', async () => {
    const container = await show(`root = Stack([measured, plot])
$measured = false
measured = Toggle("Measured", $measured)
plot = Plot(Axis("Size", "items", "log"), Axis("Time", "ms", "log"), [Series("CPU", [1, 10, 100], $measured ? [1, 2, 3] : [0, 0, 0])])`)
    expect(container.textContent).toContain('No values to plot.')
    await click(container.querySelector('[role="switch"]')!)
    await waitFor(() =>
      container.querySelector('[data-component="Plot"] svg .overlay'),
    )
  })

  test('Range refuses a count no chart needs and says how many it makes', async () => {
    const container = await show(`root = Stack([plot])
sizes = @Range(1, 100, 5000)
plot = Plot(Axis("Size", "items"), Axis("Time", "ms"), [Series("CPU", sizes, sizes)])`)
    expect(container.textContent).toContain(`at most ${RANGE_LIMIT}`)
  })

  test('the contribution renders inline with no live session', () => {
    const representation = representationOf(artifact(EXAMPLES.Stat), 'preview')
    expect(representation.renderer).toBe('theorem-openui')
    expect(representation.session).toBe('none')
    expect(representation.locators).toEqual(['entity', 'table_rows'])
    expect(representationOf(artifact(EXAMPLES.Stat), 'interactive').session).toBe(
      'none',
    )
  })
})

describe('selection reaches the next turn', () => {
  test('clicking a timeline stage selects that entity and asks about it', async () => {
    const container = await show(EXAMPLES.Timeline)
    const stage = container.querySelector(
      '[data-entity-label="GPU · Transfer in"]',
    )!
    await click(stage)
    await click(button(container, 'Ask about selection')!)
    const [reference] = useComposerReferences.getState().references
    expect(reference?.label).toBe('CPU or GPU: GPU · Transfer in')
    expect(reference?.location).toEqual(DOCUMENT_REVISION_1)
    // The host reads entityId, with entityLabel, as an entity locator.
    const { selection } = JSON.parse(reference?.excerpt ?? '{}')
    expect(selection.entityId).toBe('timeline:timeline/lane:GPU/stage:Transfer in')
    expect(selection.entityLabel).toBe('GPU · Transfer in')
    expect(selection.text).toContain('500 µs')
  })

  test('a new revision lets go of the selection made on the one before', async () => {
    const view = (position: number) => (
      <ArtifactView
        artifact={artifact(EXAMPLES.Timeline, undefined, position)}
        distance="preview"
        latest
      />
    )
    const { container, root, queryClient } = await render(view(1))
    await click(container.querySelector('[data-entity-label="GPU · Transfer in"]')!)
    expect(container.querySelector('[data-slot="openui-selection"]')).not.toBeNull()
    act(() =>
      root.render(
        <QueryClientProvider client={queryClient}>{view(2)}</QueryClientProvider>,
      ),
    )
    await settle()
    expect(container.querySelector('[data-slot="openui-selection"]')).toBeNull()
  })

  test('changing a control lets go of a selection that named the values before it', async () => {
    const container = await show(GPU_WORKLOAD)
    const selection = () =>
      container.querySelector('[data-slot="openui-selection"]')
    await click(container.querySelector('[data-entity-label="GPU · Transfer in"]')!)
    expect(selection()?.textContent).toContain('GPU · Transfer in')
    // Data already on the GPU: the transfer the selection named is now zero.
    await click(container.querySelector('[role="switch"]')!)
    await waitFor(() => selection() === null)
  })

  test('clicking a table row selects rows, a table_rows locator', async () => {
    const container = await show(EXAMPLES.LinkedTable)
    await click(container.querySelector('tr[data-row-id="3"]')!)
    await click(button(container, 'Ask about selection')!)
    const [reference] = useComposerReferences.getState().references
    // With no entityId, the host reads rowId as a table_rows locator.
    const { selection } = JSON.parse(reference?.excerpt ?? '{}')
    expect(selection.rowId).toBe('3')
    expect(selection.entityId).toBeUndefined()
    expect(selection.text).toContain('5.01 ms')
    expect(
      container.querySelector('tr[data-row-id="3"]')?.getAttribute('aria-selected'),
    ).toBe('true')
  })

  test('a row selected in one table leaves a matching row in another unselected', async () => {
    const table = (cpu: number) =>
      `LinkedTable([Column("year", "Year"), Column("cpu", "CPU", "ms", "CPU")], [{id: 1, year: 2024, cpu: ${cpu}}, {id: 2, year: 2025, cpu: ${cpu * 2}}])`
    const container = await show(`root = Stack([before, after])
before = ${table(5)}
after = ${table(3)}`)
    await click(container.querySelector('tr[data-row-id="1"]')!)
    expect(container.querySelectorAll('tr[aria-selected="true"]').length).toBe(1)
    await click(button(container, 'Ask about selection')!)
    const [reference] = useComposerReferences.getState().references
    const { selection } = JSON.parse(reference?.excerpt ?? '{}')
    expect(selection).toEqual({
      text: 'Year 2024, CPU 5 ms',
      rowId: '1',
      entityLabel: 'Year 2024',
    })
  })

  test('a plot point selected from the keyboard is an entity with its values', async () => {
    const container = await show(EXAMPLES.Plot)
    const plot = container.querySelector<SVGElement>('[data-component="Plot"] svg')!
    for (const key of ['End', 'Enter'])
      await act(async () => {
        plot.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      })
    await click(button(container, 'Ask about selection')!)
    const [reference] = useComposerReferences.getState().references
    const { selection } = JSON.parse(reference?.excerpt ?? '{}')
    expect(selection.entityId).toBe('plot:plot/x:100000000')
    expect(selection.text).toMatch(/CPU .+ GPU /)
  })

  test('the reference names the document revision the person saw, as the App path does', () => {
    const reference = selectionReference(
      { documentId: 'doc_a', position: 2, title: 'T' },
      { text: 'GPU at 1M items', entityId: 'plot:p/x:1000000', entityLabel: '1M items' },
    )
    expect(reference).toEqual({
      label: 'T: 1M items',
      location: {
        resource: { kind: 'graph-object', objectId: 'doc_a', objectType: 'theorem.app' },
        revision: '2',
      },
      excerpt: JSON.stringify({
        selection: {
          text: 'GPU at 1M items',
          entityId: 'plot:p/x:1000000',
          entityLabel: '1M items',
        },
      }),
    })
  })
})

describe('the published record', () => {
  test('carries instructions, names, signatures and version under a stable digest', async () => {
    const record = await libraryRecord()
    expect(record.libraryId).toBe('theorem-artifacts')
    expect(record.version).toBe(LIBRARY_VERSION)
    expect(record.components).toEqual(Object.keys(artifactLibrary().components))
    expect(record.callables).toContain('Range')
    expect(record.signatures.Stat).toMatch(/^Stat\(label/)
    expect(record.signatures.Range).toMatch(/^Range\(from/)
    expect(record.prompt).toContain('theorem-artifacts')
    expect(record.digest).toMatch(/^[0-9a-f]{64}$/)
    expect((await libraryRecord()).digest).toBe(record.digest)
  })

  test('offers a short example the host can lint, one the prompt does not already hold', async () => {
    const { example, prompt } = await libraryRecord()
    const parsed = parser.parse(example)
    expect(parsed.meta.errors).toEqual([])
    expect(parsed.meta.unresolved).toEqual([])
    expect(example.split('\n').length).toBeLessThanOrEqual(10)
    expect(prompt).not.toContain(example)
    const container = await show(example)
    expect(container.querySelector('[data-component="Experiment"]')).not.toBeNull()
  })
})

describe('reading the wire', () => {
  test('an openui part reads its form, library and program', () => {
    const read = artifact('root = Stack([])')
    expect(read.form).toBe('openui')
    expect(read.library).toEqual({ id: LIBRARY_ID, version: LIBRARY_VERSION })
    expect(read.content).toBe('root = Stack([])')
    expect(read.title).toBe('CPU or GPU')
  })
})
