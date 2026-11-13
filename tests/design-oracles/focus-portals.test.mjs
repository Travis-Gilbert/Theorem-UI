import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import { sampleFocusOutline } from '../../scripts/design-oracles/focus.mjs'
import { validatePortalEvidence } from '../../scripts/design-oracles/portals.mjs'

const box = { left: 8, top: 8, right: 28, bottom: 20, width: 20, height: 12 }
const outline = { width: 2, offset: 2, color: '#000000' }
const clip = { x: 0, y: 0, width: 36, height: 28 }
const reference = 4 * box.width + 4 * box.height

function frame(draw, color = 0) {
  const png = new PNG({ width: clip.width, height: clip.height })
  png.data.fill(255)
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const band =
        x >= 4 &&
        x < 32 &&
        y >= 4 &&
        y < 24 &&
        !(x >= 6 && x < 30 && y >= 6 && y < 22)
      if (!band || !draw(x, y)) continue
      const index = (y * png.width + x) * 4
      png.data.fill(color, index, index + 3)
    }
  }
  return png
}

test('measures actual qualifying area and rejects clipped or unchanged focus pixels', () => {
  const before = frame(() => false)
  const full = frame(() => true)
  const clipped = frame((x) => x < 18)
  expect(
    sampleFocusOutline(full, before, clip, box, outline).qualifyingAreaCssPx,
  ).toBeGreaterThanOrEqual(reference)
  expect(
    sampleFocusOutline(clipped, before, clip, box, outline).qualifyingAreaCssPx,
  ).toBeLessThan(reference)
  expect(
    sampleFocusOutline(full, full, clip, box, outline).visibleAreaCssPx,
  ).toBe(0)
})

test('visible paint with low focus-state contrast earns no qualifying area', () => {
  const gray = frame(() => true, 200)
  const result = sampleFocusOutline(
    gray,
    frame(() => false),
    clip,
    box,
    { ...outline, color: '#c8c8c8' },
  )
  expect(result.visibleAreaCssPx).toBeGreaterThan(0)
  expect(result.qualifyingAreaCssPx).toBe(0)
})

test('portal verification requires every engine, surface, state and named check', async () => {
  const evidence = JSON.parse(
    await readFile(
      new URL(
        '../../docs/plans/composable-appearance/evidence/sol-review.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  expect(validatePortalEvidence(evidence).status).toBe('pass')
  const removed = evidence.portals[0].rows.pop()
  expect(validatePortalEvidence(evidence).status).toBe('not-measurable')
  evidence.portals[0].rows.push(removed)
  delete removed.checks.density
  expect(validatePortalEvidence(evidence).status).toBe('not-measurable')
  removed.checks.density = false
  expect(validatePortalEvidence(evidence).status).toBe('fail')
})
