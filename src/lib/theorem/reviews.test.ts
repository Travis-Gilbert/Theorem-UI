import { describe, expect, it } from 'bun:test'
import { answerBody } from './reviews'

describe('answerBody', () => {
  it('leaves out the line naming the review', () => {
    const text = 'Review: Layout (chatreview_sha256:c2)\n\nPicked Close up.\n\nKeep the minimap.'
    expect(answerBody(text)).toBe('Picked Close up.\n\nKeep the minimap.')
  })

  it('leaves other text alone', () => {
    expect(answerBody('A Review: of the header')).toBe('A Review: of the header')
  })
})
