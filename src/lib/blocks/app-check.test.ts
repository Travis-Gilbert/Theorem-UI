// SOURCING: bun:test over the App type check (app-check.ts) with tsrs's Node
// build and the declarations from node_modules (test/blocks/check-library.ts).
import { describe, expect, test } from 'bun:test'
import { tsc } from '@tsrs/wasm'
import { generatedModule, GENERATED } from '../../../scripts/app-declarations'
import { checkLibraryFromDisk } from '../../../test/blocks/check-library'
import { typescriptApp } from '../../../test/blocks/typescript-app'
import { checkAppSources } from './app-check'
import { appSourcesOf } from './app-source'

const library = checkLibraryFromDisk()
const check = (files: Record<string, string>) =>
  checkAppSources(appSourcesOf(typescriptApp(files))!, tsc, library)

const TABLE = `import { useEffect, useState } from 'react'
import type { Org } from './types'

export function Table() {
  const [orgs, setOrgs] = useState<Array<Org>>([])
  useEffect(() => {
    let stop = () => {}
    void theorem.db('records').then((db) => {
      stop = db.subscribe<Array<{ id: string; properties: Record<string, unknown> }>>(
        { method: 'queryNodes', args: { label: 'Org' } },
        (nodes) => setOrgs(nodes.map((node) => ({ id: node.id, name: String(node.properties.name) }))),
      )
    })
    return () => stop()
  }, [])
  return (
    <table>
      <tbody>
        {orgs.map((org) => (
          <tr key={org.id} data-row-id={org.id}>
            <td>{org.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}`

const APP = {
  'main.tsx': `import { createRoot } from 'react-dom/client'
import * as d3 from 'd3'
import { Table } from './Table'
import './look.css'

await window.theorem.ready
console.log(d3.max([1, 2]))
createRoot(document.getElementById('root')!).render(<Table />)`,
  'Table.tsx': TABLE,
  'types.ts': 'export interface Org { id: string; name: string }',
  'look.css': 'table { width: 100% }',
}

describe('checking an App', () => {
  test('a correct App has no problems', async () => {
    const result = await check(APP)
    expect(result.problems).toEqual([])
    expect(result.memoryBytes).toBeGreaterThan(0)
  }, 120_000)

  test('a wrong field is a problem at its file, line and column', async () => {
    const result = await check({
      ...APP,
      'Table.tsx': TABLE.replace('<td>{org.name}</td>', '<td>{org.title}</td>'),
    })
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]).toMatchObject({
      kind: 'type',
      code: 'TS2339',
      file: 'Table.tsx',
      line: 21,
    })
    expect(result.problems[0]!.message).toContain("'title'")
    expect(result.problems[0]!.column).toBeGreaterThan(1)
  }, 120_000)

  test('a call the bridge does not have, or a wrong argument to one it has, is a problem', async () => {
    const result = await check({
      'main.ts': `const db = await theorem.db('records')
await db.upsert({ id: 'a' })
await db.neighbors({ nodeId: 'a', direction: 'sideways' })
await theorem.files.text(1)
const rows = await theorem.state('rows')
await rows.set('key')
export {}`,
    })
    expect(
      result.problems.map((problem) => [problem.line, problem.code]),
    ).toEqual([
      [2, 'TS2339'],
      [3, 'TS2322'],
      [4, 'TS2345'],
      [6, 'TS2554'],
    ])
  }, 120_000)

  test('a wrong prop to a component is a problem', async () => {
    const result = await check({
      'main.tsx': `function Label({ text }: { text: string }) { return <span>{text}</span> }
export const view = <Label text={3} />`,
    })
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]).toMatchObject({ file: 'main.tsx', line: 2 })
  }, 120_000)
})

test('the declarations for window.theorem are the ones its source gives', async () => {
  // Run `bun scripts/app-declarations.ts` after changing the bridge.
  expect(await Bun.file(GENERATED).text()).toBe(generatedModule())
}, 120_000)
