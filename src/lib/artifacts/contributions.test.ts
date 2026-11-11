// The cases are theorem-surface-contracts' own `resolve` tests
// (rustyredcore_THG/crates/theorem-surface-contracts/src/artifact.rs), so the
// UI selects a representation exactly as Theorem does.
import { describe, expect, test } from 'bun:test'
import {
  claims,
  contribution,
  live,
  presentation,
  readContribution,
  resolve,
  validateAll,
} from './contributions'
import type { ArtifactContribution, Availability } from './contributions'

const pdf = (): ArtifactContribution =>
  contribution('theorem.pdf', 'PDF', {
    kinds: ['pdf'],
    media: ['application/pdf'],
    presentations: [
      presentation('artifact_native', 'pdf.paper', [
        'landmark',
        'preview',
        'thing',
      ]),
      live(presentation('artifact_native', 'pdf.reader', ['interactive'])),
    ],
    locators: ['pdf'],
    caption: 'optional',
  })

const terminal = (): ArtifactContribution =>
  contribution('theorem.terminal', 'Terminal', {
    kinds: ['terminal'],
    presentations: [
      live(
        presentation('provider_native', 'terminal.live', [
          'thing',
          'interactive',
        ]),
      ),
      presentation('provider_native', 'terminal.buffer', ['preview', 'thing']),
    ],
  })

const mounted =
  (names: Array<string>) =>
  (renderer: string): Availability =>
    names.includes(renderer)
      ? { mounted: true }
      : { mounted: false, reason: `No ${renderer} in this build` }

describe('resolve', () => {
  test('the richest available rung wins and a missing live host keeps the preview', () => {
    const all = [pdf(), terminal()]
    expect(validateAll(all)).toBeUndefined()
    const subject = { kind: 'pdf' }

    const paper = resolve(
      subject,
      'thing',
      all,
      mounted(['pdf.paper', 'pdf.reader']),
    )
    expect(paper.rung).toBe('artifact_native')
    expect(paper.renderer).toBe('pdf.paper')
    expect(paper.session).toBe('none')
    expect(paper.cost).toBe('cache')
    expect(paper.passed).toEqual([])

    const fallback = resolve(
      subject,
      'interactive',
      all,
      mounted(['pdf.paper']),
    )
    expect(fallback.rung).toBe('artifact_native')
    expect(fallback.distance).toBe('thing')
    expect(fallback.renderer).toBe('pdf.paper')
    expect(fallback.passed[0]?.reason).toBe('No pdf.reader in this build')

    const card = resolve(subject, 'thing', all, mounted([]))
    expect(card.rung).toBe('theorem_card')
    expect(card.renderer).toBeUndefined()
    expect(card.passed[0]?.reason).toBe('No pdf.paper in this build')

    const other = resolve(
      { kind: 'decision' },
      'thing',
      all,
      mounted(['pdf.paper']),
    )
    expect(other).toEqual({
      rung: 'theorem_card',
      distance: 'thing',
      session: 'none',
      cost: 'cache',
      caption: 'never',
      locators: [],
      passed: [],
    })
  })

  test('a live provider costs a slot and its buffer preview does not', () => {
    const all = [terminal()]
    const both = mounted(['terminal.live', 'terminal.buffer'])
    const session = resolve({ kind: 'terminal' }, 'interactive', all, both)
    expect([session.session, session.cost]).toEqual(['live', 'live_slot'])
    const preview = resolve({ kind: 'terminal' }, 'preview', all, both)
    expect(preview.renderer).toBe('terminal.buffer')
    expect([preview.session, preview.cost]).toEqual(['none', 'cache'])
  })
})

test('media patterns match majors and ignore parameters', () => {
  const image = contribution('theorem.image', 'Image', {
    media: ['image/*'],
    presentations: [presentation('artifact_native', 'image', ['thing'])],
  })
  expect(
    claims(image.matches, {
      kind: 'file',
      mediaType: 'IMAGE/png; charset=binary',
    }),
  ).toBe(true)
  expect(
    claims(image.matches, { kind: 'file', mediaType: 'imagery/png' }),
  ).toBe(false)
  expect(claims(image.matches, { kind: 'file' })).toBe(false)
})

test('contributions refuse inconsistent declarations', () => {
  const card = contribution('x.card', 'Card', {
    kinds: ['x'],
    presentations: [presentation('theorem_card', 'card', ['thing'])],
  })
  expect(validateAll([card])).toEqual({
    code: 'contributed_card',
    id: 'x.card',
  })
  const costly = contribution('x.img', 'Image', {
    kinds: ['x'],
    presentations: [
      {
        ...presentation('artifact_native', 'img', ['thing']),
        cost: 'live_slot',
      },
    ],
  })
  expect(validateAll([costly])?.code).toBe('cost_mismatch')
  const unmatched = contribution('x', 'X', {
    presentations: [presentation('artifact_native', 'a', ['thing'])],
  })
  expect(validateAll([unmatched])?.code).toBe('no_matcher')
  expect(validateAll([pdf(), pdf()])?.code).toBe('duplicate_id')
})

test('contributions read from the manifest wire, with its defaults', () => {
  const wire = {
    id: 'theorem.pdf',
    label: 'PDF',
    matches: { objectKinds: ['pdf'], mediaTypes: ['application/pdf'] },
    presentations: [
      {
        distances: ['landmark', 'preview', 'thing'],
        rung: 'artifact_native',
        renderer: 'pdf.paper',
      },
      {
        distances: ['interactive'],
        rung: 'artifact_native',
        renderer: 'pdf.reader',
        session: 'live',
        cost: 'live_slot',
      },
    ],
    locators: ['pdf'],
    caption: 'optional',
  }
  expect(readContribution(wire)).toEqual(pdf())
  expect(readContribution({ ...wire, presentations: [{ rung: 'x' }] })).toBe(
    undefined,
  )
})
