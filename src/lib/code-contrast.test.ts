import { expect, test } from 'bun:test'
import { displayable, wcagContrast } from 'culori'
import { readableCodeColor } from './code-contrast'

test('syntax colors retain passing theme paint', () => {
  expect(readableCodeColor('#0550ae', '#ffffff')).toBe('#0550ae')
})

test('adjusts low-contrast syntax hues on actual built-in and custom backgrounds', () => {
  const background = '#c2bebb'
  const red = readableCodeColor('#cf222e', background)
  const blue = readableCodeColor('#0550ae', background)
  expect(red).not.toBe(blue)
  for (const [token, surface] of [
    [red, background],
    [blue, background],
    [readableCodeColor('#686868', '#282522'), '#282522'],
    [readableCodeColor('#cf222e', '#26394a'), '#26394a'],
    [readableCodeColor('#ffffff50', '#fafcff'), '#fafcff'],
  ] as const) {
    expect(displayable(token)).toBe(true)
    expect(wcagContrast(token, surface)).toBeGreaterThanOrEqual(4.5)
  }
})
