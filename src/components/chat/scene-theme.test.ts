// SOURCING: bun:test over the pure token mapping; the browser's resolved values are given as strings
import { expect, test } from 'bun:test'
import { sceneThemeOf } from './scene-theme'

const light: Record<string, string> = {
  'surface-artifact': 'rgb(255, 255, 255)',
  'surface-raised': 'oklch(0.97 0.004 60)',
  ink: 'rgb(28, 25, 23)',
  'ink-muted': 'rgb(120, 113, 108)',
  'line-separator': 'rgba(28, 25, 23, 0.12)',
  primary: 'oklch(0.55 0.14 32)',
  'primary-foreground': 'rgb(255, 255, 255)',
  success: 'rgb(20, 130, 120)',
  warning: 'rgb(190, 140, 30)',
  destructive: 'color(srgb 0.8 0.2 0.2)',
}

const fonts: Record<string, string> = {
  'font-sans': '"IBM Plex Sans Variable", ui-sans-serif, sans-serif',
  'font-mono': '"JetBrains Mono Variable", ui-monospace, monospace',
}

const read = (colours: Record<string, string>) => ({
  colour: (name: string) => colours[name] ?? '',
  font: (name: string) => fonts[name] ?? '',
})

test('the conversation’s tokens arrive as sRGB colours the page can parse', () => {
  const theme = sceneThemeOf(read(light))
  expect(theme).toMatchObject({
    colorScheme: 'light',
    background: 'rgb(255, 255, 255)',
    foreground: 'rgb(28, 25, 23)',
    border: 'rgba(28, 25, 23, 0.12)',
    accentForeground: 'rgb(255, 255, 255)',
    danger: 'rgb(204, 51, 51)',
    fontFamily: fonts['font-sans'],
    monoFamily: fonts['font-mono'],
  })
  // oklch() and color() are resolved to rgb(), which d3-color and canvas read.
  for (const key of ['surface', 'accent'] as const)
    expect(theme[key]).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
})

test('a dark surface gives a dark scheme', () => {
  const theme = sceneThemeOf(
    read({ ...light, 'surface-artifact': 'oklch(0.22 0.005 60)' }),
  )
  expect(theme.colorScheme).toBe('dark')
})

test('a token the browser could not resolve is left for the page to fill', () => {
  const theme = sceneThemeOf(read({ ...light, primary: '', 'surface-artifact': 'none' }))
  expect(theme.accent).toBeUndefined()
  expect(theme.background).toBeUndefined()
  expect(theme.colorScheme).toBeUndefined()
  expect(theme.foreground).toBe('rgb(28, 25, 23)')
})
