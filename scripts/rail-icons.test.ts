import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { LAYERS_DIR, railFiles, split } from './rail-icons.mjs'

test('the committed rail layers are what the script makes', async () => {
  for (const [file, bytes] of await railFiles()) {
    const committed = await readFile(new URL(file, LAYERS_DIR))
    expect(committed.equals(Buffer.from(bytes)), file).toBe(true)
  }
})

test('a pixel splits into the layers by its colour, and they sum to its alpha', () => {
  const outline = split([25, 25, 25, 255])
  expect(outline.line).toBeCloseTo(1)
  const white = split([255, 255, 255, 255])
  expect(white.paper).toBeCloseTo(1)
  expect(white.line).toBe(0)
  const cyan = split([102, 225, 255, 255])
  expect(cyan.accent).toBeCloseTo(1)
  const edge = split([140, 140, 140, 255])
  expect(edge.line + edge.accent + edge.tint + edge.paper).toBeCloseTo(1)
  const faint = split([25, 25, 25, 128])
  expect(faint.line + faint.accent + faint.tint + faint.paper).toBeCloseTo(
    128 / 255,
  )
})
