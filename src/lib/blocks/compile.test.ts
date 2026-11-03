// SOURCING: bun:test over compile.ts.
import { describe, expect, test } from 'bun:test'
import pkg from '../../../package.json'
import {
  COMPILER_VERSION,
  CompileError,
  NOTEBOOK_KIT_VERSION,
  compileCell,
  compileKey,
} from './compile'

describe('compileCell', () => {
  test('TSX becomes a cell module with its inputs, outputs and traces', async () => {
    const cell = await compileCell(
      [
        '// uses: files.read("Data/habits.csv")',
        'import { useState } from "react"',
        'const rows: Array<{ done: boolean }> = await files.csv("Data/habits.csv")',
        'const done = rows.filter((row) => row.done).length + streak.days',
        'function Count() { const [n] = useState(done); return <b>{n}</b> }',
        'display(<Count />)',
      ].join('\n'),
    )
    expect(cell.inputs).toEqual(['streak'])
    expect(cell.builtins.sort()).toEqual(['__trace', 'display', 'files'])
    expect(cell.outputs).toEqual(
      expect.arrayContaining(['rows', 'done', 'Count']),
    )
    expect(cell.autodisplay).toBe(false)
    expect(cell.capabilities.read).toEqual(['Data/habits.csv'])
    expect(cell.code).toContain('__trace(3, {rows})')
    expect(cell.code).toContain('__trace(4, {done})')
    expect(cell.code).toContain('import("react/jsx-runtime")')
    expect(cell.code).toMatch(/^export const inputs = /)
    expect(cell.code).toContain('export default async (')
  })

  test('an expression is displayed and traced on its line', async () => {
    const cell = await compileCell('\n\nhabits.length * 2')
    expect(cell.autodisplay).toBe(true)
    expect(cell.inputs).toEqual(['habits'])
    expect(cell.code).toContain('__trace(3, null, (habits.length * 2))')
  })

  test('a default-exported component is rendered', async () => {
    const cell = await compileCell(
      'export default function Tool() { return <p>hi</p> }\nexport const size = 2',
    )
    expect(cell.code).toContain('__render(Tool)')
    expect(cell.code).not.toContain('export default function')
    expect(cell.outputs).toEqual(expect.arrayContaining(['Tool', 'size']))
    const anonymous = await compileCell('export default () => <p>hi</p>')
    expect(anonymous.code).toContain('__render(__default)')
    expect(anonymous.outputs).not.toContain('__default')
  })

  test('syntax errors carry their line', async () => {
    const error = await compileCell('const a = 1\nconst = 2').catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(CompileError)
    expect((error as CompileError).line).toBe(2)
  })

  test('the key covers the source, the compiler and the import map', async () => {
    const a = await compileCell('1 + 1')
    expect(a.key).toBe(await compileKey('1 + 1'))
    expect(a.key).not.toBe(await compileKey('1 + 2'))
    expect(a.sourceHash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.key).not.toBe(a.sourceHash)
  })

  test('the recorded notebook-kit version is the installed one', () => {
    expect(pkg.dependencies['@observablehq/notebook-kit']).toBe(
      NOTEBOOK_KIT_VERSION,
    )
    expect(COMPILER_VERSION).toContain(`sucrase@${pkg.dependencies.sucrase}`)
  })
})
