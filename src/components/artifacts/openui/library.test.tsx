import { afterEach, describe, expect, test } from 'bun:test'
import { createParser } from '@openuidev/lang-core'
import { act } from 'react'
import { cleanup, render, waitFor } from '../../../../test/workspace'
import { useComposerReferences } from '@/components/chat/composer-references'
import { readArtifact } from '../artifact-model'
import type { TheoremArtifact } from '../artifact-model'
import { representationOf } from '../artifact-registry'
import { ArtifactView } from '../artifact-renderers'
import { EXAMPLES, GPU_WORKLOAD } from './examples'
import {
  LIBRARY_ID,
  LIBRARY_VERSION,
  artifactLibrary,
  libraryRecord,
} from './library'
import { locatorOf, selectionReference } from './selection'

afterEach(() => {
  cleanup()
  useComposerReferences.setState({ references: [] })
})

const parser = createParser(artifactLibrary.toJSONSchema(), 'Stack')

function artifact(
  program: string,
  library: { id: string; version: string } = {
    id: LIBRARY_ID,
    version: LIBRARY_VERSION,
  },
): TheoremArtifact {
  const read = readArtifact({
    artifactId: 'art_gpu',
    artifactRevision: 'rev_1',
    artifactKind: 'openui',
    rendererId: 'theorem-openui',
    contractVersion: 'theorem-artifact-v1',
    fallbackText: 'CPU or GPU',
    payload: { form: 'openui', title: 'CPU or GPU', library, program },
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
    expect(artifactLibrary.id).toBe('theorem-artifacts')
    expect(LIBRARY_VERSION).toMatch(/^\d+$/)
    expect(artifactLibrary.root).toBe('Stack')
  })

  test('has an example program for every component it offers at the top level', () => {
    const offered = Object.keys(artifactLibrary.components).filter(
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
    const schema = artifactLibrary.toJSONSchema()
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
    expect(reference?.location.resource).toEqual({
      kind: 'artifact',
      artifactId: 'art_gpu',
      revision: 'rev_1',
    })
    expect(JSON.parse(reference?.excerpt ?? '{}').repair.problems).toEqual(
      hint.problems,
    )
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

  test('a declared region marks the table rows inside it', async () => {
    const container = await show(EXAMPLES.LinkedTable)
    const inside = [
      ...container.querySelectorAll('[data-component="LinkedTable"] tr[data-in-region]'),
    ].map((row) => row.getAttribute('data-row-id'))
    expect(inside).toEqual(['1', '2', '3'])
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
    expect(reference?.location).toEqual({
      resource: { kind: 'artifact', artifactId: 'art_gpu', revision: 'rev_1' },
      revision: 'rev_1',
    })
    const { selection } = JSON.parse(reference?.excerpt ?? '{}')
    expect(selection.entityId).toBe('timeline:timeline/lane:GPU/stage:Transfer in')
    expect(selection.text).toContain('500 µs')
    expect(locatorOf(selection)).toEqual({
      kind: 'entity',
      entityId: 'timeline:timeline/lane:GPU/stage:Transfer in',
    })
  })

  test('clicking a table row selects rows, a table_rows locator', async () => {
    const container = await show(EXAMPLES.LinkedTable)
    await click(container.querySelector('tr[data-row-id="3"]')!)
    await click(button(container, 'Ask about selection')!)
    const [reference] = useComposerReferences.getState().references
    const { selection } = JSON.parse(reference?.excerpt ?? '{}')
    expect(selection.rowId).toBe('3')
    expect(selection.text).toContain('5.01 ms')
    expect(locatorOf(selection)).toEqual({ kind: 'table_rows', rowIds: ['3'] })
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

  test('the reference names the artifact revision the person saw', () => {
    const reference = selectionReference(
      { artifactId: 'a', revision: 'r2', title: 'T' },
      { text: 'GPU at 1M items', entityId: 'plot:p/x:1000000', entityLabel: '1M items' },
    )
    expect(reference).toEqual({
      label: 'T: 1M items',
      location: {
        resource: { kind: 'artifact', artifactId: 'a', revision: 'r2' },
        revision: 'r2',
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
    expect(record.components).toEqual(Object.keys(artifactLibrary.components))
    expect(record.callables).toContain('Range')
    expect(record.signatures.Stat).toMatch(/^Stat\(label/)
    expect(record.signatures.Range).toMatch(/^Range\(from/)
    expect(record.prompt).toContain('theorem-artifacts')
    expect(record.digest).toMatch(/^[0-9a-f]{64}$/)
    expect((await libraryRecord()).digest).toBe(record.digest)
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
