// SOURCING: bun:test over the root's lib/face through ./core
import { describe, expect, test } from 'bun:test'
import { POSE_LIVENESS, poseFor } from './poses'

describe("Theo's core on the phone", () => {
  test('the engine runs without a page and gives two eyes inside the visor', () => {
    for (const liveness of POSE_LIVENESS) {
      const pose = poseFor(liveness)
      expect(pose.outlines.length).toBeGreaterThanOrEqual(2)
      for (const outline of pose.outlines) {
        expect(outline).toHaveLength(48)
        for (let i = 0; i < outline.length; i += 2) {
          expect(Math.abs(outline[i]!)).toBeLessThanOrEqual(pose.width)
          expect(Math.abs(outline[i + 1]!)).toBeLessThanOrEqual(pose.height)
        }
      }
    }
  })

  test('a pose is the same every time it is made', () => {
    expect(poseFor('work')).toEqual(poseFor('work'))
  })

  test('working and asking do not look like resting', () => {
    const idle = JSON.stringify(poseFor('idle').outlines)
    expect(JSON.stringify(poseFor('work').outlines)).not.toBe(idle)
    expect(JSON.stringify(poseFor('ask').outlines)).not.toBe(idle)
  })
})
